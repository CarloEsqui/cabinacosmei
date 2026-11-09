import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, inArray, isNotNull, like, lte, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { clientes, pagos, productos, salidasInventario, ventasMostrador } from "../db/schema";
import { verificarPin } from "./auth";
import { obtenerConfig } from "./config";
import { registrarAccion } from "./bitacora";
import { existeSeleccion } from "./seleccionesArchivo";
import { tieneComprobanteVenta } from "./archivos";
import { listarComprobantesVenta } from "./comprobantes";
import { generarFolioSalida, registrarSalidaEnTx, cancelarSalidaEnTx, siguienteCorrelativo } from "./inventario";
import {
  TOLERANCIA,
  aplicarDescuentoVentaEnTx,
  cancelarPagoEnTx,
  cobradoPorVenta,
  descuentosVigentesVenta,
  pagosDeVenta,
  recalcularEstatusVentaEnTx,
  redondearDinero,
  registrarPagosEnTx,
  saldoVenta,
  sumaLineas,
  totalVenta,
} from "./cobros";
import { fechaLocalIso } from "../../shared/fechas";
import { requiereEvidencia, type CancelarVentaInput, type VentaMostradorInput } from "../../shared/schemas";
import type { DetalleVentaMostrador, PaginaVentasMostrador, ProductoFrecuente, VentaMostradorRow } from "../../shared/types";

/**
 * Venta de productos en mostrador, sin cita (spec .notes/spec-venta-mostrador-2026-11-06.md;
 * migración 0008; Gate .notes/gate-001-venta-mostrador-2026-11-06.md).
 *
 * Dueño de la CABECERA `ventas_mostrador` (condición 4): inserta, genera el folio VTA-, escribe
 * total_productos, nombre_referencia, observaciones, estatus y la cancelación. Orquesta cada venta y
 * cada cancelación en UNA transacción síncrona llamando a inventario (salidas) y a cobros (pagos,
 * descuento, estatus de pago). NO escribe `pagos`, `descuentos_servicio`, `estatus_pago` ni
 * `descuento`: eso es de cobros.ts. Dirección: ventasMostrador → cobros, inventario.
 *
 * Bitácora (BR-009): folio, conteos y montos; nunca el nombre de la clienta ni el de referencia.
 */

const POR_PAGINA = 30;
type Db = ReturnType<typeof getDb>;
type DbLectura = Pick<Db, "select">;

function generarFolioVenta(tx: DbLectura): string {
  const filas = tx
    .select({ folio: ventasMostrador.folio })
    .from(ventasMostrador)
    .where(like(ventasMostrador.folio, "VTA-%"))
    .all();
  return siguienteCorrelativo(filas.map((f) => f.folio), "VTA");
}

function textoPagos(lineas: { metodoPago: string; monto: number }[]): string {
  if (lineas.length === 0) return "sin pagos";
  return lineas.map((l) => `${l.metodoPago.trim()} $${redondearDinero(l.monto).toFixed(2)}`).join(" + ");
}

/**
 * FR-001: registra la venta completa en una transacción (cabecera, salidas, descuento, pagos y
 * estatus) o nada. Devuelve los ids de los pagos para ligar el comprobante DESPUÉS, en dos fases
 * como el anticipo (condición 10): si el archivo falla, la venta no se revierte.
 */
