import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import { pagos, serviciosRealizados, citas, clientes, salidasInventario } from "../db/schema";
import { verificarPin } from "./auth";
import { tieneComprobante } from "./archivos";
import { existeSeleccion } from "./seleccionesArchivo";
import { obtenerConfig } from "./config";
import { registrarAccion } from "./bitacora";
import { fechaLocalIso } from "../../shared/fechas";
import type { AbonoInput, AnticipoInput, CancelarPagoInput, LineaPago } from "../../shared/schemas";
import { requiereEvidencia } from "../../shared/schemas";
import type { EstadoCuentaCita, PagoRow } from "../../shared/types";

/**
 * Módulo de cobro v2 (spec .notes/spec-modulo-cobro-2026-11-04.md, migración 0005).
 *
 * ÚNICO escritor de la tabla `pagos` (Gate 001 del cobro, condición 5): el cierre de cita, el
 * corte, los abonos, los anticipos y las cancelaciones pasan por aquí. Y ÚNICA definición de total,
 * cobrado y saldo (condición 6): todo lector de dinero usa `totalTicket`, `cobradoPorServicio`,
 * `saldoServicio` y `saldosPorCliente` en vez de sumar por su cuenta.
 *
 * Dependencias: este módulo no importa los módulos de la Parte B (tarjetas de regalo, descuentos);
 * ellos lo llaman a él (Gate, condición 5).
 */

type Db = ReturnType<typeof getDb>;
// Estructural: acepta `db` o el `tx` de una transacción (como inventario.ts y bitacora.ts).
interface DbOTx {
  select: Db["select"];
  insert: Db["insert"];
  update: Db["update"];
}

export type EstatusPago = "pagado" | "parcial" | "pendiente";

/** Tolerancia para comparar dinero en REAL (BR-002, FR-003). */
export const TOLERANCIA = 0.005;

/** BR-007: todo monto se redondea a 2 decimales en el servidor antes de guardar y de comparar. */
export function redondearDinero(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Definición única de total, cobrado y saldo (FR-008)
// ---------------------------------------------------------------------------

/** Total del ticket = precio del servicio + productos vendidos (FR-002). */
export function totalTicket(s: { precio: number | null; totalProductos: number | null }): number {
  return redondearDinero((s.precio ?? 0) + (s.totalProductos ?? 0));
}

/** FR-003. Un total de $0 sin pagos queda "pagado": no se debe nada. */
export function derivarEstatusPago(total: number, cobrado: number): EstatusPago {
  if (cobrado >= total - TOLERANCIA) return "pagado";
  if (cobrado > 0) return "parcial";
  return "pendiente";
}

/** Saldo de un servicio. El "cancelado" legado (cierre viejo) no debe nada. */
export function saldoServicio(
  s: { precio: number | null; totalProductos: number | null; estatusPago: string },
  cobrado: number,
): number {
  if (s.estatusPago === "cancelado") return 0;
  return Math.max(0, redondearDinero(totalTicket(s) - cobrado));
}

/** Σ pagos cobrados LIGADOS a cada servicio. No incluye anticipos aún sin aplicar. */
export function cobradoPorServicio(db: Pick<DbOTx, "select">, servicioIds: string[]): Map<string, number> {
  const mapa = new Map<string, number>();
  if (servicioIds.length === 0) return mapa;
  const filas = db
    .select({ servicioRealizadoId: pagos.servicioRealizadoId, monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.estatus, "cobrado"), inArray(pagos.servicioRealizadoId, servicioIds)))
    .all();
  for (const p of filas) {
    if (!p.servicioRealizadoId) continue;
    mapa.set(p.servicioRealizadoId, redondearDinero((mapa.get(p.servicioRealizadoId) ?? 0) + p.monto));
  }
  return mapa;
}

export interface SaldoCliente {
  serviciosCerrados: number;
  totalServicios: number;
  totalCobrado: number;
  saldo: number;
}

/**
 * Saldo por clienta = Σ saldos de sus servicios CERRADOS no cancelados (FR-008, AC-006). No resta
 * anticipos de citas sin cerrar ni dinero que no pertenezca a un servicio. `clienteIds` vacío o
 * ausente = todas las clientas.
 */
