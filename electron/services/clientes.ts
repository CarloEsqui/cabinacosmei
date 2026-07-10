import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { getDb } from "../db";
import { clientes, serviciosRealizados, pagos } from "../db/schema";
import { obtenerConfig } from "./config";
import { crearCarpetaCliente } from "./folders";
import { registrarAccion } from "./bitacora";
import { eliminarOFallarConHistorial } from "./errores";
import { listarMantenimientosNoProgramados } from "./citas";
import { fechaLocalIso } from "../../shared/fechas";
import type { ClienteInput } from "../../shared/schemas";
import type { Cliente } from "../../shared/types";

const EPSILON_SALDO = 0.005;

/**
 * Saldo real por clienta = Σ precio de servicios cerrados (sin contar los que quedaron
 * "cancelado" en su estatus de pago) − Σ monto de pagos cobrados. No se usa el campo manual
 * `estatusPago` de servicios_realizados como fuente de verdad porque puede quedar
 * desactualizado (ej. un servicio pagado por completo que alguien nunca marcó "pagado").
 */
export async function calcularSaldosPorCliente(clienteIds: string[]): Promise<Map<string, number>> {
  const db = getDb();
  const mapa = new Map<string, number>();
  if (clienteIds.length === 0) return mapa;

  const cargos = db
    .select({ clienteId: serviciosRealizados.clienteId, precio: serviciosRealizados.precio })
    .from(serviciosRealizados)
    .where(
      and(eq(serviciosRealizados.estatus, "cerrado"), inArray(serviciosRealizados.estatusPago, ["pagado", "parcial", "pendiente"])),
    )
    .all();
  const cobros = db
    .select({ clienteId: pagos.clienteId, monto: pagos.monto })
    .from(pagos)
    .where(eq(pagos.estatus, "cobrado"))
    .all();

  for (const id of clienteIds) mapa.set(id, 0);
  for (const c of cargos) {
    if (!mapa.has(c.clienteId)) continue;
    mapa.set(c.clienteId, (mapa.get(c.clienteId) ?? 0) + (c.precio ?? 0));
  }
  for (const p of cobros) {
    if (!mapa.has(p.clienteId)) continue;
    mapa.set(p.clienteId, (mapa.get(p.clienteId) ?? 0) - p.monto);
  }
  return mapa;
}

/** Avisos rápidos por clienta: mantenimiento por contactar y/o saldo real pendiente. */
async function calcularAlertasPorCliente(clienteIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (clienteIds.length === 0) return mapa;

  const mantenimientos = await listarMantenimientosNoProgramados();
  const conMantenimiento = new Set(mantenimientos.map((m) => m.clienteId));
  const saldos = await calcularSaldosPorCliente(clienteIds);

  for (const id of clienteIds) {
    const alertas: string[] = [];
    if (conMantenimiento.has(id)) alertas.push("Por contactar");
    if ((saldos.get(id) ?? 0) > EPSILON_SALDO) alertas.push("Pago pendiente");
    mapa.set(id, alertas);
  }
  return mapa;
}

function generarCodigoCliente(): string {
  const db = getDb();
  const existentes = db
    .select({ codigo: clientes.codigoCliente })
    .from(clientes)
    .where(like(clientes.codigoCliente, "CL-%"))
    .all();

  let maxN = 0;
  for (const { codigo } of existentes) {
    const match = codigo.match(/-(\d+)$/);
    if (match) maxN = Math.max(maxN, Number(match[1]));
  }
  return `CL-${String(maxN + 1).padStart(4, "0")}`;
}

export async function listarClientes(): Promise<Cliente[]> {
  const db = getDb();
  const filas = db.select().from(clientes).orderBy(desc(clientes.createdAt)).all();
  const alertas = await calcularAlertasPorCliente(filas.map((f) => f.id));
  return filas.map((f) => ({ ...f, alertas: alertas.get(f.id) ?? [] }));
}

export async function crearCliente(input: ClienteInput, usuarioId?: string) {
  const db = getDb();
  const id = randomUUID();
  const codigoCliente = generarCodigoCliente();
  const config = await obtenerConfig();
  const carpetaPath = crearCarpetaCliente(config.carpetaRaiz, codigoCliente, input.nombreCompleto);

  db.insert(clientes)
    .values({
      id,
      codigoCliente,
      nombreCompleto: input.nombreCompleto,
      telefono: input.telefono || null,
      correo: input.correo || null,
      fechaNacimiento: input.fechaNacimiento || null,
      direccion: input.direccion || null,
      contactoEmergencia: input.contactoEmergencia || null,
      fechaAlta: fechaLocalIso(),
      activo: input.activo,
      notas: input.notas || null,
      observaciones: input.observaciones || null,
      carpetaPath,
    })
    .run();
  registrarAccion(db, {
    usuarioId,
    accion: "cliente_creado",
    entidadTipo: "cliente",
    entidadId: id,
    detalle: `${codigoCliente} · ${input.nombreCompleto}`,
  });

  return db.select().from(clientes).where(eq(clientes.id, id)).get();
}

export async function actualizarCliente(id: string, input: ClienteInput, usuarioId?: string) {
  const db = getDb();
  db.update(clientes)
    .set({
      nombreCompleto: input.nombreCompleto,
      telefono: input.telefono || null,
      correo: input.correo || null,
      fechaNacimiento: input.fechaNacimiento || null,
      direccion: input.direccion || null,
      contactoEmergencia: input.contactoEmergencia || null,
      activo: input.activo,
      notas: input.notas || null,
      observaciones: input.observaciones || null,
      updatedAt: new Date(),
    })
    .where(eq(clientes.id, id))
    .run();
  registrarAccion(db, {
    usuarioId,
    accion: "cliente_actualizado",
    entidadTipo: "cliente",
    entidadId: id,
    detalle: input.nombreCompleto,
  });

  return db.select().from(clientes).where(eq(clientes.id, id)).get();
}

export async function eliminarCliente(id: string, usuarioId?: string): Promise<void> {
  const db = getDb();
  eliminarOFallarConHistorial(
    () => db.delete(clientes).where(eq(clientes.id, id)).run(),
    "Esta clienta tiene citas, servicios o pagos asociados. Desactívala en su lugar.",
  );
  registrarAccion(db, {
    usuarioId,
    accion: "cliente_eliminado",
    entidadTipo: "cliente",
    entidadId: id,
  });
}

export async function setActivoCliente(id: string, activo: boolean, usuarioId?: string) {
  const db = getDb();
  db.update(clientes).set({ activo, updatedAt: new Date() }).where(eq(clientes.id, id)).run();
  registrarAccion(db, {
    usuarioId,
    accion: activo ? "cliente_activado" : "cliente_desactivado",
    entidadTipo: "cliente",
    entidadId: id,
  });
  return db.select().from(clientes).where(eq(clientes.id, id)).get();
}

export async function obtenerExpediente(id: string): Promise<Cliente | null> {
  const db = getDb();
  const cliente = db.select().from(clientes).where(eq(clientes.id, id)).get();
  if (!cliente) return null;

  const alertas = await calcularAlertasPorCliente([id]);
  return { ...cliente, alertas: alertas.get(id) ?? [] };
}
