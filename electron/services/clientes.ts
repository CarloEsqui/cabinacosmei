import { randomUUID } from "node:crypto";
import { desc, eq, like } from "drizzle-orm";
import { getDb } from "../db";
import { clientes, citas, serviciosRealizados, serviciosCatalogo, pagos } from "../db/schema";
import { obtenerConfig } from "./config";
import { crearCarpetaCliente } from "./folders";
import { registrarAccion } from "./bitacora";
import type { ClienteInput } from "../../shared/schemas";
import type { ClienteExpediente } from "../../shared/types";

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
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

export async function listarClientes() {
  const db = getDb();
  return db.select().from(clientes).orderBy(desc(clientes.createdAt)).all();
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
      fechaAlta: hoyIso(),
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

export async function obtenerExpediente(id: string): Promise<ClienteExpediente | null> {
  const db = getDb();
  const cliente = db.select().from(clientes).where(eq(clientes.id, id)).get();
  if (!cliente) return null;

  const citasFilas = db
    .select({
      id: citas.id,
      fecha: citas.fecha,
      hora: citas.hora,
      estado: citas.estado,
      servicioNombre: serviciosCatalogo.nombre,
    })
    .from(citas)
    .leftJoin(serviciosCatalogo, eq(citas.servicioCatalogoId, serviciosCatalogo.id))
    .where(eq(citas.clienteId, id))
    .orderBy(desc(citas.fecha))
    .all();

  const serviciosFilas = db
    .select({
      id: serviciosRealizados.id,
      codigoServicio: serviciosRealizados.codigoServicio,
      fecha: serviciosRealizados.fecha,
      servicioNombre: serviciosCatalogo.nombre,
      precio: serviciosRealizados.precio,
      estatusPago: serviciosRealizados.estatusPago,
      estatus: serviciosRealizados.estatus,
    })
    .from(serviciosRealizados)
    .leftJoin(serviciosCatalogo, eq(serviciosRealizados.servicioCatalogoId, serviciosCatalogo.id))
    .where(eq(serviciosRealizados.clienteId, id))
    .orderBy(desc(serviciosRealizados.fecha))
    .all();

  const pagosFilas = db
    .select({
      id: pagos.id,
      fecha: pagos.fecha,
      monto: pagos.monto,
      metodoPago: pagos.metodoPago,
      estatus: pagos.estatus,
    })
    .from(pagos)
    .where(eq(pagos.clienteId, id))
    .orderBy(desc(pagos.fecha))
    .all();

  return { cliente, citas: citasFilas, servicios: serviciosFilas, pagos: pagosFilas };
}
