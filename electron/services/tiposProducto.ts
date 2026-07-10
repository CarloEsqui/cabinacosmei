import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { tiposProducto } from "../db/schema";
import { eliminarOFallarConHistorial } from "./errores";
import { registrarAccion } from "./bitacora";
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

export async function eliminarTipoProducto(id: string, usuarioId?: string): Promise<void> {
  const db = getDb();
  eliminarOFallarConHistorial(
    () => db.delete(tiposProducto).where(eq(tiposProducto.id, id)).run(),
    "Este tipo tiene productos asociados. Desactívalo en su lugar.",
  );
  registrarAccion(db, {
    usuarioId,
    accion: "tipo_producto_eliminado",
    entidadTipo: "tipo_producto",
    entidadId: id,
  });
}

export async function setActivoTipoProducto(id: string, activo: boolean, usuarioId?: string) {
  const db = getDb();
  db.update(tiposProducto).set({ activo, updatedAt: new Date() }).where(eq(tiposProducto.id, id)).run();
  registrarAccion(db, {
    usuarioId,
    accion: activo ? "tipo_producto_activado" : "tipo_producto_desactivado",
    entidadTipo: "tipo_producto",
    entidadId: id,
  });
  return db.select().from(tiposProducto).where(eq(tiposProducto.id, id)).get();
}
