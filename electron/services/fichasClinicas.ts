import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { nativeImage } from "electron";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  archivos,
  clientes,
  fichasClinicas,
  fichasClinicasVersiones,
  serviciosCatalogo,
  serviciosRealizados,
} from "../db/schema";
import { borrarArchivosFisicos, eliminarFilasArchivosEnTx, guardarArchivoDesdeRuta } from "./archivos";
import { carpetaDatos, rutaDentroDe } from "./folders";
import { asegurarCarpetaServicio } from "./serviciosRealizados";
import { registrarAccion } from "./bitacora";
import { obtenerConfig } from "./config";
import { fichaClinicaDatosSchema, type GuardarFichaInput } from "../../shared/schemas";
import {
  PREGUNTAS_SI_NO,
  TIPOLOGIA,
  VERSION_FORMULARIO,
  fichaVacia,
  jsonCanonico,
  normalizarFicha,
  precaucionesDe,
  type FichaDatos,
} from "../../shared/fichaClinica";
import type { AvisoFicha, FichaClinica, FotoTratamiento, TratamientoFicha, VersionFicha } from "../../shared/types";

/**
 * Ficha clínica facial (spec .notes/spec-ficha-clinica-2026-11-05.md §21; migración 0007).
 *
 * DATOS DE SALUD SENSIBLES. Este módulo es el ÚNICO que lee o escribe `fichas_clinicas` y
 * `fichas_clinicas_versiones` (Gate de la ficha, condición 11). Hacia afuera solo sale el aviso de
 * Precaución (`avisoFicha`), nunca `datos` completo, salvo a la propia ficha.
 *
 * Bitácora SIN contenido clínico (BR-006): solo acción + código de clienta o de servicio.
 * Dependencias: archivos, folders, serviciosRealizados, bitacora, config. Nadie importa este
 * módulo salvo electron/ipc/index.ts (condición 13).
 */

const CATEGORIA_FOTO = { antes: "foto_antes", despues: "foto_despues" } as const;
const CATEGORIAS_FOTO = [CATEGORIA_FOTO.antes, CATEGORIA_FOTO.despues];
const MIME_FOTO: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  // Sin WEBP (FIC-B3): nativeImage no lo decodifica (probado en macOS), así que no habría miniatura.
};
export const EXTENSIONES_FOTO = ["jpg", "jpeg", "png"];
const LADO_MINIATURA = 320;

const ms = (d: Date | number) => (d instanceof Date ? d.getTime() : Number(d));

/** Lee `datos` sin lanzar nunca (condición 6): una versión vieja que no valida devuelve null. */
function leerDatos(json: string): FichaDatos | null {
  try {
    const r = fichaClinicaDatosSchema.safeParse(JSON.parse(json));
    return r.success ? normalizarFicha(r.data as FichaDatos) : null;
  } catch {
    return null;
  }
}

/**
 * FIC-B2: una versión de otro formato, o con claves que el catálogo actual no conoce, se devuelve
 * cruda ("formato anterior") en vez de normalizarla: normalizar descartaría en silencio esas
 * respuestas en la vista (el JSON en la BD nunca se toca).
 */
function leerVersion(json: string, versionFormulario: number): FichaDatos | null {
  if (versionFormulario !== VERSION_FORMULARIO) return null;
  try {
    const crudo = JSON.parse(json) as { respuestas?: Record<string, unknown>; tipologia?: Record<string, unknown> };
    const preguntas = new Set(PREGUNTAS_SI_NO.map((p) => p.clave));
    const grupos = new Set(TIPOLOGIA.map((g) => g.clave));
    if (Object.keys(crudo.respuestas ?? {}).some((k) => !preguntas.has(k))) return null;
    if (Object.keys(crudo.tipologia ?? {}).some((k) => !grupos.has(k))) return null;
  } catch {
    return null;
  }
  return leerDatos(json);
}

