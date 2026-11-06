import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Archivos elegidos en un diálogo del main que todavía no se guardan (ej. el comprobante de un
 * anticipo que aún no se registra). El renderer solo recibe un token; la ruta nunca sale del main.
 * Módulo sin dependencias a propósito: lo usan `cobros.ts` (¿hay evidencia?) y `comprobantes.ts`
 * (guardar) sin crear un ciclo de imports.
 */

export const EXTENSIONES_COMPROBANTE = ["jpg", "jpeg", "png", "webp", "pdf"];
const VIGENCIA_MS = 30 * 60 * 1000;

const selecciones = new Map<string, { ruta: string; expira: number }>();

export function validarExtensionComprobante(ruta: string) {
  const ext = path.extname(ruta).toLowerCase().replace(".", "");
  if (!EXTENSIONES_COMPROBANTE.includes(ext)) {
    throw new Error("Ese archivo no se puede usar como comprobante; usa JPG, PNG, WEBP o PDF.");
  }
}

function purgarVencidas() {
  const ahora = Date.now();
  for (const [token, s] of selecciones) if (s.expira <= ahora) selecciones.delete(token);
}

export function guardarSeleccion(ruta: string): { token: string; nombre: string } {
  validarExtensionComprobante(ruta);
  purgarVencidas();
  const token = randomUUID();
  selecciones.set(token, { ruta, expira: Date.now() + VIGENCIA_MS });
  return { token, nombre: path.basename(ruta) };
}

/** true si el token es real y vigente (no lo consume). */
export function existeSeleccion(token: string | undefined): boolean {
  if (!token) return false;
  purgarVencidas();
  return selecciones.has(token);
}

export function consumirSeleccion(token: string): string {
  purgarVencidas();
  const s = selecciones.get(token);
  if (!s) throw new Error("Vuelve a elegir el comprobante.");
  selecciones.delete(token);
  return s.ruta;
}

export function descartarSeleccion(token: string) {
  selecciones.delete(token);
}
