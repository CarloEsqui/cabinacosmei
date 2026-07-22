import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import { citas, clientes, serviciosCatalogo, serviciosRealizados, pagos } from "../db/schema";
import { registrarAccion } from "./bitacora";
import { fechaLocalIso } from "../../shared/fechas";
import type { CitaInput, CitasFiltro } from "../../shared/schemas";
import type { CitaRow, MantenimientoPendiente, ResumenClienteCitas } from "../../shared/types";

function mapear(
  fila: {
    cita: typeof citas.$inferSelect;
    clienteNombre: string;
    servicioNombre: string | null;
    servicioRealizadoId: string | null;
    precio: number | null;
    estatusPagoServicio: string | null;
  },
  pagosPorServicio: Map<string, number>,
): CitaRow {
  let saldoPendiente = 0;
  if (fila.servicioRealizadoId && fila.estatusPagoServicio !== "cancelado") {
    const cobrado = pagosPorServicio.get(fila.servicioRealizadoId) ?? 0;
    saldoPendiente = Math.max(0, (fila.precio ?? 0) - cobrado);
  }
  return {
    id: fila.cita.id,
    clienteId: fila.cita.clienteId,
    clienteNombre: fila.clienteNombre,
    servicioCatalogoId: fila.cita.servicioCatalogoId,
    servicioNombre: fila.servicioNombre,
    fecha: fila.cita.fecha,
    hora: fila.cita.hora,
    duracionMin: fila.cita.duracionMin,
    estado: fila.cita.estado,
    esMantenimiento: fila.cita.esMantenimiento,
    notas: fila.cita.notas,
    servicioRealizadoId: fila.servicioRealizadoId,
    saldoPendiente,
  };
}

