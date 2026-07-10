import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { proveedores, productos, lotes, entradasInventario } from "../db/schema";
import { ErrorConHistorial } from "./errores";
import { registrarAccion } from "./bitacora";
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

/**
 * Las referencias a proveedor son todas `onDelete: set null` (no `restrict`), así que un borrado
 * físico nunca fallaría por sí solo — verificamos el uso a mano para no perder la trazabilidad.
 */
export async function eliminarProveedor(id: string, usuarioId?: string): Promise<void> {
  const db = getDb();
  const enUso =
    db.select({ id: productos.id }).from(productos).where(eq(productos.proveedorPrincipalId, id)).get() ??
    db.select({ id: lotes.id }).from(lotes).where(eq(lotes.proveedorId, id)).get() ??
    db.select({ id: entradasInventario.id }).from(entradasInventario).where(eq(entradasInventario.proveedorId, id)).get();

  if (enUso) {
    throw new ErrorConHistorial(
      "Este proveedor tiene productos, lotes o entradas asociadas. Desactívalo en su lugar.",
    );
  }

  db.delete(proveedores).where(eq(proveedores.id, id)).run();
  registrarAccion(db, {
    usuarioId,
    accion: "proveedor_eliminado",
    entidadTipo: "proveedor",
    entidadId: id,
  });
}

export async function setActivoProveedor(id: string, activo: boolean, usuarioId?: string) {
  const db = getDb();
  db.update(proveedores).set({ activo, updatedAt: new Date() }).where(eq(proveedores.id, id)).run();
  registrarAccion(db, {
    usuarioId,
    accion: activo ? "proveedor_activado" : "proveedor_desactivado",
    entidadTipo: "proveedor",
    entidadId: id,
  });
  return db.select().from(proveedores).where(eq(proveedores.id, id)).get();
}
