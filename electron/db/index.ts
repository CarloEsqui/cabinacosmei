import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteInstance: Database.Database | null = null;
let dbPath: string | null = null;

export function initDb(userDataPath: string) {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(userDataPath, { recursive: true });
  dbPath = path.join(userDataPath, "cabina.sqlite3");

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  const migrationsFolder = path.join(__dirname, "..", "drizzle");
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }

  sqliteInstance = sqlite;
  dbInstance = db;
  return db;
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
