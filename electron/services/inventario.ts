import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  productos,
  tiposProducto,
  proveedores,
  lotes,
  entradasInventario,
  salidasInventario,
  movimientos,
  ventasMostrador,
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

// Igual que arriba pero con las operaciones de escritura que necesitan las salidas de inventario
// (leer lotes, descontar stock, insertar salidas/movimientos). Permite que `registrarSalida` opere
// tanto sobre `db` (abriendo su propia transacción) como sobre el `tx` de una transacción externa
// —p. ej. el cierre de cita— sin abrir una transacción anidada (better-sqlite3 no las soporta).
// Cantidades de stock en piezas (pueden ser fracciones: 1/3 de ampolleta). Se comparan con tolerancia
// EPS y se redondean a 9 decimales al escribir en el lote: suficiente para que tres tercios vuelvan a
// sumar 1 (redondear a 6 decimales dejaba 0.999999) y para que no queden residuos tipo 1e-16 que
// dejaban un lote "activo" con nada (DAT-M2; Gate 001 de cancelación, condición 3).
const EPS = 1e-6;
const redondear = (x: number) => Math.round(x * 1e9) / 1e9;

interface DbOTx {
  select: ReturnType<typeof getDb>["select"];
  insert: ReturnType<typeof getDb>["insert"];
  update: ReturnType<typeof getDb>["update"];
}

