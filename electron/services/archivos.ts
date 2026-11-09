import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { archivos } from "../db/schema";
import { carpetaDatos, sanitizarNombre, rutaDentroDe } from "./folders";
import { obtenerConfig } from "./config";

/** Anti-colisión para archivos: agrega sufijo antes de la extensión (a.jpg -> a_2.jpg). */
function rutaArchivoSinColision(rutaBase: string): string {
  if (!fs.existsSync(rutaBase)) return rutaBase;
  const ext = path.extname(rutaBase);
  const base = rutaBase.slice(0, rutaBase.length - ext.length);
  let intento = 2;
  let candidata = `${base}_${intento}${ext}`;
  while (fs.existsSync(candidata)) {
    intento += 1;
    candidata = `${base}_${intento}${ext}`;
  }
  return candidata;
}

interface GuardarArchivoInput {
  entidadTipo: string;
  entidadId: string;
  rutaOrigen: string;
  carpetaDestino: string;
  categoria: string;
  /** Ficha clínica (Gate, condición 7d): las fotos guardan su tipo MIME. */
  tipoMime?: string;
  usuarioId?: string;
}

export async function guardarArchivoDesdeRuta(input: GuardarArchivoInput) {
  const config = await obtenerConfig();
  if (!rutaDentroDe(input.carpetaDestino, config.carpetaRaiz)) {
    throw new Error("La carpeta de destino está fuera de la carpeta del negocio.");
  }

  const db = getDb();
  const nombreOriginal = path.basename(input.rutaOrigen);
  const ext = path.extname(nombreOriginal);
  const nombreBase = sanitizarNombre(path.basename(nombreOriginal, ext));
  const rutaDestino = rutaArchivoSinColision(path.join(input.carpetaDestino, `${nombreBase}${ext}`));

  fs.mkdirSync(input.carpetaDestino, { recursive: true });
  fs.copyFileSync(input.rutaOrigen, rutaDestino);

  const id = randomUUID();
  db.insert(archivos)
    .values({
      id,
      entidadTipo: input.entidadTipo,
      entidadId: input.entidadId,
      nombreOriginal,
      nombreGuardado: path.basename(rutaDestino),
      rutaFisica: rutaDestino,
      categoria: input.categoria,
      tipoMime: input.tipoMime ?? null,
      usuarioId: input.usuarioId || null,
    })
    .run();

  return db.select().from(archivos).where(eq(archivos.id, id)).get();
}

export async function listarArchivos(entidadTipo: string, entidadId: string) {
  const db = getDb();
  return db
    .select()
    .from(archivos)
    .where(and(eq(archivos.entidadTipo, entidadTipo), eq(archivos.entidadId, entidadId)))
    .orderBy(desc(archivos.createdAt))
    .all();
}

/** ¿La venta de mostrador tiene comprobante? (0008; entidad `venta_mostrador`). */
export async function tieneComprobanteVenta(ventaMostradorId: string): Promise<boolean> {
  const db = getDb();
  const fila = db
    .select({ id: archivos.id })
    .from(archivos)
    .where(
      and(
        eq(archivos.entidadTipo, "venta_mostrador"),
        eq(archivos.entidadId, ventaMostradorId),
        eq(archivos.categoria, "comprobante"),
      ),
    )
    .get();
  return Boolean(fila);
}

export async function tieneComprobante(servicioRealizadoId: string): Promise<boolean> {
  const db = getDb();
  const fila = db
    .select({ id: archivos.id })
    .from(archivos)
    .where(
      and(
        eq(archivos.entidadTipo, "servicio_realizado"),
        eq(archivos.entidadId, servicioRealizadoId),
        eq(archivos.categoria, "comprobante"),
      ),
    )
    .get();
  return Boolean(fila);
}

type Db = ReturnType<typeof getDb>;

/**
 * Borra filas de `archivos` dentro de una transacción ajena (ej. borrar la ficha clínica) y
 * devuelve sus rutas físicas para borrarlas del disco DESPUÉS de confirmar la transacción.
 */
export function eliminarFilasArchivosEnTx(tx: Pick<Db, "select" | "delete">, ids: string[]): string[] {
  if (ids.length === 0) return [];
  const filas = tx.select({ ruta: archivos.rutaFisica }).from(archivos).where(inArray(archivos.id, ids)).all();
  tx.delete(archivos).where(inArray(archivos.id, ids)).run();
  return filas.map((f) => f.ruta);
}

/**
 * Borra archivos del disco, solo si están dentro de `Datos/` del negocio. Nunca lanza: un archivo
 * que no se puede borrar no deshace lo que ya se confirmó en la BD; se devuelve cuántos fallaron.
 */
export async function borrarArchivosFisicos(rutas: string[]): Promise<number> {
  if (rutas.length === 0) return 0;
  const { carpetaRaiz } = await obtenerConfig();
  const datos = carpetaDatos(carpetaRaiz);
  let fallidos = 0;
  for (const ruta of rutas) {
    if (!rutaDentroDe(ruta, datos)) {
      fallidos += 1;
      continue;
    }
    try {
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    } catch {
      fallidos += 1;
    }
  }
  return fallidos;
}
