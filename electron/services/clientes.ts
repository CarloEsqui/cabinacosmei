import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { desc, eq, like } from "drizzle-orm";
import { getDb } from "../db";
import { clientes } from "../db/schema";
import { saldosPorCliente } from "./cobros";
import { obtenerConfig } from "./config";
import { carpetaDatos, crearCarpetaCliente, rutaDentroDe } from "./folders";
import { registrarAccion } from "./bitacora";
import { eliminarOFallarConHistorial } from "./errores";
import { listarMantenimientosNoProgramados } from "./citas";
import { fechaLocalIso } from "../../shared/fechas";
import type { ClienteInput } from "../../shared/schemas";
import type { Cliente } from "../../shared/types";

const EPSILON_SALDO = 0.005;

/**
 * Saldo real por clienta: la definición única de cobros.saldosPorCliente (FR-008) — Σ saldos de
 * sus servicios cerrados no cancelados. Ya NO resta todos los pagos de la clienta: un anticipo de
 * una cita futura no es saldo a favor (AC-006).
 */
export async function calcularSaldosPorCliente(clienteIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (clienteIds.length === 0) return mapa;
  const saldos = saldosPorCliente(getDb(), clienteIds);
  for (const id of clienteIds) mapa.set(id, saldos.get(id)?.saldo ?? 0);
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

/**
 * Carpeta de la clienta en disco. Si no existe (clientas importadas o creadas sin carpeta, o una
 * carpeta borrada a mano), se crea y se guarda. Así subir un comprobante nunca queda bloqueado.
 */
export async function asegurarCarpetaCliente(clienteId: string): Promise<string> {
  const db = getDb();
  const c = db.select().from(clientes).where(eq(clientes.id, clienteId)).get();
  if (!c) throw new Error("La clienta no existe.");
  if (c.carpetaPath && fs.existsSync(c.carpetaPath)) return c.carpetaPath;
  const config = await obtenerConfig();
  // COB-M4: si la carpeta del negocio no está (disco externo desmontado, raíz movida), no se crea
  // nada: crear aquí dejaría a la clienta con dos carpetas.
  if (!fs.existsSync(carpetaDatos(config.carpetaRaiz))) {
    throw new Error("La carpeta del negocio no está disponible. Revisa que el disco esté conectado.");
  }
  // Si la ruta guardada sigue dentro del negocio, se recrea en el mismo lugar (sin "_2").
  if (c.carpetaPath && rutaDentroDe(c.carpetaPath, config.carpetaRaiz)) {
    fs.mkdirSync(c.carpetaPath, { recursive: true });
    return c.carpetaPath;
  }
  const ruta = crearCarpetaCliente(config.carpetaRaiz, c.codigoCliente, c.nombreCompleto);
  db.update(clientes).set({ carpetaPath: ruta }).where(eq(clientes.id, clienteId)).run();
  registrarAccion(db, {
    accion: "carpeta_recreada",
    entidadTipo: "cliente",
    entidadId: clienteId,
    detalle: `${c.codigoCliente} · se creó su carpeta en el negocio.`,
  });
  return ruta;
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
