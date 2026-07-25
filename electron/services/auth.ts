import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { configuracion } from "../db/schema";

const PIN_CONFIG_KEY = "auth.pinHash";

function hashPin(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin, salt, 64);
}

function serialize(salt: Buffer, hash: Buffer): string {
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function deserialize(stored: string): { salt: Buffer; hash: Buffer } {
  const [saltHex, hashHex] = stored.split(":");
  return { salt: Buffer.from(saltHex, "hex"), hash: Buffer.from(hashHex, "hex") };
}

export async function tienePin(): Promise<boolean> {
  const db = getDb();
  const row = db.select().from(configuracion).where(eq(configuracion.clave, PIN_CONFIG_KEY)).get();
  return Boolean(row);
}

export async function crearPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error("El PIN debe tener entre 4 y 8 dígitos.");
  }
  const db = getDb();
  const existente = db.select().from(configuracion).where(eq(configuracion.clave, PIN_CONFIG_KEY)).get();
  if (existente) {
    throw new Error("Ya existe un PIN configurado.");
  }
  const salt = randomBytes(16);
  const hash = hashPin(pin, salt);
  const valor = serialize(salt, hash);

  db.insert(configuracion)
    .values({ clave: PIN_CONFIG_KEY, valor })
    .onConflictDoUpdate({ target: configuracion.clave, set: { valor } })
    .run();
}

export async function verificarPin(pin: string): Promise<boolean> {
  const db = getDb();
  const row = db.select().from(configuracion).where(eq(configuracion.clave, PIN_CONFIG_KEY)).get();
  if (!row) return false;

  const { salt, hash } = deserialize(row.valor);
  const candidate = hashPin(pin, salt);
  if (candidate.length !== hash.length) return false;
  return timingSafeEqual(candidate, hash);
}