export function siguienteCorrelativo(valores: (string | null)[], prefijo: string): string {
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

export function generarFolioSalida(db: DbConSelect): string {
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
  const hoy = fechaLocalIso();
  // Un lote caduca al día SIGUIENTE de su fecha (misma regla que registrarSalidaEnTx). Lo caducado
  // no cuenta como stock usable: antes inflaba el total y el semáforo (DAT-M7, 2026-11-04).
  const usable = sql`(${lotes.fechaCaducidad} IS NULL OR ${lotes.fechaCaducidad} >= ${hoy})`;

  const filas = db
    .select({
      producto: productos,
      tipoNombre: tiposProducto.nombreTipo,
      proveedorNombre: proveedores.nombreComercial,
      stockTotal: sql<number>`COALESCE(SUM(CASE WHEN ${lotes.estado} = 'activo' AND ${usable} THEN ${lotes.cantidadDisponible} ELSE 0 END), 0)`,
      stockCaducado: sql<number>`COALESCE(SUM(CASE WHEN ${lotes.estado} <> 'agotado' AND NOT ${usable} THEN ${lotes.cantidadDisponible} ELSE 0 END), 0)`,
      proximaCaducidad: sql<string | null>`MIN(CASE WHEN ${lotes.cantidadDisponible} > 0 AND ${lotes.estado} = 'activo' AND ${usable} THEN ${lotes.fechaCaducidad} END)`,
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
    stockCaducado: Number(f.stockCaducado),
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
    .select({
      lote: lotes,
      productoNombre: productos.nombre,
      presentacion: productos.presentacion,
      contenidoCantidad: productos.contenidoCantidad,
      contenidoUnidad: productos.contenidoUnidad,
    })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(eq(lotes.productoId, productoId))
    .orderBy(asc(lotes.fechaCaducidad))
    .all();
  return filas.map((f) => ({
    ...f.lote,
    productoNombre: f.productoNombre,
    presentacion: f.presentacion,
    contenidoCantidad: f.contenidoCantidad,
    contenidoUnidad: f.contenidoUnidad,
  }));
}

function obtenerLotePorId(id: string): Lote | undefined {
  const db = getDb();
  const fila = db
    .select({
      lote: lotes,
      productoNombre: productos.nombre,
      presentacion: productos.presentacion,
      contenidoCantidad: productos.contenidoCantidad,
      contenidoUnidad: productos.contenidoUnidad,
    })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(eq(lotes.id, id))
    .get();
  return fila
    ? {
        ...fila.lote,
        productoNombre: fila.productoNombre,
        presentacion: fila.presentacion,
        contenidoCantidad: fila.contenidoCantidad,
        contenidoUnidad: fila.contenidoUnidad,
      }
    : undefined;
}

export async function actualizarLote(id: string, input: LoteInput, usuarioId?: string): Promise<Lote | undefined> {
  const db = getDb();
  const existe = db.select({ id: lotes.id }).from(lotes).where(eq(lotes.id, id)).get();
  if (!existe) throw new Error("El lote no existe.");
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
  const existe = db.select({ id: lotes.id }).from(lotes).where(eq(lotes.id, id)).get();
  if (!existe) throw new Error("El lote no existe.");
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
    .select({
      lote: lotes,
      productoNombre: productos.nombre,
      presentacion: productos.presentacion,
      contenidoCantidad: productos.contenidoCantidad,
      contenidoUnidad: productos.contenidoUnidad,
    })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(
      and(
        eq(lotes.estado, "activo"),
        sql`${lotes.cantidadDisponible} > 0`,
        isNotNull(lotes.fechaCaducidad),
        // Desde hoy: un lote que vence hoy todavía se puede usar (caduca al día siguiente, misma
        // regla que registrarSalidaEnTx); los ya caducados (fecha < hoy) van solo en "Caducados".
        gte(lotes.fechaCaducidad, hoy),
        lte(lotes.fechaCaducidad, limiteIso),
      ),
    )
    .orderBy(asc(lotes.fechaCaducidad))
    .all();
  return filas.map((f) => ({
    ...f.lote,
    productoNombre: f.productoNombre,
    presentacion: f.presentacion,
    contenidoCantidad: f.contenidoCantidad,
    contenidoUnidad: f.contenidoUnidad,
  }));
}

export async function lotesCaducados(): Promise<Lote[]> {
  const db = getDb();
  const hoy = fechaLocalIso();
  const filas = db
    .select({
      lote: lotes,
      productoNombre: productos.nombre,
      presentacion: productos.presentacion,
      contenidoCantidad: productos.contenidoCantidad,
      contenidoUnidad: productos.contenidoUnidad,
    })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(
      and(
        sql`${lotes.cantidadDisponible} > 0`,
        isNotNull(lotes.fechaCaducidad),
        lt(lotes.fechaCaducidad, hoy),
      ),
    )
    .orderBy(asc(lotes.fechaCaducidad))
    .all();
  return filas.map((f) => ({
    ...f.lote,
    productoNombre: f.productoNombre,
    presentacion: f.presentacion,
    contenidoCantidad: f.contenidoCantidad,
    contenidoUnidad: f.contenidoUnidad,
  }));
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
      // El lote debe ser del mismo producto de la entrada: sumar stock a un lote de otro producto
      // corrompería el inventario (contaría piezas de A como si fueran de B).
      if (lote.productoId !== input.productoId) {
        throw new Error("El lote seleccionado no pertenece a este producto.");
      }
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

/**
 * Cuerpo real de una salida de inventario, operando sobre `db` o el `tx` de una transacción externa.
 * NO abre transacción propia: es responsabilidad del llamador (el wrapper `registrarSalida` para las
 * salidas sueltas, o `cerrarCita` para meter todas las salidas del cierre en una sola transacción).
 * `criterioSalidaLotes` y `hoy` se reciben ya calculados porque `obtenerConfig()` es async y las
 * transacciones de better-sqlite3 son síncronas: nada async puede correr dentro de una.
 */
export function registrarSalidaEnTx(
  tx: DbOTx,
  // precioUnitarioVenta: solo lo mandan el cierre de cita y la venta de mostrador en salidas tipo
  // "venta" (cobro v2, DIN-A5). ventaMostradorId: solo la venta de mostrador (0008).
  input: SalidaInput & { precioUnitarioVenta?: number; ventaMostradorId?: string },
  criterioSalidaLotes: string,
  hoy: string,
  usuarioId?: string,
) {
  const fecha = input.fecha;
  let candidatos: Array<typeof lotes.$inferSelect>;

  if (input.loteId) {
    const lote = tx.select().from(lotes).where(eq(lotes.id, input.loteId)).get();
    if (!lote) throw new Error("El lote especificado no existe.");
    // Merma y devolución son justo la forma de sacar del inventario un lote que ya no sirve: se
    // permiten aunque esté caducado o bloqueado. Para usarlo (consumo, venta, etc.) sigue prohibido.
    const esBaja = input.tipoSalida === "merma" || input.tipoSalida === "devolucion";
    if (!esBaja && lote.estado === "bloqueado") throw new Error("Este lote está bloqueado y no puede usarse.");
    if (!esBaja && lote.fechaCaducidad && lote.fechaCaducidad < hoy) {
      throw new Error("Este lote está caducado y no puede usarse.");
    }
    candidatos = [lote];
  } else {
    const orden = criterioSalidaLotes === "FEFO" ? asc(lotes.fechaCaducidad) : asc(lotes.fechaEntrada);
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
    const restanteLote = redondear(lote.cantidadDisponible - tomar);
    const nuevaDisponible = restanteLote <= EPS ? 0 : restanteLote;

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
        precioUnitarioVenta: input.precioUnitarioVenta ?? null,
        ventaMostradorId: input.ventaMostradorId || null,
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

  return tx.select().from(salidasInventario).where(inArray(salidasInventario.id, salidasCreadas)).all();
}

/**
 * Da de baja TODO lo que queda de un lote (caducado, dañado o desechado) como una salida tipo
 * "merma": el lote queda en 0 / agotado y deja de aparecer en stock, caducados y alertas, pero su
 * historia y su costo quedan en Movimientos y en el reporte de mermas (DAT-A5, 2026-11-04). Nada se
 * borra.
 */
export async function darDeBajaLote(loteId: string, motivo: string | undefined, usuarioId?: string) {
  const db = getDb();
  const config = await obtenerConfig();
  const hoy = fechaLocalIso();
  return db.transaction((tx) => {
    const lote = tx.select().from(lotes).where(eq(lotes.id, loteId)).get();
    if (!lote) throw new Error("El lote no existe.");
    if (lote.cantidadDisponible <= 0) throw new Error("Este lote ya no tiene existencias.");
    const caducado = !!lote.fechaCaducidad && lote.fechaCaducidad < hoy;
    return registrarSalidaEnTx(
      tx,
      {
        fecha: hoy,
        productoId: lote.productoId,
        loteId: lote.id,
        tipoSalida: "merma",
        cantidad: lote.cantidadDisponible,
        observaciones: motivo?.trim() || (caducado ? "Baja por caducidad" : "Baja de lote"),
      },
      config.criterioSalidaLotes,
      hoy,
      usuarioId,
    );
  });
}

export async function registrarSalida(input: SalidaInput, usuarioId?: string) {
  // Gate de la venta de mostrador, condición 7: una venta sin dinero ya no se puede crear por ningún
  // camino. Las ventas pasan por "Vender producto" (ventasMostrador.ts) o por el cierre de cita.
  if (input.tipoSalida === "venta") {
    throw new Error('Las ventas se registran con "Vender producto", para que su dinero entre al corte.');
  }
  const db = getDb();
  const config = await obtenerConfig();
  const hoy = fechaLocalIso();
  // Los llamadores sueltos (SalidaForm vía IPC) siguen teniendo su salida atómica: el wrapper abre
  // su propia transacción y delega el cuerpo en la función que opera sobre el `tx`.
  return db.transaction((tx) => registrarSalidaEnTx(tx, input, config.criterioSalidaLotes, hoy, usuarioId));
}


// ---------------------------------------------------------------------------
// Cancelación de entradas y salidas (DAT-A2, migración 0004, Gate 001 2026-11-04)
// ---------------------------------------------------------------------------
// Nunca se borra un documento: se marca "cancelada" (fecha, motivo, usuaria) y un movimiento
// nuevo `cancelacion_entrada` / `cancelacion_salida` deja el rastro, con cantidad POSITIVA (el tipo
// da la dirección, igual que el resto de `movimientos`). Tolerancia y redondeo: ver EPS arriba.


// Motivo OPCIONAL: decisión de Carlos (2026-11-04), "solo confirmar y listo". Si viene, se guarda.
function motivoOpcional(motivo?: string): string | null {
  const limpio = motivo?.trim();
  return limpio ? limpio : null;
}

/**
 * Cancela una entrada dentro de una transacción existente. Solo si TODA su cantidad sigue
 * disponible en el lote (nada de ella se ha usado). Exportada para que la reversa de un servicio
 * cerrado (CIT-C1, su propio Gate) pueda reutilizarla en su transacción.
 */
export function cancelarEntradaEnTx(tx: DbOTx, entradaId: string, motivo: string | undefined, hoy: string, usuarioId?: string) {
  const razon = motivoOpcional(motivo);
  const entrada = tx.select().from(entradasInventario).where(eq(entradasInventario.id, entradaId)).get();
  if (!entrada) throw new Error("La entrada no existe.");
  if (entrada.estatus === "cancelada") throw new Error("Esta entrada ya estaba cancelada.");
  const lote = tx.select().from(lotes).where(eq(lotes.id, entrada.loteId)).get();
  if (!lote) throw new Error("El lote de esta entrada no existe.");
  if (lote.cantidadDisponible + EPS < entrada.cantidad) {
    throw new Error(
      "Ya se usó parte de lo que entró en este lote. Cancela primero esas salidas, o registra una merma por lo que sobra.",
    );
  }

  const disponible = redondear(lote.cantidadDisponible - entrada.cantidad);
  const inicial = redondear(Math.max(0, lote.cantidadInicial - entrada.cantidad));
  tx.update(lotes)
    .set({
      cantidadDisponible: disponible <= EPS ? 0 : disponible,
      cantidadInicial: inicial,
      estado: disponible <= EPS ? "agotado" : lote.estado,
      updatedAt: new Date(),
    })
    .where(eq(lotes.id, lote.id))
    .run();

  tx.update(entradasInventario)
    .set({ estatus: "cancelada", canceladaAt: new Date(), canceladaMotivo: razon, canceladaPorUsuarioId: usuarioId || null })
    .where(eq(entradasInventario.id, entrada.id))
    .run();

  tx.insert(movimientos)
    .values({
      id: randomUUID(),
      fecha: hoy,
      tipo: "cancelacion_entrada",
      productoId: entrada.productoId,
      loteId: entrada.loteId,
      cantidad: entrada.cantidad,
      referenciaTipo: "entrada_inventario",
      referenciaId: entrada.id,
      proveedorId: entrada.proveedorId,
      usuarioId: usuarioId || null,
      observaciones: razon ?? "Captura cancelada",
    })
    .run();

  registrarAccion(tx, {
    usuarioId,
    accion: "entrada_cancelada",
    entidadTipo: "entrada",
    entidadId: entrada.id,
    detalle: `${entrada.folio ?? "sin folio"} · -${entrada.cantidad}${razon ? ` · ${razon}` : ""}`,
  });
}

/**
 * Cancela una salida dentro de una transacción existente. Una salida que se repartió en varios
 * lotes son varias filas con el MISMO folio: se cancelan todas juntas o ninguna. Por defecto rechaza
 * las salidas ligadas a un servicio realizado (BR-004) o a una venta de mostrador (0008); la reversa
 * de un servicio cerrado (CIT-C1) pasará `permitirLigadasAServicio`, y `ventasMostrador.cancelarVenta`
 * pasa `permitirLigadasAVenta`.
 */
export function cancelarSalidaEnTx(
  tx: DbOTx,
  salidaId: string,
  motivo: string | undefined,
  hoy: string,
  usuarioId?: string,
  opciones: { permitirLigadasAServicio?: boolean; permitirLigadasAVenta?: boolean } = {},
) {
  const razon = motivoOpcional(motivo);
  const base = tx.select().from(salidasInventario).where(eq(salidasInventario.id, salidaId)).get();
  if (!base) throw new Error("La salida no existe.");

  const grupo = base.folio
    ? tx
        .select()
        .from(salidasInventario)
        .where(
          and(
            eq(salidasInventario.folio, base.folio),
            base.servicioRealizadoId
              ? eq(salidasInventario.servicioRealizadoId, base.servicioRealizadoId)
              : isNull(salidasInventario.servicioRealizadoId),
            base.ventaMostradorId
              ? eq(salidasInventario.ventaMostradorId, base.ventaMostradorId)
              : isNull(salidasInventario.ventaMostradorId),
          ),
        )
        .all()
    : [base];

  if (grupo.some((s) => s.estatus === "cancelada")) throw new Error("Esta salida ya estaba cancelada.");
  if (!opciones.permitirLigadasAServicio && grupo.some((s) => s.servicioRealizadoId)) {
    throw new Error("Esta salida viene del cierre de una cita; se corrige desde la cita, no desde Movimientos.");
  }
  if (!opciones.permitirLigadasAVenta && grupo.some((s) => s.ventaMostradorId)) {
    throw new Error("Esta salida es de una venta de mostrador; se cancela desde la venta, no desde Movimientos.");
  }

  for (const s of grupo) {
    const lote = tx.select().from(lotes).where(eq(lotes.id, s.loteId)).get();
    if (!lote) throw new Error("El lote de esta salida no existe.");
    tx.update(lotes)
      .set({
        cantidadDisponible: redondear(lote.cantidadDisponible + s.cantidad),
        // Un lote agotado vuelve a activo; uno bloqueado se queda bloqueado.
        estado: lote.estado === "agotado" ? "activo" : lote.estado,
        updatedAt: new Date(),
      })
      .where(eq(lotes.id, lote.id))
      .run();

    tx.update(salidasInventario)
      .set({ estatus: "cancelada", canceladaAt: new Date(), canceladaMotivo: razon, canceladaPorUsuarioId: usuarioId || null })
      .where(eq(salidasInventario.id, s.id))
      .run();

    tx.insert(movimientos)
      .values({
        id: randomUUID(),
        fecha: hoy,
        tipo: "cancelacion_salida",
        productoId: s.productoId,
        loteId: s.loteId,
        cantidad: s.cantidad,
        referenciaTipo: "salida_inventario",
        referenciaId: s.id,
        clienteId: s.clienteId,
        usuarioId: usuarioId || null,
        observaciones: razon ?? "Captura cancelada",
      })
      .run();
  }

  const total = redondear(grupo.reduce((acc, s) => acc + s.cantidad, 0));
  registrarAccion(tx, {
    usuarioId,
    accion: "salida_cancelada",
    entidadTipo: "producto",
    entidadId: base.productoId,
    detalle: `${base.folio ?? "sin folio"} · ${base.tipoSalida} · +${total}${razon ? ` · ${razon}` : ""}`,
  });
}

/** Cancela una entrada capturada por error (IPC `inventario:cancelarEntrada`). Sin PIN ni motivo obligatorio: decisión de Carlos. */
export async function cancelarEntrada(entradaId: string, motivo?: string, usuarioId?: string): Promise<void> {
  const db = getDb();
  const hoy = fechaLocalIso();
  db.transaction((tx) => cancelarEntradaEnTx(tx, entradaId, motivo, hoy, usuarioId));
}

/** Cancela una salida suelta (no ligada a una cita) capturada por error (IPC `inventario:cancelarSalida`). */
export async function cancelarSalida(salidaId: string, motivo?: string, usuarioId?: string): Promise<void> {
  const db = getDb();
  const hoy = fechaLocalIso();
  db.transaction((tx) => cancelarSalidaEnTx(tx, salidaId, motivo, hoy, usuarioId));
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
      docEstatus: sql<string | null>`COALESCE(${entradasInventario.estatus}, ${salidasInventario.estatus})`,
      docMotivo: sql<string | null>`COALESCE(${entradasInventario.canceladaMotivo}, ${salidasInventario.canceladaMotivo})`,
      docServicioRealizadoId: salidasInventario.servicioRealizadoId,
      ventaMostradorId: salidasInventario.ventaMostradorId,
      ventaFolio: ventasMostrador.folio,
    })
    .from(movimientos)
    .leftJoin(productos, eq(movimientos.productoId, productos.id))
    .leftJoin(lotes, eq(movimientos.loteId, lotes.id))
    .leftJoin(entradasInventario, eq(movimientos.referenciaId, entradasInventario.id))
    .leftJoin(salidasInventario, eq(movimientos.referenciaId, salidasInventario.id))
    .leftJoin(ventasMostrador, eq(salidasInventario.ventaMostradorId, ventasMostrador.id))
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
    referenciaTipo: f.mov.referenciaTipo,
    referenciaId: f.mov.referenciaId,
    documentoEstatus: f.docEstatus,
    documentoMotivoCancelacion: f.docMotivo,
    ligadoAServicio: !!f.docServicioRealizadoId,
    ventaMostradorId: f.ventaMostradorId ?? null,
    ventaFolio: f.ventaFolio ?? null,
  }));
}
