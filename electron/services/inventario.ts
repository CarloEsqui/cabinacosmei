import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
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
import type { EntradaInput, SalidaInput, MovimientosFiltro } from "../../shared/schemas";
import type { ProductoConStock, Lote, MovimientoRow, Semaforo } from "../../shared/types";

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function calcularSemaforo(
  stockTotal: number,
  umbralCritico: number,
  umbralBajo: number,
  stockMinimoManual: number | null,
): Semaforo {
  const bajoEfectivo = stockMinimoManual ?? umbralBajo;
  if (stockTotal <= umbralCritico) return "critico";
  if (stockTotal <= bajoEfectivo) return "bajo";
  return "adecuado";
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

export async function lotesProximosACaducar(): Promise<Lote[]> {
  const db = getDb();
  const config = await obtenerConfig();
  const limite = new Date();
  limite.setDate(limite.getDate() + config.diasAlertaCaducidad);
  const limiteIso = limite.toISOString().slice(0, 10);

  const filas = db
    .select({ lote: lotes, productoNombre: productos.nombre })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(
      and(
        eq(lotes.estado, "activo"),
        sql`${lotes.cantidadDisponible} > 0`,
        isNotNull(lotes.fechaCaducidad),
        lte(lotes.fechaCaducidad, limiteIso),
      ),
    )
    .orderBy(asc(lotes.fechaCaducidad))
    .all();
  return filas.map((f) => ({ ...f.lote, productoNombre: f.productoNombre }));
}

export async function lotesCaducados(): Promise<Lote[]> {
  const db = getDb();
  const hoy = hoyIso();
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
          numeroLote: input.numeroLote || null,
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
    tx.insert(entradasInventario)
      .values({
        id: entradaId,
        fecha,
        folio: input.folio || null,
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
      detalle: `+${input.cantidad}${input.folio ? ` · folio ${input.folio}` : ""}`,
    });

    return tx.select().from(entradasInventario).where(eq(entradasInventario.id, entradaId)).get();
  });
}

// ---------------------------------------------------------------------------
// Salidas (con selección de lote por FEFO/FIFO)
// ---------------------------------------------------------------------------

export async function registrarSalida(input: SalidaInput, usuarioId?: string) {
  const db = getDb();
  const config = await obtenerConfig();
  const hoy = hoyIso();
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
      throw new Error(
        `Stock insuficiente: disponible ${disponibleTotal}, solicitado ${input.cantidad}.`,
      );
    }

    let restante = input.cantidad;
    const salidasCreadas: string[] = [];

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
          folio: input.folio || null,
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
  if (filtro.productoId) condiciones.push(eq(movimientos.productoId, filtro.productoId));
  if (filtro.loteId) condiciones.push(eq(movimientos.loteId, filtro.loteId));
  if (filtro.clienteId) condiciones.push(eq(movimientos.clienteId, filtro.clienteId));
  if (filtro.proveedorId) condiciones.push(eq(movimientos.proveedorId, filtro.proveedorId));
  if (filtro.tipo) condiciones.push(eq(movimientos.tipo, filtro.tipo));

  const filas = db
    .select({
      mov: movimientos,
      productoNombre: productos.nombre,
      numeroLote: lotes.numeroLote,
    })
    .from(movimientos)
    .leftJoin(productos, eq(movimientos.productoId, productos.id))
    .leftJoin(lotes, eq(movimientos.loteId, lotes.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(movimientos.createdAt))
    .limit(500)
    .all();

  return filas.map((f) => ({
    id: f.mov.id,
    fecha: f.mov.fecha,
    tipo: f.mov.tipo,
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
