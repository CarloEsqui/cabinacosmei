import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { desc, eq } from "drizzle-orm";
import { getDb, getDbPath, checkpointDb, closeDb } from "../db";
import { respaldosLog } from "../db/schema";
import { obtenerConfig } from "./config";
import { verificarPin } from "./auth";
import { registrarAccion } from "./bitacora";
import type { RespaldoRow } from "../../shared/types";

function carpetaRespaldos(carpetaRaiz: string): string {
  const dir = path.join(carpetaRaiz, "Respaldos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestampArchivo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function mapear(fila: typeof respaldosLog.$inferSelect): RespaldoRow {
  return {
    id: fila.id,
    rutaArchivo: fila.rutaArchivo,
    nombreArchivo: path.basename(fila.rutaArchivo),
    tamanioBytes: fila.tamanioBytes,
    estatus: fila.estatus,
    createdAt: fila.createdAt.getTime(),
  };
}

export async function carpetaRespaldosActual(): Promise<string> {
  const config = await obtenerConfig();
  return carpetaRespaldos(config.carpetaRaiz);
}

export async function crearRespaldo(usuarioId?: string): Promise<RespaldoRow> {
  const db = getDb();
  const dir = await carpetaRespaldosActual();

  checkpointDb();
  const destino = path.join(dir, `cabina_respaldo_${timestampArchivo()}.sqlite3`);
  fs.copyFileSync(getDbPath(), destino);
  const tamanioBytes = fs.statSync(destino).size;

  const id = randomUUID();
  db.insert(respaldosLog).values({ id, rutaArchivo: destino, tamanioBytes, estatus: "ok" }).run();
  registrarAccion(db, {
    usuarioId,
    accion: "respaldo_creado",
    entidadTipo: "respaldo",
    entidadId: id,
    detalle: path.basename(destino),
  });

  return mapear(db.select().from(respaldosLog).where(eq(respaldosLog.id, id)).get()!);
}

export async function listarRespaldos(): Promise<RespaldoRow[]> {
  const db = getDb();
  return db.select().from(respaldosLog).orderBy(desc(respaldosLog.createdAt)).all().map(mapear);
}

/**
 * Restaura un respaldo elegido sobre el archivo activo y reinicia la app para reabrir la base
 * de datos limpia. Requiere el PIN de acceso porque reemplaza todos los datos actuales.
 */
export async function restaurarRespaldo(id: string, pin: string, usuarioId?: string): Promise<void> {
  const pinValido = await verificarPin(pin);
  if (!pinValido) throw new Error("El PIN de acceso no es correcto.");

  const db = getDb();
  const fila = db.select().from(respaldosLog).where(eq(respaldosLog.id, id)).get();
  if (!fila) throw new Error("El respaldo no existe.");
  if (!fs.existsSync(fila.rutaArchivo)) throw new Error("El archivo de respaldo ya no existe en disco.");

  registrarAccion(db, {
    usuarioId,
    accion: "respaldo_restaurado",
    entidadTipo: "respaldo",
    entidadId: id,
    detalle: path.basename(fila.rutaArchivo),
  });

  const dbPath = getDbPath();
  checkpointDb();
  closeDb();

  fs.copyFileSync(fila.rutaArchivo, dbPath);
  for (const sufijo of ["-wal", "-shm"]) {
    const sidecar = dbPath + sufijo;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }

  app.relaunch();
  app.exit(0);
}
