import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { clientes, serviciosRealizados, archivos } from "../db/schema";
import { SUBCARPETAS_DATOS } from "./folders";

/**
 * Reescribe las rutas absolutas ya guardadas (clientes.carpetaPath, serviciosRealizados.carpetaPath,
 * archivos.rutaFisica) para que sigan apuntando al lugar correcto después de que
 * `asegurarEstructuraRaiz` mueva Clientes/Inventario/Comprobantes/Servicios a la subcarpeta
 * "Datos/" (ver folders.ts). Se llama en cada arranque: `replace()` no hace nada si el prefijo
 * viejo ya no aparece, así que repetirlo en instalaciones ya migradas es gratis y seguro.
 */
export function migrarRutasCarpetas(carpetaRaiz: string): void {
  const db = getDb();
  for (const sub of SUBCARPETAS_DATOS) {
    const prefijoViejo = path.join(carpetaRaiz, sub);
    const prefijoNuevo = path.join(carpetaRaiz, "Datos", sub);
    if (prefijoViejo === prefijoNuevo) continue;

    db.update(clientes)
      .set({ carpetaPath: sql`replace(${clientes.carpetaPath}, ${prefijoViejo}, ${prefijoNuevo})` })
      .run();
    db.update(serviciosRealizados)
      .set({ carpetaPath: sql`replace(${serviciosRealizados.carpetaPath}, ${prefijoViejo}, ${prefijoNuevo})` })
      .run();
    db.update(archivos)
      .set({ rutaFisica: sql`replace(${archivos.rutaFisica}, ${prefijoViejo}, ${prefijoNuevo})` })
      .run();
  }
}
