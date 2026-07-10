import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { tiposProducto } from "../db/schema";
import type { TipoProductoInput } from "../../shared/schemas";

export async function listarTiposProducto() {
  const db = getDb();
  return db.select().from(tiposProducto).orderBy(desc(tiposProducto.createdAt)).all();
}

export async function crearTipoProducto(input: TipoProductoInput) {
  const db = getDb();
  const id = randomUUID();
  db.insert(tiposProducto)
    .values({
      id,
      nombreTipo: input.nombreTipo,
      requiereCaducidad: input.requiereCaducidad,
      seConsumeEnServicio: input.seConsumeEnServicio,
      seVende: input.seVende,
      activo: input.activo,
    })
    .run();
  return db.select().from(tiposProducto).where(eq(tiposProducto.id, id)).get();
}

export async function actualizarTipoProducto(id: string, input: TipoProductoInput) {
  const db = getDb();
  db.update(tiposProducto)
    .set({
      nombreTipo: input.nombreTipo,
      requiereCaducidad: input.requiereCaducidad,
      seConsumeEnServicio: input.seConsumeEnServicio,
      seVende: input.seVende,
      activo: input.activo,
      updatedAt: new Date(),
    })
    .where(eq(tiposProducto.id, id))
    .run();
  return db.select().from(tiposProducto).where(eq(tiposProducto.id, id)).get();
}