export async function registrarVenta(
  input: VentaMostradorInput,
  usuarioId?: string,
): Promise<{ id: string; folio: string; pagoIds: string[] }> {
  const db = getDb();
  // Con comprobante elegido sí hay evidencia (el token se verifica contra el main, COB-M2).
  const sinEvidencia = requiereEvidencia(input.pagos) && !existeSeleccion(input.comprobanteToken);
  if (sinEvidencia && !input.sinComprobanteAceptado) {
    throw new Error("Este cobro no es en efectivo y no tiene comprobante. Elige el comprobante o confirma que continúas sin él.");
  }
  const config = await obtenerConfig();
  const hoy = fechaLocalIso();

  return db.transaction((tx) => {
    // --- Clienta (opcional) y nombre de referencia ---
    let clienteId: string | null = null;
    if (input.clienteId) {
      const c = tx.select().from(clientes).where(eq(clientes.id, input.clienteId)).get();
      if (!c) throw new Error("La clienta no existe.");
      if (!c.activo) throw new Error("Esta clienta está desactivada; actívala para venderle.");
      clienteId = c.id;
    }
    const nombreReferencia = clienteId ? null : input.nombreReferencia?.trim() || null;

    // --- Productos: activos (BR-004; condición 6) y total calculado aquí ---
    const ids = [...new Set(input.lineas.map((l) => l.productoId))];
    const prods = tx.select().from(productos).where(inArray(productos.id, ids)).all();
    for (const id of ids) {
      const p = prods.find((x) => x.id === id);
      if (!p) throw new Error("Uno de los productos ya no existe.");
      if (!p.activo) throw new Error(`${p.nombre} está desactivado; no se puede vender.`);
    }
    for (const l of input.lineas) {
      if (!(l.precioUnitario > 0)) throw new Error("El precio debe ser mayor a $0. Para regalar, usa un descuento de cortesía.");
      if (!(l.cantidad > 0)) throw new Error("La cantidad debe ser mayor a 0.");
    }
    const totalProductos = redondearDinero(
      input.lineas.reduce((acc, l) => acc + redondearDinero(l.cantidad * l.precioUnitario), 0),
    );

    // --- Cabecera ---
    const id = randomUUID();
    const folio = generarFolioVenta(tx);
    tx.insert(ventasMostrador)
      .values({
        id,
        folio,
        fecha: hoy,
        clienteId,
        nombreReferencia,
        totalProductos,
        estatus: "vigente",
        observaciones: input.observaciones?.trim() || null,
        usuarioId: usuarioId || null,
      })
      .run();

    // --- Salidas de inventario: un solo folio S- para toda la venta, así se cancela de una vez.
    // registrarSalidaEnTx lanza si no alcanza el stock y la transacción entera se revierte (AC-009).
    const folioSalida = generarFolioSalida(tx);
    for (const l of input.lineas) {
      registrarSalidaEnTx(
        tx,
        {
          fecha: hoy,
          folio: folioSalida,
          productoId: l.productoId,
          tipoSalida: "venta",
          cantidad: l.cantidad,
          clienteId,
          precioUnitarioVenta: l.precioUnitario,
          ventaMostradorId: id,
          observaciones: `Venta ${folio}`,
        },
        config.criterioSalidaLotes,
        hoy,
        usuarioId,
      );
    }

    // --- Descuento (FR-007) ---
    if (input.descuento) aplicarDescuentoVentaEnTx(tx, id, input.descuento, usuarioId);
    const venta = tx.select().from(ventasMostrador).where(eq(ventasMostrador.id, id)).get()!;
    const total = totalVenta(venta);

    // --- Pagos: FR-005 y BR-007, dentro de la transacción (condición 6) ---
    const suma = sumaLineas(input.pagos);
    if (suma > total + TOLERANCIA) throw new Error(`Los pagos ($${suma.toFixed(2)}) exceden el total ($${total.toFixed(2)}).`);
    if (!clienteId && Math.abs(suma - total) > TOLERANCIA) {
      throw new Error(`Sin clienta, la venta se paga completa: faltan $${redondearDinero(total - suma).toFixed(2)}.`);
    }
    const pagoIds =
      input.pagos.length > 0
        ? registrarPagosEnTx(
            tx,
            { clienteId, ventaMostradorId: id, concepto: "venta_mostrador", lineas: input.pagos, fecha: hoy, usuarioId },
            config.metodosPago,
          )
        : [];
    const r = recalcularEstatusVentaEnTx(tx, id);

    const cliente = clienteId
      ? tx.select({ codigo: clientes.codigoCliente }).from(clientes).where(eq(clientes.id, clienteId)).get()
      : undefined;
    registrarAccion(tx, {
      usuarioId,
      accion: "venta_registrada",
      entidadTipo: "venta_mostrador",
      entidadId: id,
      detalle:
        `${folio} · ${cliente?.codigo ?? (nombreReferencia ? "sin registro (con nombre)" : "público general")} · ` +
        `${input.lineas.length} producto(s) · total $${total.toFixed(2)} · ${textoPagos(input.pagos)} · queda $${r.saldo.toFixed(2)}` +
        (sinEvidencia ? " · sin comprobante (aceptado)" : ""),
    });
    if (sinEvidencia) {
      registrarAccion(tx, {
        usuarioId,
        accion: "cobro_sin_comprobante",
        entidadTipo: "venta_mostrador",
        entidadId: id,
        detalle: `${folio} · venta: cobro sin efectivo y sin comprobante (aceptado).`,
      });
    }
    return { id, folio, pagoIds };
  });
}

