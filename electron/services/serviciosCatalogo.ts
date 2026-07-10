import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { serviciosCatalogo, serviciosCatalogoProductos, productos } from "../db/schema";
import type { ServicioCatalogoInput, RecetaItemInput } from "../../shared/schemas";
import type { RecetaItem } from "../../shared/types";

export async function listarServiciosCatalogo() {
  const db = getDb();
  return db.select().from(serviciosCatalogo).orderBy(desc(serviciosCatalogo.createdAt)).all();
}

export async function crearServicioCatalogo(input: ServicioCatalogoInput) {
  const db = getDb();
  const id = randomUUID();
  db.insert(serviciosCatalogo)
    .values({
      id,
      nombre: input.nombre,
      categoriaServicio: input.categoriaServicio || null,
      duracionEstimadaMin: input.duracionEstimadaMin ?? null,
      precioSugerido: input.precioSugerido,
      periodicidadMantenimientoDias: input.periodicidadMantenimientoDias ?? null,
      activo: input.activo,
      descripcion: input.descripcion || null,
      notasInternas: input.notasInternas || null,
      consumeInventario: input.consumeInventario,
    })
    .run();
  return db.select().from(serviciosCatalogo).where(eq(serviciosCatalogo.id, id)).get();
}

export async function actualizarServicioCatalogo(id: string, input: ServicioCatalogoInput) {
  const db = getDb();
  db.update(serviciosCatalogo)
    .set({
      nombre: input.nombre,
      categoriaServicio: input.categoriaServicio || null,
      duracionEstimadaMin: input.duracionEstimadaMin ?? null,
      precioSugerido: input.precioSugerido,
      periodicidadMantenimientoDias: input.periodicidadMantenimientoDias ?? null,
      activo: input.activo,
      descripcion: input.descripcion || null,
      notasInternas: input.notasInternas || null,
      consumeInventario: input.consumeInventario,
      updatedAt: new Date(),
    })
    .where(eq(serviciosCatalogo.id, id))
    .run();
  return db.select().from(serviciosCatalogo).where(eq(serviciosCatalogo.id, id)).get();
}

/** Insumos por defecto de un servicio: se sugieren automáticamente al cerrar una cita de ese servicio. */
export async function listarReceta(servicioCatalogoId: string): Promise<RecetaItem[]> {
  const db = getDb();
  return db
    .select({
      id: serviciosCatalogoProductos.id,
      productoId: serviciosCatalogoProductos.productoId,
      productoNombre: productos.nombre,
      cantidadSugerida: serviciosCatalogoProductos.cantidadSugerida,
    })
    .from(serviciosCatalogoProductos)
    .innerJoin(productos, eq(productos.id, serviciosCatalogoProductos.productoId))
    .where(eq(serviciosCatalogoProductos.servicioCatalogoId, servicioCatalogoId))
    .all();
}

export async function guardarReceta(
  servicioCatalogoId: string,
  items: RecetaItemInput[],
): Promise<RecetaItem[]> {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(serviciosCatalogoProductos)
      .where(eq(serviciosCatalogoProductos.servicioCatalogoId, servicioCatalogoId))
      .run();
    for (const item of items) {
      tx.insert(serviciosCatalogoProductos)
        .values({
          id: randomUUID(),
          servicioCatalogoId,
          productoId: item.productoId,
          cantidadSugerida: item.cantidadSugerida,
        })
        .run();
    }
  });
  return listarReceta(servicioCatalogoId);
}
