import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import AdmZip from "adm-zip";
import { desc, eq } from "drizzle-orm";
import { getDb, getDbPath, checkpointDb, closeDb, reabrirDb } from "../db";
import { respaldosLog } from "../db/schema";
import { obtenerConfig } from "./config";
import { verificarPin } from "./auth";
import { registrarAccion } from "./bitacora";
import { carpetaDatos, asegurarEstructuraRaiz } from "./folders";
import { migrarRutasCarpetas } from "./migracionCarpetas";
import { fechaLocalIso } from "../../shared/fechas";
import type { RespaldoRow } from "../../shared/types";

const PREFIJO_AUTO = "cabina_auto_";
const PREFIJO_MANUAL = "cabina_respaldo_";

function carpetaRespaldos(carpetaRaiz: string): string {
  const dir = path.join(carpetaRaiz, "Respaldos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestampArchivo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function mapear(fila: typeof respaldosLog.$inferSelect): RespaldoRow {
  const nombreArchivo = path.basename(fila.rutaArchivo);
  return {
    id: fila.id,
    rutaArchivo: fila.rutaArchivo,
    nombreArchivo,
    tamanioBytes: fila.tamanioBytes,
    estatus: fila.estatus,
    createdAt: fila.createdAt.getTime(),
    esAutomatico: nombreArchivo.startsWith(PREFIJO_AUTO),
  };
}

export async function carpetaRespaldosActual(): Promise<string> {
  const config = await obtenerConfig();
  return carpetaRespaldos(config.carpetaRaiz);
}

/**
 * Genera un respaldo completo (base de datos + archivos físicos: comprobantes, fotos,
 * expedientes) en un único .zip. Pasar `motivoAuto` cuando el respaldo se dispara solo,
 * como red de seguridad antes de un borrado o una restauración.
 */
export async function crearRespaldo(usuarioId?: string, motivoAuto?: string): Promise<RespaldoRow> {
  const db = getDb();
  const config = await obtenerConfig();
  const dir = carpetaRespaldos(config.carpetaRaiz);

  checkpointDb();

  const zip = new AdmZip();
  zip.addLocalFile(getDbPath(), "", "cabina.sqlite3");
  zip.addFile(
    "manifest.json",
    Buffer.from(
      JSON.stringify(
        {
          formato: "cabina-respaldo",
          version: 1,
          appVersion: app.getVersion(),
          fecha: new Date().toISOString(),
          incluyeArchivos: true,
        },
        null,
        2,
      ),
    ),
  );

  const rutaDatos = carpetaDatos(config.carpetaRaiz);
  if (fs.existsSync(rutaDatos)) {
    zip.addLocalFolder(rutaDatos, "archivos");
  }

  const nombre = motivoAuto
    ? `${PREFIJO_AUTO}${motivoAuto}_${timestampArchivo()}.zip`
    : `${PREFIJO_MANUAL}${timestampArchivo()}.zip`;
  const destino = path.join(dir, nombre);
  zip.writeZip(destino);
  const tamanioBytes = fs.statSync(destino).size;

  const id = randomUUID();
  db.insert(respaldosLog).values({ id, rutaArchivo: destino, tamanioBytes, estatus: "ok" }).run();
  registrarAccion(db, {
    usuarioId,
    accion: "respaldo_creado",
    entidadTipo: "respaldo",
    entidadId: id,
    detalle: nombre,
  });

  return mapear(db.select().from(respaldosLog).where(eq(respaldosLog.id, id)).get()!);
}

export async function listarRespaldos(): Promise<RespaldoRow[]> {
  const db = getDb();
  return db.select().from(respaldosLog).orderBy(desc(respaldosLog.createdAt)).all().map(mapear);
}

export async function obtenerRutaRespaldo(id: string): Promise<string> {
  const db = getDb();
  const fila = db.select().from(respaldosLog).where(eq(respaldosLog.id, id)).get();
  if (!fila) throw new Error("El respaldo no existe.");
  if (!fs.existsSync(fila.rutaArchivo)) throw new Error("El archivo de respaldo ya no existe en disco.");
  return fila.rutaArchivo;
}

/**
 * Aplica un respaldo (.zip completo o un .sqlite3 heredado de versiones previas) sobre el
 * estado activo. Valida el contenido ANTES de tocar nada: si no es válido, lanza un error y la
 * app sigue intacta. Al terminar, reinicia la app para reabrir la base de datos limpia.
 */
async function aplicarRespaldoDesdeArchivo(rutaOrigen: string): Promise<void> {
  const esZip = rutaOrigen.toLowerCase().endsWith(".zip");
  const esSqlite = rutaOrigen.toLowerCase().endsWith(".sqlite3");
  if (!esZip && !esSqlite) {
    throw new Error("Formato no soportado. Selecciona un respaldo .zip o .sqlite3 de Bellora.");
  }

  // Captura la carpeta raíz ANTES de cerrar la base de datos (obtenerConfig la necesita abierta).
  const config = await obtenerConfig();

  let bufferDb: Buffer;
  let zip: AdmZip | null = null;
  let entradasArchivos: AdmZip.IZipEntry[] = [];

  if (esZip) {
    zip = new AdmZip(rutaOrigen);
    const entradaManifest = zip.getEntry("manifest.json");
    const entradaDb = zip.getEntry("cabina.sqlite3");
    if (!entradaManifest || !entradaDb) {
      throw new Error("El archivo no es un respaldo válido de Bellora (falta manifest.json o cabina.sqlite3).");
    }
    try {
      JSON.parse(zip.readAsText(entradaManifest));
    } catch {
      throw new Error("El archivo no es un respaldo válido de Bellora (manifest.json corrupto).");
    }
    bufferDb = entradaDb.getData();
    entradasArchivos = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.startsWith("archivos/"));
  } else {
    bufferDb = fs.readFileSync(rutaOrigen);
  }

  const dbPath = getDbPath();
  checkpointDb();
  closeDb();

  fs.writeFileSync(dbPath, bufferDb);
  for (const sufijo of ["-wal", "-shm"]) {
    const sidecar = dbPath + sufijo;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }

  if (entradasArchivos.length > 0 && config.carpetaRaiz) {
    fs.rmSync(carpetaDatos(config.carpetaRaiz), { recursive: true, force: true });
    for (const entrada of entradasArchivos) {
      const relativa = entrada.entryName.slice("archivos/".length);
      const destino = path.join(carpetaDatos(config.carpetaRaiz), relativa);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, entrada.getData());
    }
  }

  // Reabrir sobre el archivo recién escrito y rehacer la estructura de carpetas + rutas, en vez de
  // reiniciar el proceso (que en dev deja la ventana en blanco). Quien invoca recarga la ventana
  // para que el renderer vuelva a leer los datos restaurados.
  reabrirDb();
  if (config.carpetaRaiz) {
    asegurarEstructuraRaiz(config.carpetaRaiz);
    migrarRutasCarpetas(config.carpetaRaiz);
  }
}