function mapearFicha(f: typeof fichasClinicas.$inferSelect): FichaClinica {
  return {
    id: f.id,
    clienteId: f.clienteId,
    sexo: f.sexo === "F" || f.sexo === "M" ? f.sexo : null,
    ocupacion: f.ocupacion,
    versionFormulario: f.versionFormulario,
    // La vigente siempre la escribe este módulo ya normalizada; si algo la dañara, se muestra vacía
    // en vez de romper la ventana.
    datos: leerDatos(f.datos) ?? fichaVacia(),
    createdAt: ms(f.createdAt),
    updatedAt: ms(f.updatedAt),
  };
}

function codigoCliente(db: Pick<ReturnType<typeof getDb>, "select">, clienteId: string): string {
  return db.select({ c: clientes.codigoCliente }).from(clientes).where(eq(clientes.id, clienteId)).get()?.c ?? "clienta";
}

export async function obtenerFicha(clienteId: string): Promise<FichaClinica | null> {
  const f = getDb().select().from(fichasClinicas).where(eq(fichasClinicas.clienteId, clienteId)).get();
  return f ? mapearFicha(f) : null;
}

/**
 * FR-006 / BR-002 (Gate, condiciones 4 y 5). Todo en UNA transacción síncrona:
 *  - concurrencia optimista: si otra ventana guardó después de abrir esta, se rechaza;
 *  - guardar sin cambios (forma canónica) no crea versión ni toca `updated_at`;
 *  - si cambió algo, la vigente anterior se copia COMPLETA a versiones con su rango de vigencia.
 */
export async function guardarFicha(input: GuardarFichaInput, usuarioId?: string): Promise<FichaClinica> {
  const db = getDb();
  const datos = normalizarFicha(input.datos as FichaDatos); // BR-004 en el main, no solo en la UI
  const sexo = input.sexo ?? null;
  const ocupacion = input.ocupacion?.trim() || null;
  const estadoNuevo = jsonCanonico({ sexo, ocupacion, datos });

  const id = db.transaction((tx) => {
    const cliente = tx.select({ id: clientes.id, codigo: clientes.codigoCliente }).from(clientes).where(eq(clientes.id, input.clienteId)).get();
    if (!cliente) throw new Error("La clienta no existe.");
    const vigente = tx.select().from(fichasClinicas).where(eq(fichasClinicas.clienteId, input.clienteId)).get();
    const ahora = new Date();

    if (!vigente) {
      if (input.updatedAtEsperado !== null) {
        throw new Error("La ficha cambió en otra ventana; vuelve a abrirla.");
      }
      const nuevoId = randomUUID();
      tx.insert(fichasClinicas)
        .values({
          id: nuevoId,
          clienteId: input.clienteId,
          sexo,
          ocupacion,
          versionFormulario: VERSION_FORMULARIO,
          datos: jsonCanonico(datos),
          usuarioId: usuarioId || null,
          createdAt: ahora,
          updatedAt: ahora,
        })
        .run();
      registrarAccion(tx, {
        usuarioId,
        accion: "ficha_clinica_creada",
        entidadTipo: "cliente",
        entidadId: input.clienteId,
        detalle: `Se creó la ficha clínica de ${cliente.codigo}`,
      });
      return nuevoId;
    }

    if (input.updatedAtEsperado === null || ms(vigente.updatedAt) !== input.updatedAtEsperado) {
      throw new Error("La ficha cambió en otra ventana; vuelve a abrirla.");
    }
    const anterior = mapearFicha(vigente);
    const estadoAnterior = jsonCanonico({ sexo: anterior.sexo, ocupacion: anterior.ocupacion, datos: anterior.datos });
    if (estadoAnterior === estadoNuevo && vigente.versionFormulario === VERSION_FORMULARIO) return vigente.id;

    tx.insert(fichasClinicasVersiones)
      .values({
        id: randomUUID(),
        fichaId: vigente.id,
        sexo: vigente.sexo,
        ocupacion: vigente.ocupacion,
        versionFormulario: vigente.versionFormulario,
        datos: vigente.datos, // instantánea tal cual estaba guardada
        vigenteDesde: vigente.updatedAt,
        vigenteHasta: ahora,
        usuarioId: usuarioId || null,
        createdAt: ahora,
      })
      .run();
    tx.update(fichasClinicas)
      .set({
        sexo,
        ocupacion,
        versionFormulario: VERSION_FORMULARIO,
        datos: jsonCanonico(datos),
        usuarioId: usuarioId || null,
        updatedAt: ahora,
      })
      .where(eq(fichasClinicas.id, vigente.id))
      .run();
    registrarAccion(tx, {
      usuarioId,
      accion: "ficha_clinica_actualizada",
      entidadTipo: "cliente",
      entidadId: input.clienteId,
      detalle: `Se actualizó la ficha clínica de ${cliente.codigo}`,
    });
    return vigente.id;
  });

  return mapearFicha(db.select().from(fichasClinicas).where(eq(fichasClinicas.id, id)).get()!);
}