export function saldosPorCliente(db: Pick<DbOTx, "select">, clienteIds?: string[]): Map<string, SaldoCliente> {
  const condiciones = [eq(serviciosRealizados.estatus, "cerrado"), ne(serviciosRealizados.estatusPago, "cancelado")];
  if (clienteIds && clienteIds.length > 0) condiciones.push(inArray(serviciosRealizados.clienteId, clienteIds));
  const servicios = db
    .select({
      id: serviciosRealizados.id,
      clienteId: serviciosRealizados.clienteId,
      precio: serviciosRealizados.precio,
      totalProductos: serviciosRealizados.totalProductos,
      estatusPago: serviciosRealizados.estatusPago,
    })
    .from(serviciosRealizados)
    .where(and(...condiciones))
    .all();
  const cobrado = cobradoPorServicio(db, servicios.map((s) => s.id));

  const mapa = new Map<string, SaldoCliente>();
  for (const s of servicios) {
    const c = cobrado.get(s.id) ?? 0;
    const acc = mapa.get(s.clienteId) ?? { serviciosCerrados: 0, totalServicios: 0, totalCobrado: 0, saldo: 0 };
    acc.serviciosCerrados += 1;
    acc.totalServicios = redondearDinero(acc.totalServicios + totalTicket(s));
    acc.totalCobrado = redondearDinero(acc.totalCobrado + c);
    acc.saldo = redondearDinero(acc.saldo + saldoServicio(s, c));
    mapa.set(s.clienteId, acc);
  }
  return mapa;
}

/**
 * Ingreso del SERVICIO, sin productos vendidos. Solo para reportes por tipo de servicio (ingreso
 * por hora, margen por servicio), donde una crema vendida en el ticket no es ingreso del facial.
 * Para "ventas" y saldos se usa `totalTicket`.
 */
export function ingresoDelServicio(s: { precio: number | null }): number {
  return redondearDinero(s.precio ?? 0);
}

/**
 * Costo de los productos vendidos EN EL TICKET (salidas tipo venta con precio de venta, cobro v2),
 * por servicio. Va en el margen junto con su ingreso (`totalProductos`): las ventas anteriores a
 * la 0005 no tienen precio de venta ni ingreso en el ticket, así que tampoco cuentan su costo.
 */
export function costoProductosVendidos(db: Pick<DbOTx, "select">, servicioIds: string[]): Map<string, number> {
  const mapa = new Map<string, number>();
  if (servicioIds.length === 0) return mapa;
  const filas = db
    .select({ srId: salidasInventario.servicioRealizadoId, valor: salidasInventario.valor })
    .from(salidasInventario)
    .where(
      and(
        inArray(salidasInventario.servicioRealizadoId, servicioIds),
        eq(salidasInventario.tipoSalida, "venta"),
        eq(salidasInventario.estatus, "vigente"),
        isNotNull(salidasInventario.precioUnitarioVenta),
      ),
    )
    .all();
  for (const f of filas) {
    if (!f.srId) continue;
    mapa.set(f.srId, (mapa.get(f.srId) ?? 0) + (f.valor ?? 0));
  }
  return mapa;
}

/**
 * Dinero cobrado en un rango de fechas de pago (inclusivo): cobranza, métodos de pago, "Cobrado
 * hoy". Solo `fuente = dinero` (BR-010) y solo pagos vigentes.
 */
export function cobrosDeDinero(
  db: Pick<DbOTx, "select">,
  desde: string,
  hasta: string,
): { fecha: string; metodoPago: string; monto: number }[] {
  return db
    .select({ fecha: pagos.fecha, metodoPago: pagos.metodoPago, monto: pagos.monto })
    .from(pagos)
    .where(
      and(eq(pagos.fuente, "dinero"), eq(pagos.estatus, "cobrado"), gte(pagos.fecha, desde), lte(pagos.fecha, hasta)),
    )
    .all();
}

/** Pagos vigentes ligados a un servicio, para su detalle. */
export function pagosCobradosDeServicio(db: Pick<DbOTx, "select">, servicioId: string) {
  return db
    .select({ fecha: pagos.fecha, monto: pagos.monto, metodoPago: pagos.metodoPago })
    .from(pagos)
    .where(and(eq(pagos.servicioRealizadoId, servicioId), eq(pagos.estatus, "cobrado")))
    .orderBy(pagos.createdAt)
    .all();
}

