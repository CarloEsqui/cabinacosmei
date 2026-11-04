import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteInstance: Database.Database | null = null;
let dbPath: string | null = null;

function abrirConexion() {
  if (!dbPath) {
    throw new Error("La ruta de la base de datos no ha sido establecida.");
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  const migrationsFolder = path.join(__dirname, "..", "drizzle");
  if (fs.existsSync(migrationsFolder)) {
    respaldarAntesDeMigrar(sqlite, migrationsFolder);
    migrate(db, { migrationsFolder });
  }

  sqliteInstance = sqlite;
  dbInstance = db;
  return db;
}

/**
 * Si este arranque va a aplicar migraciones, copia antes la base completa junto a ella como
 * `cabina_antes_de_migrar_<fecha>.sqlite3` (auditoría DAT-A4, 2026-11-03). `migrate()` corre solo
 * en la máquina de la clienta al actualizar; sin esta copia, una migración mala no tendría vuelta.
 * El archivo se puede restaurar con "Restaurar desde archivo" (acepta .sqlite3).
 *
 * Replica el criterio de drizzle (dialect.js): una migración está pendiente si su `when` del
 * journal es mayor que el `created_at` de la última fila de `__drizzle_migrations`.
 * Falla cerrado: si la copia no se puede hacer, NO se migra (la app no abre, pero los datos
 * quedan intactos) — mejor que migrar sin red.
 */
function respaldarAntesDeMigrar(sqlite: Database.Database, migrationsFolder: string): void {
  const tablas = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  if (tablas.length === 0) return; // instalación nueva: no hay datos que proteger

  const pendientes = readMigrationFiles({ migrationsFolder });
  let ultima = 0;
  if (tablas.some((t) => t.name === "__drizzle_migrations")) {
    const fila = sqlite
      .prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1")
      .get() as { created_at: number | string } | undefined;
    ultima = fila ? Number(fila.created_at) : 0;
  }
  if (!pendientes.some((m) => m.folderMillis > ultima)) return;

  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const sello = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const destino = path.join(path.dirname(dbPath!), `cabina_antes_de_migrar_${sello}.sqlite3`);
  try {
    // VACUUM INTO produce una copia consistente aunque haya WAL pendiente.
    sqlite.prepare("VACUUM INTO ?").run(destino);
  } catch (error) {
    sqlite.close();
    throw new Error(
      `No se pudo respaldar la base de datos antes de actualizarla (${(error as Error).message}). ` +
        "No se aplicó ningún cambio; libera espacio en disco y vuelve a abrir la app.",
    );
  }
  console.log("Respaldo previo a migración creado en:", destino);
}

export function initDb(userDataPath: string) {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(userDataPath, { recursive: true });
  dbPath = path.join(userDataPath, "cabina.sqlite3");
  return abrirConexion();
}

/**
 * Reabre la base de datos sobre el mismo archivo tras un restore que sobrescribió `cabina.sqlite3`.
 * Evita reiniciar todo el proceso (que en modo dev deja la ventana en blanco porque el plugin de
 * Vite mata su servidor al salir Electron). Debe llamarse justo después de `closeDb()`.
 */
export function reabrirDb() {
  return abrirConexion();
}

export function getDb() {
  if (!dbInstance) {
    throw new Error("La base de datos no ha sido inicializada. Llama a initDb() primero.");
  }
  return dbInstance;
}

export function getDbPath(): string {
  if (!dbPath) {
    throw new Error("La base de datos no ha sido inicializada. Llama a initDb() primero.");
  }
  return dbPath;
}

/** Vuelca el WAL al archivo principal para que una copia del archivo quede consistente por sí sola. */
export function checkpointDb(): void {
  sqliteInstance?.pragma("wal_checkpoint(TRUNCATE)");
}

/** Cierra la conexión activa (usado antes de sobrescribir el archivo al restaurar un respaldo). */
export function closeDb(): void {
  sqliteInstance?.close();
  sqliteInstance = null;
  dbInstance = null;
}

/** Ejecuta `fn` con las llaves foráneas desactivadas (para un borrado masivo sin importar el orden). */
export function ejecutarSinForeignKeys<T>(fn: () => T): T {
  if (!sqliteInstance) {
    throw new Error("La base de datos no ha sido inicializada. Llama a initDb() primero.");
  }
  sqliteInstance.pragma("foreign_keys = OFF");
  try {
    return fn();
  } finally {
    sqliteInstance.pragma("foreign_keys = ON");
  }
}
