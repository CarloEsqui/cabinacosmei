import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, like, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  productos,
  tiposProducto,
  proveedores,
  lotes,
  entradasInventario,
  salidasInventario,
  movimientos,
} from "../db/schema";
import { obtenerConfig } from "./config";
import { registrarAccion } from "./bitacora";
import { eliminarOFallarConHistorial } from "./errores";
import { fechaLocalIso } from "../../shared/fechas";
import type { EntradaInput, SalidaInput, MovimientosFiltro, LoteInput } from "../../shared/schemas";
import type { ProductoConStock, Lote, MovimientoRow, Semaforo } from "../../shared/types";

function calcularSemaforo(
  stockTotal: number,
  umbralCritico: number,
  umbralBajo: number,
  stockMinimoManual: number | null,
): Semaforo {
  // El mínimo manual de un producto es su propio umbral de "crítico" (más preciso que el
  // umbral genérico), no de "bajo": ese producto en particular necesita reponerse ya al llegar
  // a esa cantidad.
  const criticoEfectivo = stockMinimoManual ?? umbralCritico;
  if (stockTotal <= criticoEfectivo) return "critico";
  if (stockTotal <= umbralBajo) return "bajo";
  return "adecuado";
}

// ---------------------------------------------------------------------------
// Folios y números de lote correlativos (automáticos, para no depender de que el
// usuario los teclee bien). Mismo patrón que el código de cliente (CL-0001) o el SKU.
// ---------------------------------------------------------------------------

// Estructural, no nominal: acepta tanto `db` como el `tx` de una transacción.
interface DbConSelect {
  select: ReturnType<typeof getDb>["select"];
}

function siguienteCorrelativo(valores: (string | null)[], prefijo: string): string {
  let maxN = 0;
  for (const v of valores) {
    const match = v?.match(/-(\d+)$/);
    if (match) maxN = Math.max(maxN, Number(match[1]));
  }
  return `${prefijo}-${String(maxN + 1).padStart(4, "0")}`;
}

function generarFolioEntrada(db: DbConSelect): string {
  const filas = db
    .select({ folio: entradasInventario.folio })
    .from(entradasInventario)
    .where(like(entradasInventario.folio, "E-%"))
    .all();
  return siguienteCorrelativo(filas.map((f) => f.folio), "E");
}

function generarFolioSalida(db: DbConSelect): string {
  const filas = db
    .select({ folio: salidasInventario.folio })
    .from(salidasInventario)
    .where(like(salidasInventario.folio, "S-%"))
    .all();
  return siguienteCorrelativo(filas.map((f) => f.folio), "S");
}

function generarNumeroLote(db: DbConSelect): string {
  const filas = db
    .select({ numeroLote: lotes.numeroLote })
    .from(lotes)
    .where(like(lotes.numeroLote, "L-%"))
    .all();
  return siguienteCorrelativo(filas.map((f) => f.numeroLote), "L");
}

// ---------------------------------------------------------------------------
// Resumen de inventario por producto
// ---------------------------------------------------------------------------

export async function resumenInventario(): Promise<ProductoConStock[]> {
  const db = getDb();
  const config = await obtenerConfig();

  const filas = db
    .select({
      producto: productos,
      tipoNombre: tiposProducto.nombreTipo,
      proveedorNombre: proveedores.nombreComercial,
      stockTotal: sql<number>`COALESCE(SUM(CASE WHEN ${lotes.estado} = 'activo' THEN ${lotes.cantidadDisponible} ELSE 0 END), 0)`,
      proximaCaducidad: sql<string | null>`MIN(CASE WHEN ${lotes.cantidadDisponible} > 0 AND ${lotes.estado} = 'activo' THEN ${lotes.fechaCaducidad} END)`,
    })
    .from(productos)
    .leftJoin(tiposProducto, eq(productos.tipoProductoId, tiposProducto.id))
    .leftJoin(proveedores, eq(productos.proveedorPrincipalId, proveedores.id))
    .leftJoin(lotes, eq(lotes.productoId, productos.id))
    .where(eq(productos.activo, true))
    .groupBy(productos.id)
    .orderBy(asc(productos.nombre))
    .all();

  return filas.map((f) => ({
    ...f.producto,
    tipoProductoNombre: f.tipoNombre,
    proveedorNombre: f.proveedorNombre,
    stockTotal: Number(f.stockTotal),
    loteMasProximoACaducar: f.proximaCaducidad,
    semaforo: calcularSemaforo(
      Number(f.stockTotal),
      config.umbralStockCritico,
      config.umbralStockBajo,
      f.producto.stockMinimoManual,
    ),
  }));
}