/** Versiones anteriores, de la más reciente a la más vieja. Solo lectura. */
export async function listarVersiones(clienteId: string): Promise<VersionFicha[]> {
  const db = getDb();
  const ficha = db.select({ id: fichasClinicas.id }).from(fichasClinicas).where(eq(fichasClinicas.clienteId, clienteId)).get();
  if (!ficha) return [];
  return db
    .select()
    .from(fichasClinicasVersiones)
    .where(eq(fichasClinicasVersiones.fichaId, ficha.id))
    .orderBy(desc(fichasClinicasVersiones.vigenteHasta))
    .all()
    .map((v) => {
      const datos = leerVersion(v.datos, v.versionFormulario);
      return {
        id: v.id,
        vigenteDesde: ms(v.vigenteDesde),
        vigenteHasta: ms(v.vigenteHasta),
        sexo: v.sexo,
        ocupacion: v.ocupacion,
        versionFormulario: v.versionFormulario,
        datos,
        datosCrudos: datos ? null : v.datos,
      };
    });
}

/** FR-009: el aviso de Precaución. Es lo único de la ficha que sale hacia la cita y Clientes. */
export async function avisoFicha(clienteId: string): Promise<AvisoFicha> {
  const f = getDb().select({ datos: fichasClinicas.datos }).from(fichasClinicas).where(eq(fichasClinicas.clienteId, clienteId)).get();
  if (!f) return { tieneFicha: false, precauciones: [] };
  const datos = leerDatos(f.datos);
  return { tieneFicha: true, precauciones: datos ? precaucionesDe(datos) : [] };
}

/** Fotos (filas de `archivos`) de los servicios de una clienta o de un servicio. */
function fotosDe(db: Pick<ReturnType<typeof getDb>, "select">, servicioIds: string[]) {
  if (servicioIds.length === 0) return [];
  return db
    .select()
    .from(archivos)
    .where(
      and(
        eq(archivos.entidadTipo, "servicio_realizado"),
        inArray(archivos.entidadId, servicioIds),
        inArray(archivos.categoria, CATEGORIAS_FOTO),
      ),
    )
    .orderBy(asc(archivos.createdAt))
    .all();
}

function mapearFoto(a: typeof archivos.$inferSelect): FotoTratamiento {
  return { id: a.id, momento: a.categoria === CATEGORIA_FOTO.antes ? "antes" : "despues", nombreOriginal: a.nombreOriginal };
}