/** Restaura uno de los respaldos ya listados en el historial. */
export async function restaurarRespaldo(id: string, pin: string, usuarioId?: string): Promise<void> {
  const pinValido = await verificarPin(pin);
  if (!pinValido) throw new Error("El PIN de acceso no es correcto.");

  const ruta = await obtenerRutaRespaldo(id);

  registrarAccion(getDb(), {
    usuarioId,
    accion: "respaldo_restaurado",
    entidadTipo: "respaldo",
    entidadId: id,
    detalle: path.basename(ruta),
  });

  // Red de seguridad: por si el respaldo elegido resulta no ser el que se quería.
  await crearRespaldo(usuarioId, "antes_de_restaurar");
  await aplicarRespaldoDesdeArchivo(ruta);
}

/** Restaura un respaldo desde una ruta arbitraria (elegida con un selector de archivos). */
export async function restaurarDesdeArchivo(rutaArchivo: string, pin: string, usuarioId?: string): Promise<void> {
  const pinValido = await verificarPin(pin);
  if (!pinValido) throw new Error("El PIN de acceso no es correcto.");
  if (!fs.existsSync(rutaArchivo)) throw new Error("El archivo seleccionado ya no existe.");

  registrarAccion(getDb(), {
    usuarioId,
    accion: "respaldo_restaurado_externo",
    detalle: path.basename(rutaArchivo),
  });

  await crearRespaldo(usuarioId, "antes_de_restaurar");
  await aplicarRespaldoDesdeArchivo(rutaArchivo);
}

/**
 * Respaldo automático diario de verdad (no solo el de seguridad antes de un borrado): si el
 * respaldo más reciente (de cualquier tipo) no es de hoy, crea uno nuevo. Se llama al arrancar
 * la app y otra vez de tanto en tanto mientras sigue abierta (ver main.ts), para no depender de
 * que alguien reinicie la app justo después de medianoche.
 */
export async function asegurarRespaldoAutomaticoDiario(): Promise<void> {
  const db = getDb();
  const hoy = fechaLocalIso();
  const ultimo = db.select().from(respaldosLog).orderBy(desc(respaldosLog.createdAt)).limit(1).get();
  if (ultimo && fechaLocalIso(ultimo.createdAt) === hoy) return;
  await crearRespaldo(undefined, "diario");
}
