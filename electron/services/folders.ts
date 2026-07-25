import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import { obtenerConfig } from "./config";

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

/**
 * Resuelve symlinks en la porción de `ruta` que ya existe en disco, aunque el último componente
 * todavía no exista (ej. una carpeta de destino que se va a crear). Así se puede comparar contra
 * una raíz de confianza sin que un symlink intermedio permita "escapar" de ella.
 */
function resolverRealParcial(ruta: string): string {
  let actual = path.resolve(ruta);
  let sufijo = "";
  while (!fs.existsSync(actual)) {
    const padre = path.dirname(actual);
    if (padre === actual) break; // llegó a la raíz del sistema de archivos sin encontrar nada
    sufijo = sufijo ? path.join(path.basename(actual), sufijo) : path.basename(actual);
    actual = padre;
  }
  const real = fs.realpathSync(actual);
  return sufijo ? path.join(real, sufijo) : real;
}

/**
 * True si `ruta` cae dentro de (o es exactamente) `raiz`, resolviendo symlinks en ambos lados
 * para que un enlace simbólico no permita salir del límite. Se usa para validar rutas que llegan
 * del renderer (potencialmente comprometido) antes de abrirlas o escribir en ellas.
 */
export function rutaDentroDe(ruta: string, raiz: string): boolean {
  if (!ruta || !raiz) return false;
  try {
    const raizReal = fs.realpathSync(raiz);
    const rutaReal = resolverRealParcial(ruta);
    const relativo = path.relative(raizReal, rutaReal);
    return relativo === "" || (!relativo.startsWith("..") && !path.isAbsolute(relativo));
  } catch {
    return false;
  }
}

/**
 * Abre una carpeta con el explorador de archivos del sistema. `rutaAbsoluta` viene del renderer
 * (sandboxeado, pero se trata como no confiable), así que se valida que caiga dentro de la
 * carpeta raíz del negocio o de la carpeta de respaldos actual antes de pasarla a
 * `shell.openPath` — de lo contrario un renderer comprometido podría abrir/lanzar cualquier
 * archivo o programa del sistema.
 */
export async function abrirCarpeta(rutaAbsoluta: string): Promise<void> {
  const config = await obtenerConfig();
  const carpetaRespaldos = path.join(config.carpetaRaiz, NOMBRE_CARPETA_RESPALDOS);
  const permitido =
    rutaDentroDe(rutaAbsoluta, config.carpetaRaiz) || rutaDentroDe(rutaAbsoluta, carpetaRespaldos);
  if (!permitido) {
    throw new Error("Esa carpeta está fuera de la carpeta del negocio y no se puede abrir.");
  }

  let destino: string;
  try {
    destino = fs.realpathSync(rutaAbsoluta);
  } catch {
    throw new Error("La carpeta no existe.");
  }
  if (!fs.statSync(destino).isDirectory()) {
    throw new Error("La ruta indicada no es una carpeta.");
  }

  const error = await shell.openPath(rutaAbsoluta);
  if (error) {
    throw new Error(`No se pudo abrir la carpeta: ${error}`);
  }
}
