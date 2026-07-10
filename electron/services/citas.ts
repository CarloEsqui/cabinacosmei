import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../db";
import { citas, clientes, serviciosCatalogo, serviciosRealizados } from "../db/schema";
import { registrarAccion } from "./bitacora";
import type { CitaInput, CitasFiltro } from "../../shared/schemas";
import type { CitaRow, MantenimientoPendiente } from "../../shared/types";

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapear(fila: {
  cita: typeof citas.$inferSelect;
  clienteNombre: string;
  servicioNombre: string | null;
  servicioRealizadoId: string | null;
}): CitaRow {
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
  };
}

export async function listarCitas(filtro: CitasFiltro): Promise<CitaRow[]> {
  const db = getDb();
  const condiciones = [];
  if (filtro.fechaDesde) condiciones.push(gte(citas.fecha, filtro.fechaDesde));
  if (filtro.fechaHasta) condiciones.push(lte(citas.fecha, filtro.fechaHasta));
  if (filtro.estado) condiciones.push(eq(citas.estado, filtro.estado));
  if (filtro.clienteId) condiciones.push(eq(citas.clienteId, filtro.clienteId));

  const filas = db
    .select({
      cita: citas,
      clienteNombre: clientes.nombreCompleto,
      servicioNombre: serviciosCatalogo.nombre,
      servicioRealizadoId: serviciosRealizados.id,
    })
    .from(citas)
    .innerJoin(clientes, eq(citas.clienteId, clientes.id))
    .leftJoin(serviciosCatalogo, eq(citas.servicioCatalogoId, serviciosCatalogo.id))
    .leftJoin(serviciosRealizados, eq(serviciosRealizados.citaId, citas.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(asc(citas.fecha), asc(citas.hora))
    .all();

  return filas.map(mapear);
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
  const hoy = hoyIso();

  const candidatos = db
    .select({
      clienteId: serviciosRealizados.clienteId,
      clienteNombre: clientes.nombreCompleto,
      servicioNombre: serviciosCatalogo.nombre,
      fechaUltimoServicio: serviciosRealizados.fecha,
      fechaSugerida: serviciosRealizados.proximaCitaSugerida,
    })
    .from(serviciosRealizados)
    .innerJoin(clientes, eq(serviciosRealizados.clienteId, clientes.id))
    .leftJoin(serviciosCatalogo, eq(serviciosRealizados.servicioCatalogoId, serviciosCatalogo.id))
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        isNotNull(serviciosRealizados.proximaCitaSugerida),
        lte(serviciosRealizados.proximaCitaSugerida, hoy),
      ),
    )
    .orderBy(desc(serviciosRealizados.fecha))
    .all();

  const citasFuturasActivas = db
    .select({ clienteId: citas.clienteId })
    .from(citas)
    .where(and(gte(citas.fecha, hoy), eq(citas.estado, "programada")))
    .all();
  const clientesConCitaFutura = new Set(citasFuturasActivas.map((c) => c.clienteId));

  const vistos = new Set<string>();
  const resultado: MantenimientoPendiente[] = [];
  for (const c of candidatos) {
    if (clientesConCitaFutura.has(c.clienteId)) continue;
    if (vistos.has(c.clienteId)) continue; // solo el más reciente por clienta
    vistos.add(c.clienteId);
    resultado.push({
      clienteId: c.clienteId,
      clienteNombre: c.clienteNombre,
      servicioNombre: c.servicioNombre,
      fechaUltimoServicio: c.fechaUltimoServicio,
      fechaSugerida: c.fechaSugerida!,
    });
  }
  return resultado;
}