/** FR-007: tratamientos en cabina = servicios CERRADOS de la clienta, numerados como en el papel. */
export async function listarTratamientos(clienteId: string): Promise<TratamientoFicha[]> {
  const db = getDb();
  const servicios = db
    .select({
      id: serviciosRealizados.id,
      codigo: serviciosRealizados.codigoServicio,
      citaId: serviciosRealizados.citaId,
      fecha: serviciosRealizados.fecha,
      hora: serviciosRealizados.hora,
      observaciones: serviciosRealizados.observaciones,
      servicioNombre: serviciosCatalogo.nombre,
    })
    .from(serviciosRealizados)
    .innerJoin(serviciosCatalogo, eq(serviciosCatalogo.id, serviciosRealizados.servicioCatalogoId))
    .where(and(eq(serviciosRealizados.clienteId, clienteId), eq(serviciosRealizados.estatus, "cerrado")))
    .orderBy(asc(serviciosRealizados.fecha), asc(serviciosRealizados.hora), asc(serviciosRealizados.codigoServicio))
    .all();
  const fotos = fotosDe(db, servicios.map((s) => s.id));
  return servicios.map((s, i) => ({
    servicioRealizadoId: s.id,
    numero: i + 1,
    codigoServicio: s.codigo,
    citaId: s.citaId,
    fecha: s.fecha,
    servicioNombre: s.servicioNombre,
    observaciones: s.observaciones,
    fotos: fotos.filter((f) => f.entidadId === s.id).map(mapearFoto),
  }));
}

export async function fotosServicio(servicioRealizadoId: string): Promise<FotoTratamiento[]> {
  return fotosDe(getDb(), [servicioRealizadoId]).map(mapearFoto);
}

/**
 * Condición 7: solo servicios cerrados; la carpeta la resuelve (y crea si falta) el dueño de
 * `servicios_realizados`; extensión en lista blanca Y que la imagen se pueda leer; `tipo_mime` lleno.
 */
export async function subirFoto(
  servicioRealizadoId: string,
  momento: "antes" | "despues",
  rutaOrigen: string,
  usuarioId?: string,
): Promise<FotoTratamiento> {
  const db = getDb();
  const s = db
    .select({ codigo: serviciosRealizados.codigoServicio, estatus: serviciosRealizados.estatus })
    .from(serviciosRealizados)
    .where(eq(serviciosRealizados.id, servicioRealizadoId))
    .get();
  if (!s) throw new Error("El servicio realizado no existe.");
  if (s.estatus !== "cerrado") throw new Error("Las fotos se agregan cuando la cita ya está cerrada.");

  const ext = path.extname(rutaOrigen).toLowerCase();
  if (!MIME_FOTO[ext] || nativeImage.createFromPath(rutaOrigen).isEmpty()) {
    throw new Error("Esa foto no se pudo leer; usa JPG o PNG.");
  }
  const carpeta = await asegurarCarpetaServicio(servicioRealizadoId);
  const archivo = await guardarArchivoDesdeRuta({
    entidadTipo: "servicio_realizado",
    entidadId: servicioRealizadoId,
    rutaOrigen,
    carpetaDestino: carpeta,
    categoria: CATEGORIA_FOTO[momento],
    tipoMime: MIME_FOTO[ext],
    usuarioId,
  });
  if (!archivo) throw new Error("No se pudo guardar la foto.");
  registrarAccion(db, {
    usuarioId,
    accion: "foto_tratamiento_agregada",
    entidadTipo: "servicio_realizado",
    entidadId: servicioRealizadoId,
    detalle: `${s.codigo} · foto de ${momento === "antes" ? "antes" : "después"}`,
  });
  return mapearFoto(archivo);
}

/** Fila de una foto, con su ruta validada dentro de `Datos/` del negocio (condición 8). */
async function fotoValidada(archivoId: string) {
  const a = getDb().select().from(archivos).where(eq(archivos.id, archivoId)).get();
  if (!a || !CATEGORIAS_FOTO.includes(a.categoria as (typeof CATEGORIAS_FOTO)[number])) {
    throw new Error("La foto no existe.");
  }
  const { carpetaRaiz } = await obtenerConfig();
  if (!rutaDentroDe(a.rutaFisica, carpetaDatos(carpetaRaiz))) {
    throw new Error("La foto está fuera de la carpeta del negocio.");
  }
  return a;
}

