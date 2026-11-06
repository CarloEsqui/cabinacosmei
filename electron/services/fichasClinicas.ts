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
const LADO_VISTA = 1600;

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

/**
 * Orientación EXIF de un JPEG (1 = normal). Las fotos de celular suelen guardarse "acostadas" con
 * esta marca; `nativeImage.createFromPath` la ignora (probado en macOS), así que se aplica a mano.
 */
function orientacionExif(ruta: string): number {
  let buf: Buffer;
  try {
    const fd = fs.openSync(ruta, "r");
    buf = Buffer.alloc(128 * 1024);
    const leidos = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    buf = buf.subarray(0, leidos);
  } catch {
    return 1;
  }
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marcador = buf[i + 1];
    const largo = buf.readUInt16BE(i + 2);
    if (marcador === 0xda) break; // Empiezan los datos de la imagen: ya no hay EXIF.
    if (marcador === 0xe1 && buf.toString("latin1", i + 4, i + 10) === "Exif\0\0") {
      const t = i + 10;
      if (t + 8 > buf.length) return 1;
      const le = buf.toString("latin1", t, t + 2) === "II";
      const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
      const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
      const ifd = t + u32(t + 4);
      if (ifd + 2 > buf.length) return 1;
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 12 > buf.length) return 1;
        if (u16(e) === 0x0112) {
          const o = u16(e + 8);
          return o >= 1 && o <= 8 ? o : 1;
        }
      }
      return 1;
    }
    i += 2 + largo;
  }
  return 1;
}

/** Aplica la orientación EXIF a una imagen ya reducida, moviendo pixeles (4 bytes cada uno). */
function orientar(img: Electron.NativeImage, o: number): Electron.NativeImage {
  if (o === 1) return img;
  const { width: w, height: h } = img.getSize();
  const origen = new Uint32Array(Uint8Array.from(img.toBitmap()).buffer);
  const giraLados = o >= 5;
  const W = giraLados ? h : w;
  const H = giraLados ? w : h;
  const destino = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dx = x, dy = y;
      switch (o) {
        case 2: dx = w - 1 - x; break;
        case 3: dx = w - 1 - x; dy = h - 1 - y; break;
        case 4: dy = h - 1 - y; break;
        case 5: dx = y; dy = x; break;
        case 6: dx = h - 1 - y; dy = x; break;
        case 7: dx = h - 1 - y; dy = w - 1 - x; break;
        case 8: dx = y; dy = w - 1 - x; break;
      }
      destino[dy * W + dx] = origen[y * w + x];
    }
  }
  return nativeImage.createFromBitmap(Buffer.from(destino.buffer), { width: W, height: H });
}

/** Lee la foto completa, la reduce a `lado` px por su lado mayor y la endereza. Null si no se lee. */
function reducirDirecto(ruta: string, lado: number): Electron.NativeImage | null {
  const img = nativeImage.createFromPath(ruta);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const reducida = Math.max(width, height) > lado
    ? img.resize(width >= height ? { width: lado, quality: "good" } : { height: lado, quality: "good" })
    : img;
  return orientar(reducida, orientacionExif(ruta));
}

const comoDataUrl = (img: Electron.NativeImage, calidad: number) =>
  ({ dataUrl: `data:image/jpeg;base64,${img.toJPEG(calidad).toString("base64")}` });

/**
 * Miniatura JPEG de 320 pt (640 px en pantallas Retina), una por llamada (condición 8). Primero la
 * del sistema, que es asíncrona y ya respeta la orientación; si no hay, se reduce directo.
 * Archivo borrado a mano → faltante.
 */
export async function miniatura(archivoId: string): Promise<{ dataUrl: string } | { faltante: true }> {
  const a = await fotoValidada(archivoId);
  if (!fs.existsSync(a.rutaFisica)) return { faltante: true };
  try {
    const mini = await nativeImage.createThumbnailFromPath(a.rutaFisica, { width: LADO_MINIATURA, height: LADO_MINIATURA });
    if (!mini.isEmpty()) return comoDataUrl(mini, 80);
  } catch {
    // Sin miniatura del sistema (ej. Linux).
  }
  const img = reducirDirecto(a.rutaFisica, LADO_MINIATURA);
  return img ? comoDataUrl(img, 80) : { faltante: true };
}

/**
 * Foto a ≤ 1600 px para el carrusel, solo la que se está mirando (condición 8). Siempre directo:
 * la miniatura del sistema no llega a ese tamaño y en macOS devuelve el ícono genérico del archivo.
 */
export async function vistaFoto(archivoId: string): Promise<{ dataUrl: string } | { faltante: true }> {
  const a = await fotoValidada(archivoId);
  if (!fs.existsSync(a.rutaFisica)) return { faltante: true };
  const img = reducirDirecto(a.rutaFisica, LADO_VISTA);
  return img ? comoDataUrl(img, 85) : { faltante: true };
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
