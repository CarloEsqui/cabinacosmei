import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";

const SUBCARPETAS_RAIZ = ["Clientes", "Inventario", "Comprobantes", "Servicios", "Respaldos"] as const;
const SUBCARPETAS_CLIENTE = ["Documentos", "Fotos", "Servicios", "Pagos"] as const;

/** Quita acentos, caracteres inválidos de ruta y normaliza espacios para nombres de carpeta. */
export function sanitizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas (acentos) tras normalizar
    .replace(/[/\\?%*:|"<>]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

/** Devuelve una ruta libre agregando sufijo incremental si ya existe (anti-colisión). */
function rutaSinColision(rutaBase: string): string {
  if (!fs.existsSync(rutaBase)) return rutaBase;
  let intento = 2;
  let candidata = `${rutaBase}_${intento}`;
  while (fs.existsSync(candidata)) {
    intento += 1;
    candidata = `${rutaBase}_${intento}`;
  }
  return candidata;
}

export function asegurarEstructuraRaiz(carpetaRaiz: string): void {
  fs.mkdirSync(carpetaRaiz, { recursive: true });
  for (const sub of SUBCARPETAS_RAIZ) {
    fs.mkdirSync(path.join(carpetaRaiz, sub), { recursive: true });
  }
}

export function crearCarpetaCliente(
  carpetaRaiz: string,
  codigoCliente: string,
  nombreCompleto: string,
): string {
  const nombreCarpeta = `${codigoCliente}_${sanitizarNombre(nombreCompleto)}`;
  const rutaBase = path.join(carpetaRaiz, "Clientes", nombreCarpeta);
  const rutaFinal = rutaSinColision(rutaBase);

  fs.mkdirSync(rutaFinal, { recursive: true });
  for (const sub of SUBCARPETAS_CLIENTE) {
    fs.mkdirSync(path.join(rutaFinal, sub), { recursive: true });
  }
  return rutaFinal;
}

export function crearCarpetaServicio(
  carpetaCliente: string,
  codigoServicio: string,
  fechaIso: string,
  nombreServicio: string,
): string {
  const nombreCarpeta = `${codigoServicio}_${fechaIso}_${sanitizarNombre(nombreServicio)}`;
  const rutaBase = path.join(carpetaCliente, "Servicios", nombreCarpeta);
  const rutaFinal = rutaSinColision(rutaBase);
  fs.mkdirSync(rutaFinal, { recursive: true });
  return rutaFinal;
}

export async function abrirCarpeta(rutaAbsoluta: string): Promise<void> {
  const error = await shell.openPath(rutaAbsoluta);
  if (error) {
    throw new Error(`No se pudo abrir la carpeta: ${error}`);
  }
}