/**
 * ¿La cita tiene CUALQUIER pago (anticipo o del servicio), vigente o cancelado? Un pago es
 * documento contable (CFF art. 30): una cita con pagos no se borra, se cancela (FR-009).
 */
export function citaTienePagos(db: Pick<DbOTx, "select">, citaId: string, servicioId?: string): boolean {
  const fila = db
    .select({ id: pagos.id })
    .from(pagos)
    .where(servicioId ? or(eq(pagos.citaId, citaId), eq(pagos.servicioRealizadoId, servicioId)) : eq(pagos.citaId, citaId))
    .get();
  return Boolean(fila);
}

/** Σ anticipos cobrados de una cita que todavía no se aplican a un servicio. */
export function anticiposSinAplicar(db: Pick<DbOTx, "select">, citaId: string): number {
  const filas = db
    .select({ monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.citaId, citaId), isNull(pagos.servicioRealizadoId), eq(pagos.estatus, "cobrado")))
    .all();
  return redondearDinero(filas.reduce((acc, p) => acc + p.monto, 0));
}

// ---------------------------------------------------------------------------
// Escritura dentro de transacciones (las usan el cierre y el corte)
// ---------------------------------------------------------------------------

interface RegistrarPagosInput {
  clienteId: string;
  servicioRealizadoId?: string | null;
  citaId?: string | null;
  concepto: "servicio" | "anticipo";
  lineas: LineaPago[];
  /** BR-003 / Decisión D: día en que se cobra, nunca la fecha de la cita. */
  fecha: string;
  usuarioId?: string;
}

/**
 * Inserta 1..N pagos `cobrado` de dinero. Valida monto > 0 (redondeado) y método configurado.
 * `metodosValidos` viene de la config, leída FUERA de la transacción (obtenerConfig es async).
 */
export function registrarPagosEnTx(tx: DbOTx, input: RegistrarPagosInput, metodosValidos: string[]): string[] {
  const ids: string[] = [];
  for (const linea of input.lineas) {
    const monto = redondearDinero(linea.monto);
    const metodo = linea.metodoPago.trim();
    if (monto <= 0) throw new Error("Cada pago debe ser mayor a $0.");
    if (!metodosValidos.includes(metodo)) {
      throw new Error(`"${metodo}" no es un método de pago configurado (${metodosValidos.join(", ")}).`);
    }
    const id = randomUUID();
    tx.insert(pagos)
      .values({
        id,
        clienteId: input.clienteId,
        servicioRealizadoId: input.servicioRealizadoId || null,
        citaId: input.citaId || null,
        concepto: input.concepto,
        fuente: "dinero",
        fecha: input.fecha,
        monto,
        metodoPago: metodo,
        estatus: "cobrado",
        usuarioId: input.usuarioId || null,
      })
      .run();
    ids.push(id);
  }
  return ids;
}

/** Liga un comprobante ya guardado a sus pagos (solo trazabilidad; los lista `archivos`). */
export function ligarComprobanteEnTx(tx: Pick<DbOTx, "update">, pagoIds: string[], archivoId: string) {
  if (pagoIds.length === 0) return;
  tx.update(pagos).set({ comprobanteArchivoId: archivoId }).where(inArray(pagos.id, pagoIds)).run();
}

/** COB-A2: el anticipo quedó registrado pero su comprobante no se pudo guardar. */
export function registrarAnticipoSinComprobanteGuardado(citaId: string, motivo: string, usuarioId?: string) {
  const db = getDb();
  const cita = db.select().from(citas).where(eq(citas.id, citaId)).get();
  const cliente = cita
    ? db.select({ codigo: clientes.codigoCliente }).from(clientes).where(eq(clientes.id, cita.clienteId)).get()
    : undefined;
  registrarAccion(db, {
    usuarioId,
    accion: "cobro_sin_comprobante",
    entidadTipo: "cita",
    entidadId: citaId,
    detalle: `${cita ? `${cita.fecha} ${cita.hora} · ` : ""}${cliente?.codigo ?? "clienta"} · anticipo registrado; el comprobante no se pudo guardar (${motivo}).`,
  });
}

export function sumaLineas(lineas: LineaPago[]): number {
  return redondearDinero(lineas.reduce((acc, l) => acc + redondearDinero(l.monto), 0));
}

