import { randomUUID } from "node:crypto";
import { desc, eq, like } from "drizzle-orm";
import { getDb } from "../db";
import { productos, tiposProducto } from "../db/schema";
import { registrarAccion } from "./bitacora";
import type { ProductoInput } from "../../shared/schemas";

function prefijoDesdeNombre(nombreTipo: string | undefined): string {
  const limpio = nombreTipo
    ? nombreTipo
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z]/g, "")
        .toUpperCase()
    : "";
  return (limpio.slice(0, 2) || "PR").padEnd(2, "X");
}

function generarSku(tipoProductoId: string | null | undefined): string {
  const db = getDb();
  const tipo = tipoProductoId
    ? db.select().from(tiposProducto).where(eq(tiposProducto.id, tipoProductoId)).get()
    : undefined;
  const prefijo = prefijoDesdeNombre(tipo?.nombreTipo);

  const existentes = db
    .select({ sku: productos.sku })
    .from(productos)
    .where(like(productos.sku, `${prefijo}-%`))
    .all();

  let maxN = 0;
  for (const { sku } of existentes) {
    const match = sku?.match(/-(\d+)$/);
    if (match) maxN = Math.max(maxN, Number(match[1]));
  }

  return `${prefijo}-${String(maxN + 1).padStart(3, "0")}`;
}

export async function listarProductos() {
  const db = getDb();
  return db.select().from(productos).orderBy(desc(productos.createdAt)).all();
}

export async function crearProducto(input: ProductoInput, usuarioId?: string) {
  const db = getDb();
  const id = randomUUID();
  const sku = generarSku(input.tipoProductoId);
  db.insert(productos)
    .values({
      id,
      sku,
      nombre: input.nombre,
      linea: input.linea || null,
      tipoProductoId: input.tipoProductoId || null,
      unidadMedida: input.unidadMedida || null,
      proveedorPrincipalId: input.proveedorPrincipalId || null,
      costoBase: input.costoBase,
      precioVenta: input.precioVenta,
      stockMinimoManual: input.stockMinimoManual ?? null,
      ubicacion: input.ubicacion || null,
      presentacion: input.presentacion || null,
      activo: input.activo,
      observaciones: input.observaciones || null,
    })
    .run();
  registrarAccion(db, {
    usuarioId,
    accion: "producto_creado",
    entidadTipo: "producto",
    entidadId: id,
    detalle: `${sku} · ${input.nombre}`,
  });
  return db.select().from(productos).where(eq(productos.id, id)).get();
}

export async function actualizarProducto(id: string, input: ProductoInput, usuarioId?: string) {
  const db = getDb();
  db.update(productos)
    .set({
      nombre: input.nombre,
      linea: input.linea || null,
      tipoProductoId: input.tipoProductoId || null,
      unidadMedida: input.unidadMedida || null,
      proveedorPrincipalId: input.proveedorPrincipalId || null,
      costoBase: input.costoBase,
      precioVenta: input.precioVenta,
      stockMinimoManual: input.stockMinimoManual ?? null,
      ubicacion: input.ubicacion || null,
      presentacion: input.presentacion || null,
      activo: input.activo,
      observaciones: input.observaciones || null,
      updatedAt: new Date(),
    })
    .where(eq(productos.id, id))
    .run();
  registrarAccion(db, {
    usuarioId,
    accion: "producto_actualizado",
    entidadTipo: "producto",
    entidadId: id,
    detalle: input.nombre,
  });
  return db.select().from(productos).where(eq(productos.id, id)).get();
}