export async function lotesPorProducto(productoId: string): Promise<Lote[]> {
  const db = getDb();
  const filas = db
    .select({ lote: lotes, productoNombre: productos.nombre })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(eq(lotes.productoId, productoId))
    .orderBy(asc(lotes.fechaCaducidad))
    .all();
  return filas.map((f) => ({ ...f.lote, productoNombre: f.productoNombre }));
}

function obtenerLotePorId(id: string): Lote | undefined {
  const db = getDb();
  const fila = db
    .select({ lote: lotes, productoNombre: productos.nombre })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(eq(lotes.id, id))
    .get();
  return fila ? { ...fila.lote, productoNombre: fila.productoNombre } : undefined;
}

export async function actualizarLote(id: string, input: LoteInput, usuarioId?: string): Promise<Lote | undefined> {
  const db = getDb();
  db.update(lotes)
    .set({
      numeroLote: input.numeroLote || null,
      fechaCaducidad: input.fechaCaducidad || null,
      ubicacion: input.ubicacion || null,
      notas: input.notas || null,
      costoUnitarioLote: input.costoUnitarioLote,
      updatedAt: new Date(),
    })
    .where(eq(lotes.id, id))
    .run();
  registrarAccion(db, { usuarioId, accion: "lote_actualizado", entidadTipo: "lote", entidadId: id });
  return obtenerLotePorId(id);
}

export async function cambiarEstadoLote(
  id: string,
  estado: "activo" | "bloqueado",
  usuarioId?: string,
): Promise<Lote | undefined> {
  const db = getDb();
  db.update(lotes).set({ estado, updatedAt: new Date() }).where(eq(lotes.id, id)).run();
  registrarAccion(db, {
    usuarioId,
    accion: estado === "bloqueado" ? "lote_bloqueado" : "lote_activado",
    entidadTipo: "lote",
    entidadId: id,
  });
  return obtenerLotePorId(id);
}

export async function eliminarLote(id: string, usuarioId?: string): Promise<void> {
  const db = getDb();
  eliminarOFallarConHistorial(
    () => db.delete(lotes).where(eq(lotes.id, id)).run(),
    "Este lote tiene entradas, salidas o consumos asociados. Bloquéalo en su lugar.",
  );
  registrarAccion(db, { usuarioId, accion: "lote_eliminado", entidadTipo: "lote", entidadId: id });
}

export async function lotesProximosACaducar(): Promise<Lote[]> {
  const db = getDb();
  const config = await obtenerConfig();
  const hoy = fechaLocalIso();
  const limite = new Date();
  limite.setDate(limite.getDate() + config.diasAlertaCaducidad);
  const limiteIso = fechaLocalIso(limite);

  const filas = db
    .select({ lote: lotes, productoNombre: productos.nombre })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(
      and(
        eq(lotes.estado, "activo"),
        sql`${lotes.cantidadDisponible} > 0`,
        isNotNull(lotes.fechaCaducidad),
        // Estrictamente en el futuro: los que ya caducaron (fecha <= hoy) van solo en "Caducados",
        // no deben duplicarse aquí.
        gt(lotes.fechaCaducidad, hoy),
        lte(lotes.fechaCaducidad, limiteIso),
      ),
    )
    .orderBy(asc(lotes.fechaCaducidad))
    .all();
  return filas.map((f) => ({ ...f.lote, productoNombre: f.productoNombre }));
}