/** BR-005: el estatus de pago lo escribe SOLO esta función, derivado de total y pagos. */
export function recalcularEstatusEnTx(tx: DbOTx, servicioId: string) {
  const s = tx.select().from(serviciosRealizados).where(eq(serviciosRealizados.id, servicioId)).get();
  if (!s) throw new Error("El servicio realizado no existe.");
  const total = totalTicket(s);
  const cobrado = cobradoPorServicio(tx, [servicioId]).get(servicioId) ?? 0;
  if (s.estatusPago === "cancelado") return { total, cobrado, saldo: 0, estatusPago: s.estatusPago };
  const estatusPago = derivarEstatusPago(total, cobrado);
  if (estatusPago !== s.estatusPago) {
    tx.update(serviciosRealizados)
      .set({ estatusPago, updatedAt: new Date() })
      .where(eq(serviciosRealizados.id, servicioId))
      .run();
  }
  return { total, cobrado, saldo: saldoServicio({ ...s, estatusPago }, cobrado), estatusPago };
}

/** FR-005: al cerrar la cita, sus anticipos cobrados se ligan al servicio y cuentan como pagado. */
export function aplicarAnticiposEnTx(tx: DbOTx, citaId: string, servicioId: string, usuarioId?: string): number {
  const monto = anticiposSinAplicar(tx, citaId);
  if (monto <= 0) return 0;
  tx.update(pagos)
    .set({ servicioRealizadoId: servicioId })
    .where(and(eq(pagos.citaId, citaId), isNull(pagos.servicioRealizadoId), eq(pagos.estatus, "cobrado")))
    .run();
  registrarAccion(tx, {
    usuarioId,
    accion: "anticipo_aplicado",
    entidadTipo: "servicio_realizado",
    entidadId: servicioId,
    detalle: `Anticipo $${monto.toFixed(2)} aplicado al cierre`,
  });
  return monto;
}

/**
 * Liga del corte (BR-006, BR-011; Gate, condiciones 5 y 8). Se llama dentro de la transacción de
 * registrarCorte, DESPUÉS de insertar el corte K y de calcular su resumen:
 *  1) pagos ya cortados y cancelados después → corte_cancelacion_id = K (ajuste negativo en K);
 *  2) todo pago de dinero sin corte → corte_id = K; si además está cancelado (creado y cancelado
 *     en el mismo periodo) → también corte_cancelacion_id = K: neto cero, nunca un ajuste en el
 *     corte siguiente.
 */
export function ligarPagosACorteEnTx(tx: DbOTx, corteId: string): void {
  tx.update(pagos)
    .set({ corteCancelacionId: corteId })
    .where(
      and(
        eq(pagos.fuente, "dinero"),
        eq(pagos.estatus, "cancelado"),
        isNotNull(pagos.corteId),
        isNull(pagos.corteCancelacionId),
      ),
    )
    .run();
  tx.update(pagos)
    .set({ corteId, corteCancelacionId: corteId })
    .where(and(eq(pagos.fuente, "dinero"), eq(pagos.estatus, "cancelado"), isNull(pagos.corteId)))
    .run();
  tx.update(pagos)
    .set({ corteId })
    .where(and(eq(pagos.fuente, "dinero"), eq(pagos.estatus, "cobrado"), isNull(pagos.corteId)))
    .run();
}

// ---------------------------------------------------------------------------
// Operaciones de la UI (IPC cobros:*)
// ---------------------------------------------------------------------------

function textoLineas(lineas: LineaPago[]): string {
  return lineas.map((l) => `${l.metodoPago.trim()} $${redondearDinero(l.monto).toFixed(2)}`).join(" + ");
}

/**
 * FR-004: abono a un servicio cerrado con saldo, desde el detalle de la cita. Mismo control que el
 * cierre (addendum 2026-11-05): sin comprobante y no en efectivo, exige la confirmación explícita.
 */
