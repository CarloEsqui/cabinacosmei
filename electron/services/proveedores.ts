import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { proveedores } from "../db/schema";
import type { ProveedorInput } from "../../shared/schemas";

export async function listarProveedores() {
  const db = getDb();
  return db.select().from(proveedores).orderBy(desc(proveedores.createdAt)).all();
}

export async function crearProveedor(input: ProveedorInput) {
  const db = getDb();
  const id = randomUUID();
  db.insert(proveedores)
    .values({
      id,
      nombreComercial: input.nombreComercial,
      razonSocial: input.razonSocial || null,
      contacto: input.contacto || null,
      telefono: input.telefono || null,
      correo: input.correo || null,
      rfc: input.rfc || null,
      diasCredito: input.diasCredito,
      categoria: input.categoria || null,
      activo: input.activo,
      notas: input.notas || null,
    })
    .run();
  return db.select().from(proveedores).where(eq(proveedores.id, id)).get();
}

export async function actualizarProveedor(id: string, input: ProveedorInput) {
  const db = getDb();
  db.update(proveedores)
    .set({
      nombreComercial: input.nombreComercial,
      razonSocial: input.razonSocial || null,
      contacto: input.contacto || null,
      telefono: input.telefono || null,
      correo: input.correo || null,
      rfc: input.rfc || null,
      diasCredito: input.diasCredito,
      categoria: input.categoria || null,
      activo: input.activo,
      notas: input.notas || null,
      updatedAt: new Date(),
    })
    .where(eq(proveedores.id, id))
    .run();
  return db.select().from(proveedores).where(eq(proveedores.id, id)).get();
}
