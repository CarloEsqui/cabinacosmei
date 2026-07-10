import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { configuracion } from "../db/schema";
import { CONFIG_DEFAULTS, configSchema, type ConfigValues } from "../../shared/config";

const CONFIG_ROW_KEY = "app.config";

export async function obtenerConfig(): Promise<ConfigValues> {
  const db = getDb();
  const row = db.select().from(configuracion).where(eq(configuracion.clave, CONFIG_ROW_KEY)).get();
  if (!row) {
    return CONFIG_DEFAULTS;
  }
  const parsed = configSchema.safeParse(JSON.parse(row.valor));
  return parsed.success ? parsed.data : CONFIG_DEFAULTS;
}

export async function actualizarConfig(cambios: Partial<ConfigValues>): Promise<ConfigValues> {
  const actual = await obtenerConfig();
  const siguiente = configSchema.parse({ ...actual, ...cambios });
  const db = getDb();
  const valor = JSON.stringify(siguiente);

  db.insert(configuracion)
    .values({ clave: CONFIG_ROW_KEY, valor })
    .onConflictDoUpdate({ target: configuracion.clave, set: { valor } })
    .run();

  return siguiente;
}

export async function asegurarConfigInicial(): Promise<void> {
  const db = getDb();
  const row = db.select().from(configuracion).where(eq(configuracion.clave, CONFIG_ROW_KEY)).get();
  if (!row) {
    db.insert(configuracion)
      .values({ clave: CONFIG_ROW_KEY, valor: JSON.stringify(CONFIG_DEFAULTS) })
      .run();
  }
}