export async function listarCitas(filtro: CitasFiltro): Promise<CitaRow[]> {
  const db = getDb();
  const condiciones = [];
  if (filtro.fechaDesde) condiciones.push(gte(citas.fecha, filtro.fechaDesde));
  if (filtro.fechaHasta) condiciones.push(lte(citas.fecha, filtro.fechaHasta));
  if (filtro.estados && filtro.estados.length > 0) condiciones.push(inArray(citas.estado, filtro.estados));
  if (filtro.clienteId) condiciones.push(eq(citas.clienteId, filtro.clienteId));

  const filas = db
    .select({
      cita: citas,
      clienteNombre: clientes.nombreCompleto,
      servicioNombre: serviciosCatalogo.nombre,
      servicioRealizadoId: serviciosRealizados.id,
      precio: serviciosRealizados.precio,
      estatusPagoServicio: serviciosRealizados.estatusPago,
    })
    .from(citas)
    .innerJoin(clientes, eq(citas.clienteId, clientes.id))
    .leftJoin(serviciosCatalogo, eq(citas.servicioCatalogoId, serviciosCatalogo.id))
    .leftJoin(serviciosRealizados, eq(serviciosRealizados.citaId, citas.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(citas.fecha), desc(citas.hora))
    .all();

  const servicioIds = filas.map((f) => f.servicioRealizadoId).filter((id): id is string => !!id);
  const pagosPorServicio = new Map<string, number>();
  if (servicioIds.length > 0) {
    const pagosFilas = db
      .select({ servicioRealizadoId: pagos.servicioRealizadoId, monto: pagos.monto })
      .from(pagos)
      .where(and(eq(pagos.estatus, "cobrado"), inArray(pagos.servicioRealizadoId, servicioIds)))
      .all();
    for (const p of pagosFilas) {
      if (!p.servicioRealizadoId) continue;
      pagosPorServicio.set(p.servicioRealizadoId, (pagosPorServicio.get(p.servicioRealizadoId) ?? 0) + p.monto);
    }
  }

  return filas.map((f) => mapear(f, pagosPorServicio));
}

export async function crearCita(input: CitaInput, usuarioId?: string) {
  const db = getDb();
  const id = randomUUID();
  db.insert(citas)
    .values({
      id,
      clienteId: input.clienteId,
      servicioCatalogoId: input.servicioCatalogoId || null,
      fecha: input.fecha,
      hora: input.hora,
      duracionMin: input.duracionMin,
      estado: "programada",
      origen: "manual",
      notas: input.notas || null,
    })
    .run();
  registrarAccion(db, {
    usuarioId,
    accion: "cita_creada",
    entidadTipo: "cita",
    entidadId: id,
    detalle: `${input.fecha} ${input.hora}`,
  });
  return db.select().from(citas).where(eq(citas.id, id)).get();
}

export async function actualizarCita(id: string, input: CitaInput, usuarioId?: string) {
  const db = getDb();
  db.update(citas)
    .set({
      clienteId: input.clienteId,
      servicioCatalogoId: input.servicioCatalogoId || null,
      fecha: input.fecha,
      hora: input.hora,
      duracionMin: input.duracionMin,
      notas: input.notas || null,
      updatedAt: new Date(),
    })
    .where(eq(citas.id, id))
    .run();
  registrarAccion(db, {
    usuarioId,
    accion: "cita_actualizada",
    entidadTipo: "cita",
    entidadId: id,
    detalle: `${input.fecha} ${input.hora}`,
  });
  return db.select().from(citas).where(eq(citas.id, id)).get();
}

export async function cambiarEstadoCita(id: string, estado: string, usuarioId?: string) {
  const db = getDb();
  db.update(citas).set({ estado, updatedAt: new Date() }).where(eq(citas.id, id)).run();
  registrarAccion(db, {
    usuarioId,
    accion: "cita_cambio_estado",
    entidadTipo: "cita",
    entidadId: id,
    detalle: `Nuevo estado: ${estado}`,
  });
  return db.select().from(citas).where(eq(citas.id, id)).get();
}

/**
 * Clientas cuyo servicio ya sugiere una fecha de mantenimiento vencida o próxima, y que
 * todavía no tienen ninguna cita futura activa agendada.
 */
export async function listarMantenimientosNoProgramados(): Promise<MantenimientoPendiente[]> {
  const db = getDb();
  const hoy = fechaLocalIso();

  // Se toma el servicio cerrado MÁS RECIENTE de cada clienta (tenga o no sugerencia), y solo
  // después se decide si hay que avisar. Si primero se filtrara por "tiene sugerencia vencida"
  // (como antes), una visita nueva sin sugerencia vencida —o sin sugerencia del todo— quedaba
  // invisible para esta consulta y la sugerencia VIEJA de una visita anterior volvía a aparecer
  // en cuanto la cita de mantenimiento agendada para atenderla se cerraba (al cerrarse deja de
  // contar como "cita futura activa", pero la fila vieja seguía cumpliendo la condición).
  const cerrados = db
    .select({
      servicioRealizadoId: serviciosRealizados.id,
      clienteId: serviciosRealizados.clienteId,
      clienteNombre: clientes.nombreCompleto,
      servicioNombre: serviciosCatalogo.nombre,
      fechaUltimoServicio: serviciosRealizados.fecha,
      fechaSugerida: serviciosRealizados.proximaCitaSugerida,
    })
    .from(serviciosRealizados)
    .innerJoin(clientes, eq(serviciosRealizados.clienteId, clientes.id))
    .leftJoin(serviciosCatalogo, eq(serviciosRealizados.servicioCatalogoId, serviciosCatalogo.id))
    .where(eq(serviciosRealizados.estatus, "cerrado"))
    .orderBy(desc(serviciosRealizados.fecha), desc(serviciosRealizados.createdAt))
    .all();

  const ultimoPorCliente = new Map<string, (typeof cerrados)[number]>();
  for (const c of cerrados) {
    if (!ultimoPorCliente.has(c.clienteId)) ultimoPorCliente.set(c.clienteId, c);
  }

  const citasFuturasActivas = db
    .select({ clienteId: citas.clienteId })
    .from(citas)
    .where(and(gte(citas.fecha, hoy), inArray(citas.estado, ["programada", "confirmada"])))
    .all();
  const clientesConCitaFutura = new Set(citasFuturasActivas.map((c) => c.clienteId));

  const resultado: MantenimientoPendiente[] = [];
  for (const c of ultimoPorCliente.values()) {
    if (!c.fechaSugerida || c.fechaSugerida > hoy) continue;
    if (clientesConCitaFutura.has(c.clienteId)) continue;
    resultado.push({
      servicioRealizadoId: c.servicioRealizadoId,
      clienteId: c.clienteId,
      clienteNombre: c.clienteNombre,
      servicioNombre: c.servicioNombre,
      fechaUltimoServicio: c.fechaUltimoServicio,
      fechaSugerida: c.fechaSugerida,
    });
  }
  return resultado;
}

/**
 * Descarta la sugerencia de mantenimiento de un servicio ya cerrado (ej. la clienta no quiere
 * agendar). Simplemente limpia `proximaCitaSugerida`, así deja de aparecer en la lista.
 */
export async function descartarMantenimiento(servicioRealizadoId: string, usuarioId?: string): Promise<void> {
  const db = getDb();
  db.update(serviciosRealizados)
    .set({ proximaCitaSugerida: null, updatedAt: new Date() })
    .where(eq(serviciosRealizados.id, servicioRealizadoId))
    .run();
  registrarAccion(db, {
    usuarioId,
    accion: "mantenimiento_descartado",
    entidadTipo: "servicio_realizado",
    entidadId: servicioRealizadoId,
  });
}

/**
 * Resumen de servicios/pagos de una clienta, para mostrarse junto a la búsqueda por cliente
 * en la sección de Citas (reemplaza al historial que antes vivía en el expediente).
 */
export async function resumenCliente(clienteId: string): Promise<ResumenClienteCitas> {
  const db = getDb();

  const servicios = db
    .select({ precio: serviciosRealizados.precio, estatusPago: serviciosRealizados.estatusPago })
    .from(serviciosRealizados)
    .where(and(eq(serviciosRealizados.clienteId, clienteId), eq(serviciosRealizados.estatus, "cerrado")))
    .all();
  const serviciosFacturables = servicios.filter((s) => s.estatusPago !== "cancelado");
  const totalServicios = serviciosFacturables.reduce((suma, s) => suma + (s.precio ?? 0), 0);

  const cobros = db
    .select({ monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.clienteId, clienteId), eq(pagos.estatus, "cobrado")))
    .all();
  const totalCobrado = cobros.reduce((suma, p) => suma + p.monto, 0);

  return {
    serviciosCerrados: serviciosFacturables.length,
    totalCobrado,
    saldoPendiente: Math.max(0, totalServicios - totalCobrado),
  };
}