/** Miniatura JPEG ≤ 320 px, una por llamada (condición 8). Archivo borrado a mano → faltante. */
export async function miniatura(archivoId: string): Promise<{ dataUrl: string } | { faltante: true }> {
  const a = await fotoValidada(archivoId);
  if (!fs.existsSync(a.rutaFisica)) return { faltante: true };
  try {
    const mini = await nativeImage.createThumbnailFromPath(a.rutaFisica, { width: LADO_MINIATURA, height: LADO_MINIATURA });
    if (!mini.isEmpty()) return { dataUrl: `data:image/jpeg;base64,${mini.toJPEG(80).toString("base64")}` };
  } catch {
    // Sin miniatura del sistema (ej. Linux): se reduce la imagen directa.
  }
  const img = nativeImage.createFromPath(a.rutaFisica);
  if (img.isEmpty()) return { faltante: true };
  const { width, height } = img.getSize();
  const reducida = Math.max(width, height) > LADO_MINIATURA
    ? img.resize(width >= height ? { width: LADO_MINIATURA } : { height: LADO_MINIATURA })
    : img;
  return { dataUrl: `data:image/jpeg;base64,${reducida.toJPEG(80).toString("base64")}` };
}

/** Ruta para abrir la foto en el visor del sistema (condición 8). */
export async function rutaFoto(archivoId: string): Promise<string> {
  const a = await fotoValidada(archivoId);
  if (!fs.existsSync(a.rutaFisica)) throw new Error("La foto ya no está en su carpeta.");
  return a.rutaFisica;
}

/** Quita una foto: fila y archivo. La confirmación la pide la UI. */
export async function quitarFoto(archivoId: string, usuarioId?: string): Promise<void> {
  const a = await fotoValidada(archivoId);
  const db = getDb();
  const codigo =
    db.select({ c: serviciosRealizados.codigoServicio }).from(serviciosRealizados).where(eq(serviciosRealizados.id, a.entidadId)).get()?.c ??
    "servicio";
  const rutas = db.transaction((tx) => {
    const r = eliminarFilasArchivosEnTx(tx, [a.id]);
    registrarAccion(tx, {
      usuarioId,
      accion: "foto_tratamiento_quitada",
      entidadTipo: "servicio_realizado",
      entidadId: a.entidadId,
      detalle: `${codigo} · foto de ${a.categoria === CATEGORIA_FOTO.antes ? "antes" : "después"}`,
    });
    return r;
  });
  await borrarArchivosFisicos(rutas);
}

/**
 * FR-011: borra la ficha, sus versiones y las fotos de antes y después de la clienta. Sin PIN
 * (decisión del dueño). Las notas de los tratamientos se conservan. La BD va en una transacción;
 * los archivos se borran después y un fallo de disco no la revierte.
 */
export async function borrarFicha(clienteId: string, usuarioId?: string): Promise<{ archivosNoBorrados: number }> {
  const db = getDb();
  const rutas = db.transaction((tx) => {
    const ficha = tx.select({ id: fichasClinicas.id }).from(fichasClinicas).where(eq(fichasClinicas.clienteId, clienteId)).get();
    if (!ficha) throw new Error("Esta clienta no tiene ficha clínica.");
    const servicioIds = tx
      .select({ id: serviciosRealizados.id })
      .from(serviciosRealizados)
      .where(eq(serviciosRealizados.clienteId, clienteId))
      .all()
      .map((s) => s.id);
    const fotoIds = fotosDe(tx, servicioIds).map((f) => f.id);
    tx.delete(fichasClinicasVersiones).where(eq(fichasClinicasVersiones.fichaId, ficha.id)).run();
    tx.delete(fichasClinicas).where(eq(fichasClinicas.id, ficha.id)).run();
    const r = eliminarFilasArchivosEnTx(tx, fotoIds);
    registrarAccion(tx, {
      usuarioId,
      accion: "ficha_clinica_borrada",
      entidadTipo: "cliente",
      entidadId: clienteId,
      detalle: `Se borró la ficha clínica de ${codigoCliente(tx, clienteId)} (con ${fotoIds.length} foto${fotoIds.length === 1 ? "" : "s"})`,
    });
    return r;
  });
  return { archivosNoBorrados: await borrarArchivosFisicos(rutas) };
}