/** Condición 10: la venta quedó registrada pero su comprobante no se pudo guardar. */
export function registrarVentaSinComprobanteGuardado(ventaId: string, motivo: string, usuarioId?: string) {
  const db = getDb();
  const v = db.select({ folio: ventasMostrador.folio }).from(ventasMostrador).where(eq(ventasMostrador.id, ventaId)).get();
  registrarAccion(db, {
    usuarioId,
    accion: "cobro_sin_comprobante",
    entidadTipo: "venta_mostrador",
    entidadId: ventaId,
    detalle: `${v?.folio ?? "venta"} · venta registrada; el comprobante no se pudo guardar (${motivo}).`,
  });
}

/**
 * FR-009: cancela la venta con PIN (el motivo es opcional desde §23), en una transacción: la venta queda cancelada (no se
 * borra), sus pagos cobrados se cancelan (con ajuste en el próximo corte si ya estaban cortados),
 * su descuento se cancela y sus salidas regresan el stock.
 */
export async function cancelarVenta(input: CancelarVentaInput, usuarioId?: string): Promise<void> {
  if (!(await verificarPin(input.pin))) throw new Error("El PIN de acceso no es correcto.");
  const db = getDb();
  const hoy = fechaLocalIso();
  const motivo = input.motivo?.trim() || null;
  const textoMotivo = motivo ?? "sin motivo";

  db.transaction((tx) => {
    const v = tx.select().from(ventasMostrador).where(eq(ventasMostrador.id, input.ventaId)).get();
    if (!v) throw new Error("La venta no existe.");
    // "Ya cancelada" dentro de la transacción (DIN-M2).
    if (v.estatus !== "vigente") throw new Error("Esta venta ya estaba cancelada.");
    const total = totalVenta(v);

    tx.update(ventasMostrador)
      .set({ estatus: "cancelada", canceladaAt: new Date(), motivoCancelacion: motivo, canceladaPor: usuarioId || null, updatedAt: new Date() })
      .where(eq(ventasMostrador.id, v.id))
      .run();

    const cobrados = tx
      .select({ id: pagos.id })
      .from(pagos)
      .where(and(eq(pagos.ventaMostradorId, v.id), eq(pagos.estatus, "cobrado")))
      .all();
    for (const p of cobrados) cancelarPagoEnTx(tx, p.id, `Venta ${v.folio} cancelada: ${textoMotivo}`, usuarioId);

    // VEN-M1: el descuento NO se cancela; queda como parte del ticket cancelado, así el detalle
    // muestra el neto real. Una venta cancelada no cuenta en ningún reporte (todos filtran vigente).

    // Una salida por folio basta: cancelarSalidaEnTx cancela todo el grupo folio + venta.
    const salidas = tx
      .select({ id: salidasInventario.id, folio: salidasInventario.folio })
      .from(salidasInventario)
      .where(and(eq(salidasInventario.ventaMostradorId, v.id), eq(salidasInventario.estatus, "vigente")))
      .all();
    const porFolio = new Map<string, string>();
    for (const s of salidas) if (!porFolio.has(s.folio ?? s.id)) porFolio.set(s.folio ?? s.id, s.id);
    for (const salidaId of porFolio.values()) {
      cancelarSalidaEnTx(tx, salidaId, `Venta ${v.folio} cancelada`, hoy, usuarioId, { permitirLigadasAVenta: true });
    }

    registrarAccion(tx, {
      usuarioId,
      accion: "venta_cancelada",
      entidadTipo: "venta_mostrador",
      entidadId: v.id,
      detalle: `${v.folio} · total $${total.toFixed(2)} · ${cobrados.length} pago(s) cancelado(s) · motivo: ${textoMotivo}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

function filas(db: DbLectura, where?: SQL, pagina?: number): VentaMostradorRow[] {
  let q = db
    .select({
      id: ventasMostrador.id,
      folio: ventasMostrador.folio,
      fecha: ventasMostrador.fecha,
      clienteId: ventasMostrador.clienteId,
      clienteNombre: clientes.nombreCompleto,
      clienteCodigo: clientes.codigoCliente,
      nombreReferencia: ventasMostrador.nombreReferencia,
      totalProductos: ventasMostrador.totalProductos,
      descuento: ventasMostrador.descuento,
      estatusPago: ventasMostrador.estatusPago,
      estatus: ventasMostrador.estatus,
    })
    .from(ventasMostrador)
    .leftJoin(clientes, eq(clientes.id, ventasMostrador.clienteId))
    .where(where)
    .orderBy(desc(ventasMostrador.createdAt), desc(ventasMostrador.folio))
    .$dynamic();
  if (pagina) q = q.limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA);
  const lista = q.all();

  const ids = lista.map((v) => v.id);
  const cobrado = cobradoPorVenta(db, ids);
  const piezas = new Map<string, number>();
  if (ids.length > 0) {
    const salidas = db
      .select({ ventaId: salidasInventario.ventaMostradorId, cantidad: salidasInventario.cantidad })
      .from(salidasInventario)
      .where(inArray(salidasInventario.ventaMostradorId, ids))
      .all();
    for (const s of salidas) if (s.ventaId) piezas.set(s.ventaId, (piezas.get(s.ventaId) ?? 0) + s.cantidad);
  }
  return lista.map((v) => {
    const c = cobrado.get(v.id) ?? 0;
    return {
      id: v.id,
      folio: v.folio,
      fecha: v.fecha,
      clienteId: v.clienteId,
      clienteNombre: v.clienteNombre ?? null,
      clienteCodigo: v.clienteCodigo ?? null,
      nombreReferencia: v.nombreReferencia,
      total: totalVenta(v),
      cobrado: c,
      saldo: saldoVenta(v, c),
      estatusPago: v.estatusPago,
      estatus: v.estatus as VentaMostradorRow["estatus"],
      productos: Math.round((piezas.get(v.id) ?? 0) * 100) / 100,
    };
  });
}

/** FR-011: historial del módulo Ventas, 30 por página, la más reciente primero. */
export async function listarVentas(pagina: number): Promise<PaginaVentasMostrador> {
  const db = getDb();
  const total = db.select({ n: count() }).from(ventasMostrador).get()?.n ?? 0;
  return { filas: filas(db, undefined, pagina), total };
}

/** FR-011: ventas de una clienta, para su ficha en Clientes. */
export async function ventasPorCliente(clienteId: string): Promise<VentaMostradorRow[]> {
  return filas(getDb(), eq(ventasMostrador.clienteId, clienteId));
}

/**
 * "Por cobrar" del módulo Ventas (§23): ventas vigentes de clientas con saldo CALCULADO, la más
 * antigua primero. Sin clienta no hay crédito (BR-003), así que solo entran ventas con clienta.
 */
export async function ventasPorCobrar(): Promise<VentaMostradorRow[]> {
  return filas(getDb(), and(eq(ventasMostrador.estatus, "vigente"), isNotNull(ventasMostrador.clienteId)))
    .filter((v) => v.saldo > TOLERANCIA)
    .reverse();
}

const DIAS_FRECUENTES = 90;
const MAX_FRECUENTES = 8;

/**
 * "Productos frecuentes" del punto de venta (§23): los más vendidos en mostrador en los últimos 90
 * días, por piezas, en ventas vigentes. Solo ids y piezas; el renderer pone nombre, precio y stock.
 */
export async function productosFrecuentes(): Promise<ProductoFrecuente[]> {
  const db = getDb();
  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_FRECUENTES);
  const piezas = sql<number>`SUM(${salidasInventario.cantidad})`;
  return db
    .select({ productoId: salidasInventario.productoId, piezas })
    .from(salidasInventario)
    .innerJoin(ventasMostrador, eq(ventasMostrador.id, salidasInventario.ventaMostradorId))
    .where(and(eq(ventasMostrador.estatus, "vigente"), gte(ventasMostrador.fecha, fechaLocalIso(desde))))
    .groupBy(salidasInventario.productoId)
    .orderBy(desc(piezas))
    .limit(MAX_FRECUENTES)
    .all()
    .map((f) => ({ productoId: f.productoId, piezas: Number(f.piezas) }));
}

/** FR-012: detalle de una venta. Las líneas se agrupan por producto (una línea en varios lotes). */
export async function detalleVenta(ventaId: string): Promise<DetalleVentaMostrador> {
  const db = getDb();
  const [fila] = filas(db, eq(ventasMostrador.id, ventaId));
  if (!fila) throw new Error("La venta no existe.");
  const v = db.select().from(ventasMostrador).where(eq(ventasMostrador.id, ventaId)).get()!;

  const salidas = db
    .select({
      productoId: salidasInventario.productoId,
      nombre: productos.nombre,
      cantidad: salidasInventario.cantidad,
      precio: salidasInventario.precioUnitarioVenta,
    })
    .from(salidasInventario)
    .innerJoin(productos, eq(productos.id, salidasInventario.productoId))
    .where(eq(salidasInventario.ventaMostradorId, ventaId))
    .orderBy(salidasInventario.createdAt)
    .all();
  const porProducto = new Map<string, DetalleVentaMostrador["lineas"][number]>();
  for (const s of salidas) {
    const clave = `${s.productoId}|${s.precio ?? 0}`;
    const l = porProducto.get(clave) ?? { productoId: s.productoId, nombre: s.nombre, cantidad: 0, precioUnitario: s.precio ?? 0, importe: 0 };
    l.cantidad = Math.round((l.cantidad + s.cantidad) * 1000) / 1000;
    l.importe = redondearDinero(l.cantidad * l.precioUnitario);
    porProducto.set(clave, l);
  }

  return {
    ...fila,
    lineas: [...porProducto.values()],
    totalProductos: redondearDinero(v.totalProductos),
    descuento: v.descuento,
    descuentos: descuentosVigentesVenta(db, ventaId),
    pagos: pagosDeVenta(db, ventaId),
    tieneComprobante: await tieneComprobanteVenta(ventaId),
    comprobantes: await listarComprobantesVenta(ventaId),
    observaciones: v.observaciones,
    motivoCancelacion: v.motivoCancelacion,
    canceladaAt: v.canceladaAt instanceof Date ? v.canceladaAt.getTime() : v.canceladaAt ? Number(v.canceladaAt) : null,
    admiteSaldo: Boolean(v.clienteId),
  };
}

/**
 * Único lector de ventas de mostrador para reportes (Gate, condición 11): ventas VIGENTES por la
 * fecha de la venta, con su neto (`totalVenta`). Los reportes nunca suman por su cuenta.
 */
export function ventasDelRango(
  db: DbLectura,
  desde: string,
  hasta: string,
): { id: string; fecha: string; clienteId: string | null; total: number }[] {
  return db
    .select({
      id: ventasMostrador.id,
      fecha: ventasMostrador.fecha,
      clienteId: ventasMostrador.clienteId,
      totalProductos: ventasMostrador.totalProductos,
      descuento: ventasMostrador.descuento,
    })
    .from(ventasMostrador)
    .where(and(eq(ventasMostrador.estatus, "vigente"), gte(ventasMostrador.fecha, desde), lte(ventasMostrador.fecha, hasta)))
    .all()
    .map((v) => ({ id: v.id, fecha: v.fecha, clienteId: v.clienteId, total: totalVenta(v) }));
}

/**
 * Único lector de ventas con saldo (VEN-B1): vigentes y con saldo CALCULADO (no por la caché de
 * estatus). Sin clienta no debería pasar nunca (BR-003 de §23, VEN-A1); si pasara, la cartera la
 * muestra en vez de esconderla. Lo usan la cartera de Resumen y la de Finanzas.
 */
export function ventasConSaldo(db: DbLectura): {
  id: string;
  folio: string;
  fecha: string;
  clienteId: string | null;
  clienteNombre: string | null;
  nombreReferencia: string | null;
  saldo: number;
}[] {
  const lista = db
    .select({
      id: ventasMostrador.id,
      folio: ventasMostrador.folio,
      fecha: ventasMostrador.fecha,
      clienteId: ventasMostrador.clienteId,
      clienteNombre: clientes.nombreCompleto,
      nombreReferencia: ventasMostrador.nombreReferencia,
      totalProductos: ventasMostrador.totalProductos,
      descuento: ventasMostrador.descuento,
      estatus: ventasMostrador.estatus,
    })
    .from(ventasMostrador)
    .leftJoin(clientes, eq(clientes.id, ventasMostrador.clienteId))
    .where(eq(ventasMostrador.estatus, "vigente"))
    .all();
  const cobrado = cobradoPorVenta(db, lista.map((v) => v.id));
  return lista
    .map((v) => ({
      id: v.id,
      folio: v.folio,
      fecha: v.fecha,
      clienteId: v.clienteId,
      clienteNombre: v.clienteNombre ?? null,
      nombreReferencia: v.nombreReferencia,
      saldo: saldoVenta(v, cobrado.get(v.id) ?? 0),
    }))
    .filter((v) => v.saldo > TOLERANCIA);
}