export async function lotesCaducados(): Promise<Lote[]> {
  const db = getDb();
  const hoy = fechaLocalIso();
  const filas = db
    .select({ lote: lotes, productoNombre: productos.nombre })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(
      and(
        sql`${lotes.cantidadDisponible} > 0`,
        isNotNull(lotes.fechaCaducidad),
        lte(lotes.fechaCaducidad, hoy),
      ),
    )
    .orderBy(asc(lotes.fechaCaducidad))
    .all();
  return filas.map((f) => ({ ...f.lote, productoNombre: f.productoNombre }));
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export async function registrarEntrada(input: EntradaInput, usuarioId?: string) {
  const db = getDb();
  const fecha = input.fecha;

  return db.transaction((tx) => {
    let loteId = input.loteId;

    if (loteId) {
      const lote = tx.select().from(lotes).where(eq(lotes.id, loteId)).get();
      if (!lote) throw new Error("El lote especificado no existe.");
      tx.update(lotes)
        .set({
          cantidadDisponible: lote.cantidadDisponible + input.cantidad,
          cantidadInicial: lote.cantidadInicial + input.cantidad,
          updatedAt: new Date(),
        })
        .where(eq(lotes.id, loteId))
        .run();
    } else {
      loteId = randomUUID();
      tx.insert(lotes)
        .values({
          id: loteId,
          productoId: input.productoId,
          proveedorId: input.proveedorId || null,
          numeroLote: input.numeroLote || generarNumeroLote(tx),
          fechaCompra: fecha,
          fechaEntrada: fecha,
          fechaCaducidad: input.fechaCaducidad || null,
          cantidadInicial: input.cantidad,
          cantidadDisponible: input.cantidad,
          costoUnitarioLote: input.costoUnitario,
          ubicacion: input.ubicacion || null,
          estado: "activo",
        })
        .run();
    }

    const entradaId = randomUUID();
    const folio = input.folio || generarFolioEntrada(tx);
    tx.insert(entradasInventario)
      .values({
        id: entradaId,
        fecha,
        folio,
        proveedorId: input.proveedorId || null,
        productoId: input.productoId,
        loteId,
        cantidad: input.cantidad,
        costoUnitario: input.costoUnitario,
        total: input.cantidad * input.costoUnitario,
        numeroFactura: input.numeroFactura || null,
        metodoPago: input.metodoPago || null,
        usuarioId: usuarioId || null,
        observaciones: input.observaciones || null,
      })
      .run();

    tx.insert(movimientos)
      .values({
        id: randomUUID(),
        fecha,
        tipo: "entrada",
        productoId: input.productoId,
        loteId,
        cantidad: input.cantidad,
        referenciaTipo: "entrada_inventario",
        referenciaId: entradaId,
        proveedorId: input.proveedorId || null,
        usuarioId: usuarioId || null,
        observaciones: input.observaciones || null,
      })
      .run();

    registrarAccion(tx, {
      usuarioId,
      accion: "entrada_inventario",
      entidadTipo: "producto",
      entidadId: input.productoId,
      detalle: `+${input.cantidad} · folio ${folio}`,
    });

    return tx.select().from(entradasInventario).where(eq(entradasInventario.id, entradaId)).get();
  });
}

// ---------------------------------------------------------------------------
// Salidas (con selección de lote por FEFO/FIFO)
// ---------------------------------------------------------------------------

export interface FaltanteStock {
  productoId: string;
  nombre: string;
  disponible: number;
  solicitado: number;
}

/**
 * Verifica, SIN modificar nada, si hay stock suficiente para una lista de productos a descontar.
 * Se usa antes de cerrar una cita para no descontar unos insumos y fallar a medias en otros
 * (cada salida se confirma por separado): si algo falta, se avisa todo junto y no se toca nada.
 * Agrupa por producto por si el mismo aparece repetido (insumo + venta del mismo artículo).
 */
export function verificarStockSuficiente(items: { productoId: string; cantidad: number }[]): FaltanteStock[] {
  const db = getDb();
  const hoy = fechaLocalIso();

  const porProducto = new Map<string, number>();
  for (const it of items) {
    if (!it.productoId || it.cantidad <= 0) continue;
    porProducto.set(it.productoId, (porProducto.get(it.productoId) ?? 0) + it.cantidad);
  }

  const faltantes: FaltanteStock[] = [];
  for (const [productoId, solicitado] of porProducto) {
    const filas = db
      .select({ disp: lotes.cantidadDisponible })
      .from(lotes)
      .where(
        and(
          eq(lotes.productoId, productoId),
          eq(lotes.estado, "activo"),
          sql`${lotes.cantidadDisponible} > 0`,
          sql`(${lotes.fechaCaducidad} IS NULL OR ${lotes.fechaCaducidad} >= ${hoy})`,
        ),
      )
      .all();
    const disponible = filas.reduce((acc, f) => acc + f.disp, 0);
    if (disponible < solicitado) {
      const prod = db.select({ nombre: productos.nombre }).from(productos).where(eq(productos.id, productoId)).get();
      faltantes.push({ productoId, nombre: prod?.nombre ?? "Producto", disponible, solicitado });
    }
  }
  return faltantes;
}

export async function registrarSalida(input: SalidaInput, usuarioId?: string) {
  const db = getDb();
  const config = await obtenerConfig();
  const hoy = fechaLocalIso();
  const fecha = input.fecha;

  return db.transaction((tx) => {
    let candidatos: Array<typeof lotes.$inferSelect>;

    if (input.loteId) {
      const lote = tx.select().from(lotes).where(eq(lotes.id, input.loteId)).get();
      if (!lote) throw new Error("El lote especificado no existe.");
      if (lote.estado === "bloqueado") throw new Error("Este lote está bloqueado y no puede usarse.");
      if (lote.fechaCaducidad && lote.fechaCaducidad < hoy) {
        throw new Error("Este lote está caducado y no puede usarse.");
      }
      candidatos = [lote];
    } else {
      const orden = config.criterioSalidaLotes === "FEFO" ? asc(lotes.fechaCaducidad) : asc(lotes.fechaEntrada);
      candidatos = tx
        .select()
        .from(lotes)
        .where(
          and(
            eq(lotes.productoId, input.productoId),
            eq(lotes.estado, "activo"),
            sql`${lotes.cantidadDisponible} > 0`,
            sql`(${lotes.fechaCaducidad} IS NULL OR ${lotes.fechaCaducidad} >= ${hoy})`,
          ),
        )
        .orderBy(orden)
        .all();
    }

    const disponibleTotal = candidatos.reduce((acc, l) => acc + l.cantidadDisponible, 0);
    if (disponibleTotal < input.cantidad) {
      const prod = tx
        .select({ nombre: productos.nombre })
        .from(productos)
        .where(eq(productos.id, input.productoId))
        .get();
      throw new Error(
        `Stock insuficiente de ${prod?.nombre ?? "este producto"}: disponible ${disponibleTotal}, se necesitan ${input.cantidad}.`,
      );
    }

    let restante = input.cantidad;
    const salidasCreadas: string[] = [];
    const folio = input.folio || generarFolioSalida(tx);

    for (const lote of candidatos) {
      if (restante <= 0) break;
      const tomar = Math.min(restante, lote.cantidadDisponible);
      const nuevaDisponible = lote.cantidadDisponible - tomar;

      tx.update(lotes)
        .set({
          cantidadDisponible: nuevaDisponible,
          estado: nuevaDisponible <= 0 ? "agotado" : lote.estado,
          updatedAt: new Date(),
        })
        .where(eq(lotes.id, lote.id))
        .run();

      const salidaId = randomUUID();
      tx.insert(salidasInventario)
        .values({
          id: salidaId,
          fecha,
          folio,
          productoId: input.productoId,
          loteId: lote.id,
          tipoSalida: input.tipoSalida,
          cantidad: tomar,
          costoUnitario: lote.costoUnitarioLote ?? 0,
          valor: tomar * (lote.costoUnitarioLote ?? 0),
          clienteId: input.clienteId || null,
          servicioRealizadoId: input.servicioRealizadoId || null,
          usuarioId: usuarioId || null,
          observaciones: input.observaciones || null,
        })
        .run();

      tx.insert(movimientos)
        .values({
          id: randomUUID(),
          fecha,
          tipo: input.tipoSalida,
          productoId: input.productoId,
          loteId: lote.id,
          cantidad: tomar,
          referenciaTipo: "salida_inventario",
          referenciaId: salidaId,
          clienteId: input.clienteId || null,
          usuarioId: usuarioId || null,
          observaciones: input.observaciones || null,
        })
        .run();

      salidasCreadas.push(salidaId);
      restante -= tomar;
    }

    registrarAccion(tx, {
      usuarioId,
      accion: `salida_${input.tipoSalida}`,
      entidadTipo: "producto",
      entidadId: input.productoId,
      detalle: `-${input.cantidad}`,
    });

    return tx
      .select()
      .from(salidasInventario)
      .where(sql`${salidasInventario.id} IN ${salidasCreadas}`)
      .all();
  });
}

// ---------------------------------------------------------------------------
// Movimientos consolidados
// ---------------------------------------------------------------------------

export async function listarMovimientos(filtro: MovimientosFiltro): Promise<MovimientoRow[]> {
  const db = getDb();
  const condiciones = [];
  if (filtro.fechaDesde) condiciones.push(gte(movimientos.fecha, filtro.fechaDesde));
  if (filtro.fechaHasta) condiciones.push(lte(movimientos.fecha, filtro.fechaHasta));
  if (filtro.productoIds && filtro.productoIds.length > 0)
    condiciones.push(inArray(movimientos.productoId, filtro.productoIds));
  if (filtro.loteId) condiciones.push(eq(movimientos.loteId, filtro.loteId));
  if (filtro.clienteId) condiciones.push(eq(movimientos.clienteId, filtro.clienteId));
  if (filtro.proveedorId) condiciones.push(eq(movimientos.proveedorId, filtro.proveedorId));
  if (filtro.tipos && filtro.tipos.length > 0) condiciones.push(inArray(movimientos.tipo, filtro.tipos));

  // El folio vive en la entrada/salida que originó el movimiento (referenciaId). Se unen ambas
  // tablas y se toma el que exista (los ids son UUID, no colisionan entre tablas).
  const filas = db
    .select({
      mov: movimientos,
      productoNombre: productos.nombre,
      numeroLote: lotes.numeroLote,
      folio: sql<string | null>`COALESCE(${entradasInventario.folio}, ${salidasInventario.folio})`,
    })
    .from(movimientos)
    .leftJoin(productos, eq(movimientos.productoId, productos.id))
    .leftJoin(lotes, eq(movimientos.loteId, lotes.id))
    .leftJoin(entradasInventario, eq(movimientos.referenciaId, entradasInventario.id))
    .leftJoin(salidasInventario, eq(movimientos.referenciaId, salidasInventario.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(movimientos.createdAt))
    .limit(500)
    .all();

  return filas.map((f) => ({
    id: f.mov.id,
    fecha: f.mov.fecha,
    tipo: f.mov.tipo,
    folio: f.folio,
    productoId: f.mov.productoId,
    productoNombre: f.productoNombre,
    loteId: f.mov.loteId,
    numeroLote: f.numeroLote,
    cantidad: f.mov.cantidad,
    clienteId: f.mov.clienteId,
    proveedorId: f.mov.proveedorId,
    observaciones: f.mov.observaciones,
    createdAt: f.mov.createdAt.getTime(),
  }));
}