export async function registrarAbono(input: AbonoInput, usuarioId?: string): Promise<void> {
  const db = getDb();
  const servicio = db.select().from(serviciosRealizados).where(eq(serviciosRealizados.id, input.servicioRealizadoId)).get();
  if (!servicio) throw new Error("El servicio realizado no existe.");

  const sinEvidencia = !(await tieneComprobante(servicio.id)) && requiereEvidencia(input.lineas);
  if (sinEvidencia && !input.sinComprobanteAceptado) {
    throw new Error("Este cobro no es en efectivo y no tiene comprobante. Súbelo o confirma que continúas sin evidencia.");
  }
  const { metodosPago } = await obtenerConfig();
  const hoy = fechaLocalIso();

  db.transaction((tx) => {
    // Los chequeos de estado van DENTRO de la transacción (DIN-M2): dos abonos simultáneos no
    // pueden pasar ambos el "saldo suficiente".
    const s = tx.select().from(serviciosRealizados).where(eq(serviciosRealizados.id, servicio.id)).get()!;
    if (s.estatus !== "cerrado") throw new Error("Solo se registran abonos en citas ya cerradas.");
    if (s.estatusPago === "cancelado") throw new Error("Este servicio está marcado como cancelado; no admite pagos.");
    const cobrado = cobradoPorServicio(tx, [s.id]).get(s.id) ?? 0;
    const saldo = saldoServicio(s, cobrado);
    if (saldo <= TOLERANCIA) throw new Error("Este servicio ya está pagado por completo.");
    const suma = sumaLineas(input.lineas);
    if (suma > saldo + TOLERANCIA) throw new Error(`El pago excede lo que se debe ($${saldo.toFixed(2)}).`);

    registrarPagosEnTx(
      tx,
      { clienteId: s.clienteId, servicioRealizadoId: s.id, concepto: "servicio", lineas: input.lineas, fecha: hoy, usuarioId },
      metodosPago,
    );
    const r = recalcularEstatusEnTx(tx, s.id);
    registrarAccion(tx, {
      usuarioId,
      accion: "pago_registrado",
      entidadTipo: "servicio_realizado",
      entidadId: s.id,
      detalle: `${s.codigoServicio} · abono ${textoLineas(input.lineas)} · queda $${r.saldo.toFixed(2)}${sinEvidencia ? " · sin comprobante (aceptado)" : ""}`,
    });
    if (sinEvidencia) {
      registrarAccion(tx, {
        usuarioId,
        accion: "cobro_sin_comprobante",
        entidadTipo: "servicio_realizado",
        entidadId: s.id,
        detalle: `${s.codigoServicio} · abono: cobro sin efectivo y sin comprobante (aceptado).`,
      });
    }
  });
}

/**
 * FR-005: anticipo sobre una cita programada o confirmada. La cita aún no tiene servicio ni carpeta
 * donde subir comprobante, así que un anticipo que no es en efectivo siempre pide la confirmación
 * explícita (addendum 2026-11-05).
 */
export async function registrarAnticipo(input: AnticipoInput, usuarioId?: string): Promise<string[]> {
  const db = getDb();
  // Con comprobante elegido (se adjunta al terminar, ver comprobantes.ts) sí hay evidencia. El token
  // se verifica contra el main: uno falso o vencido no cuenta (COB-M2).
  const sinEvidencia = requiereEvidencia(input.lineas) && !existeSeleccion(input.comprobanteToken);
  if (sinEvidencia && !input.sinComprobanteAceptado) {
    throw new Error("Este anticipo no es en efectivo. Confirma que continúas sin comprobante.");
  }
  const { metodosPago } = await obtenerConfig();
  const hoy = fechaLocalIso();

  return db.transaction((tx) => {
    const cita = tx.select().from(citas).where(eq(citas.id, input.citaId)).get();
    if (!cita) throw new Error("La cita no existe.");
    if (cita.estado !== "programada" && cita.estado !== "confirmada") {
      throw new Error("Solo se registran anticipos en citas programadas o confirmadas.");
    }
    const cerrado = tx
      .select({ id: serviciosRealizados.id })
      .from(serviciosRealizados)
      .where(and(eq(serviciosRealizados.citaId, cita.id), eq(serviciosRealizados.estatus, "cerrado")))
      .get();
    if (cerrado) throw new Error("Esta cita ya se cerró; registra el pago como abono.");

    const ids = registrarPagosEnTx(
      tx,
      { clienteId: cita.clienteId, citaId: cita.id, concepto: "anticipo", lineas: input.lineas, fecha: hoy, usuarioId },
      metodosPago,
    );
    const cliente = tx.select({ codigo: clientes.codigoCliente }).from(clientes).where(eq(clientes.id, cita.clienteId)).get();
    registrarAccion(tx, {
      usuarioId,
      accion: "anticipo_registrado",
      entidadTipo: "cita",
      entidadId: cita.id,
      detalle: `${cita.fecha} ${cita.hora} · ${cliente?.codigo ?? "clienta"} · ${textoLineas(input.lineas)}${sinEvidencia ? " · sin comprobante (aceptado)" : ""}`,
    });
    if (sinEvidencia) {
      registrarAccion(tx, {
        usuarioId,
        accion: "cobro_sin_comprobante",
        entidadTipo: "cita",
        entidadId: cita.id,
        detalle: `${cita.fecha} ${cita.hora} · ${cliente?.codigo ?? "clienta"} · anticipo: sin efectivo y sin comprobante (aceptado).`,
      });
    }
    return ids;
  });
}

