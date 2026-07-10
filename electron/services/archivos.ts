import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { archivos } from "../db/schema";
import { sanitizarNombre } from "./folders";

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
  usuarioId?: string;
}

export async function guardarArchivoDesdeRuta(input: GuardarArchivoInput) {
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
