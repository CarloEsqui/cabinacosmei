import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { usuarios } from "../db/schema";

let usuarioPorDefectoId: string | null = null;

export async function asegurarUsuarioPorDefecto(): Promise<string> {
  if (usuarioPorDefectoId) return usuarioPorDefectoId;

  const db = getDb();
  const existente = db.select().from(usuarios).limit(1).get();
  if (existente) {
    usuarioPorDefectoId = existente.id;
    return existente.id;
  }

  // Nombre vacío = "todavía no lo ha capturado" (se le pide al crear el PIN por primera vez).
  const id = randomUUID();
  db.insert(usuarios)
    .values({ id, nombre: "", pinHash: "", activo: true })
    .run();
  usuarioPorDefectoId = id;
  return id;
}

export function usuarioActualId(): string | null {
  return usuarioPorDefectoId;
}

export interface PerfilUsuario {
  id: string;
  nombre: string;
}

export async function obtenerUsuarioActual(): Promise<PerfilUsuario> {
  const id = await asegurarUsuarioPorDefecto();
  const db = getDb();
  const fila = db.select().from(usuarios).where(eq(usuarios.id, id)).get()!;
  return { id: fila.id, nombre: fila.nombre };
}

export async function actualizarNombreUsuario(nombre: string): Promise<PerfilUsuario> {
  const limpio = nombre.trim();
  if (limpio.length < 2 || limpio.length > 40) {
    throw new Error("El nombre debe tener entre 2 y 40 caracteres.");
  }
  const id = await asegurarUsuarioPorDefecto();
  const db = getDb();
  db.update(usuarios).set({ nombre: limpio }).where(eq(usuarios.id, id)).run();
  return { id, nombre: limpio };
}