/**
 * FR-006 / BR-001 / BR-009: cancela un pago (nunca lo borra), siempre con PIN y motivo. Si ya se
 * había cortado, el próximo corte lo muestra como ajuste negativo (ligarPagosACorteEnTx).
 */
export async function cancelarPago(input: CancelarPagoInput, usuarioId?: string): Promise<void> {
  const db = getDb();
  if (!(await verificarPin(input.pin))) throw new Error("El PIN de acceso no es correcto.");

  db.transaction((tx) => {
    const pago = tx.select().from(pagos).where(eq(pagos.id, input.pagoId)).get();
    if (!pago) throw new Error("El pago no existe.");
    if (pago.estatus !== "cobrado") throw new Error("Este pago ya estaba cancelado.");
    tx.update(pagos)
      .set({
        estatus: "cancelado",
        canceladoAt: new Date(),
        motivoCancelacion: input.motivo.trim(),
        canceladoPor: usuarioId || null,
      })
      .where(eq(pagos.id, pago.id))
      .run();
    if (pago.servicioRealizadoId) recalcularEstatusEnTx(tx, pago.servicioRealizadoId);
    registrarAccion(tx, {
      usuarioId,
      accion: "pago_cancelado",
      entidadTipo: "pago",
      entidadId: pago.id,
      detalle: `${pago.metodoPago} $${pago.monto.toFixed(2)}${pago.corteId ? " (ya cortado: ajuste en el próximo corte)" : ""} · motivo: ${input.motivo.trim()}`,
    });
  });
}

/**
 * Pagos y saldo de una cita, antes o después de cerrarla: anticipos (cita_id) y pagos del servicio
 * cerrado de esa cita. Lo usa el detalle de la cita.
 */
export async function estadoCuentaCita(citaId: string): Promise<EstadoCuentaCita> {
  const db = getDb();
  const servicio = db
    .select()
    .from(serviciosRealizados)
    .where(and(eq(serviciosRealizados.citaId, citaId), eq(serviciosRealizados.estatus, "cerrado")))
    .get();

  const filas = db
    .select()
    .from(pagos)
    .where(servicio ? or(eq(pagos.citaId, citaId), eq(pagos.servicioRealizadoId, servicio.id)) : eq(pagos.citaId, citaId))
    .orderBy(pagos.createdAt)
    .all();

  const lista: PagoRow[] = filas.map((p) => ({
    id: p.id,
    fecha: p.fecha,
    monto: p.monto,
    metodoPago: p.metodoPago,
    estatus: p.estatus,
    concepto: p.concepto,
    motivoCancelacion: p.motivoCancelacion,
    enCorte: p.corteId !== null,
  }));

  if (!servicio) {
    return { pagos: lista, cerrada: false, total: null, cobrado: 0, saldo: 0, anticipos: anticiposSinAplicar(db, citaId) };
  }
  const cobrado = cobradoPorServicio(db, [servicio.id]).get(servicio.id) ?? 0;
  return {
    pagos: lista,
    cerrada: true,
    servicioRealizadoId: servicio.id,
    estatusPago: servicio.estatusPago,
    tieneComprobante: await tieneComprobante(servicio.id),
    total: totalTicket(servicio),
    cobrado,
    saldo: saldoServicio(servicio, cobrado),
    anticipos: 0,
  };
}
