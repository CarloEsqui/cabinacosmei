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

  const id = randomUUID();
  db.insert(usuarios)
    .values({ id, nombre: "Operador", pinHash: "", activo: true })
    .run();
  usuarioPorDefectoId = id;
  return id;
}

export function usuarioActualId(): string | null {
  return usuarioPorDefectoId;
}
