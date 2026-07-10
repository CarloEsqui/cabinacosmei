import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";

/** Subcarpetas que contienen datos del negocio: viven todas dentro de "Datos/", hermana (no
 * dentro) de "Respaldos/", para que un borrado de "Datos/" nunca pueda alcanzar los respaldos
 * aunque sea recursivo o se agreguen más subcarpetas de datos en el futuro. */
export const SUBCARPETAS_DATOS = ["Clientes", "Inventario", "Comprobantes", "Servicios"] as const;
const NOMBRE_CARPETA_DATOS = "Datos";
const NOMBRE_CARPETA_RESPALDOS = "Respaldos";
const SUBCARPETAS_CLIENTE = ["Documentos", "Fotos", "Servicios", "Pagos"] as const;

export function carpetaDatos(carpetaRaiz: string): string {
  return path.join(carpetaRaiz, NOMBRE_CARPETA_DATOS);
}

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

/**
 * Instalaciones de antes de que existiera "Datos/" tenían Clientes/Inventario/Comprobantes/
 * Servicios sueltos directamente bajo la carpeta raíz, al mismo nivel que "Respaldos". Esta
 * migración (de una sola vez, idempotente) los mueve dentro de "Datos/" la primera vez que se
 * detectan ahí. Las rutas ya guardadas en la base de datos se corrigen aparte, en
 * `migrarRutasCarpetas` (services/migracionCarpetas.ts), que se llama justo después de esto.
 */
function migrarCarpetasSueltasADatos(carpetaRaiz: string): void {
  const datos = carpetaDatos(carpetaRaiz);
  if (fs.existsSync(datos)) return;
  fs.mkdirSync(datos, { recursive: true });
  for (const sub of SUBCARPETAS_DATOS) {
    const origen = path.join(carpetaRaiz, sub);
    if (fs.existsSync(origen)) {
      fs.renameSync(origen, path.join(datos, sub));
    }
  }
}

export function asegurarEstructuraRaiz(carpetaRaiz: string): void {
  fs.mkdirSync(carpetaRaiz, { recursive: true });
  migrarCarpetasSueltasADatos(carpetaRaiz);
  fs.mkdirSync(path.join(carpetaRaiz, NOMBRE_CARPETA_RESPALDOS), { recursive: true });
  for (const sub of SUBCARPETAS_DATOS) {
    fs.mkdirSync(path.join(carpetaDatos(carpetaRaiz), sub), { recursive: true });
  }
}

export function crearCarpetaCliente(
  carpetaRaiz: string,
  codigoCliente: string,
  nombreCompleto: string,
): string {
  const nombreCarpeta = `${codigoCliente}_${sanitizarNombre(nombreCompleto)}`;
  const rutaBase = path.join(carpetaDatos(carpetaRaiz), "Clientes", nombreCarpeta);
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

/**
 * Vacía toda la carpeta "Datos/" (Clientes, Servicios, Comprobantes, Inventario) y la vuelve a
 * crear vacía. "Respaldos/" es una hermana de "Datos/", nunca su contenido, así que ni borrando
 * "Datos/" completa de un tirón hay forma de alcanzarla.
 */
export function vaciarCarpetasDeDatos(carpetaRaiz: string): void {
  fs.rmSync(carpetaDatos(carpetaRaiz), { recursive: true, force: true });
  asegurarEstructuraRaiz(carpetaRaiz);
}

export async function abrirCarpeta(rutaAbsoluta: string): Promise<void> {
  const error = await shell.openPath(rutaAbsoluta);
  if (error) {
    throw new Error(`No se pudo abrir la carpeta: ${error}`);
  }
}
