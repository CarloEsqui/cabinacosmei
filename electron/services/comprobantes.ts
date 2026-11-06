import fs from "node:fs";
import path from "node:path";
import { nativeImage } from "electron";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "../db";
import { archivos, citas, serviciosRealizados, ventasMostrador } from "../db/schema";
import { guardarArchivoDesdeRuta } from "./archivos";
import { carpetaDatos, rutaDentroDe } from "./folders";
import { consumirSeleccion, validarExtensionComprobante } from "./seleccionesArchivo";
import { ligarComprobanteEnTx } from "./cobros";
import { obtenerConfig } from "./config";
import { asegurarCarpetaCliente } from "./clientes";
import { asegurarCarpetaServicio } from "./serviciosRealizados";
import { registrarAccion } from "./bitacora";
import type { ComprobanteRow } from "../../shared/types";

/**
 * Comprobantes de pago (addendum 2026-11-05: evidencia opcional, no candado).
 * - Del servicio cerrado: `archivos` con entidad `servicio_realizado`, en la carpeta del servicio.
 * - De un anticipo: `archivos` con entidad `cita`, en la carpeta "Pagos" de la clienta, ligado a los
 *   pagos con `pagos.comprobante_archivo_id`.
 * - De una venta de mostrador (0008): `archivos` con entidad `venta_mostrador`, en "Pagos" de la
 *   clienta o, sin clienta, en `Datos/Comprobantes/Ventas`; ligado a sus pagos.
 * Las rutas las decide siempre el main; el renderer solo maneja ids y tokens.
 */

export { EXTENSIONES_COMPROBANTE, guardarSeleccion, descartarSeleccion } from "./seleccionesArchivo";
const EXT_IMAGEN = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export async function subirComprobanteServicio(servicioId: string, rutaOrigen: string, usuarioId?: string) {
  validarExtensionComprobante(rutaOrigen);
  const carpeta = await asegurarCarpetaServicio(servicioId);
  return guardarArchivoDesdeRuta({
    entidadTipo: "servicio_realizado",
    entidadId: servicioId,
    rutaOrigen,
    carpetaDestino: carpeta,
    categoria: "comprobante",
    usuarioId,
  });
}

/** Guarda el comprobante de un anticipo recién registrado y lo liga a sus pagos. */
export async function adjuntarComprobanteAnticipo(token: string, citaId: string, pagoIds: string[], usuarioId?: string) {
  const ruta = consumirSeleccion(token);
  const db = getDb();
  const cita = db.select({ clienteId: citas.clienteId }).from(citas).where(eq(citas.id, citaId)).get();
  if (!cita) throw new Error("La cita no existe.");
  const carpeta = path.join(await asegurarCarpetaCliente(cita.clienteId), "Pagos");
  const archivo = await guardarArchivoDesdeRuta({
    entidadTipo: "cita",
    entidadId: citaId,
    rutaOrigen: ruta,
    carpetaDestino: carpeta,
    categoria: "comprobante",
    usuarioId,
  });
  // `pagos` solo lo escribe cobros.ts (condición 5 del Gate del cobro; COB-M3).
  if (archivo && pagoIds.length > 0) ligarComprobanteEnTx(db, pagoIds, archivo.id);
}

/** Carpeta del comprobante de una venta: "Pagos" de la clienta, o `Datos/Comprobantes/Ventas`. */
async function carpetaComprobanteVenta(ventaId: string): Promise<string> {
  const db = getDb();
  const v = db.select({ clienteId: ventasMostrador.clienteId }).from(ventasMostrador).where(eq(ventasMostrador.id, ventaId)).get();
  if (!v) throw new Error("La venta no existe.");
  if (v.clienteId) return path.join(await asegurarCarpetaCliente(v.clienteId), "Pagos");
  const { carpetaRaiz } = await obtenerConfig();
  const carpeta = path.join(carpetaDatos(carpetaRaiz), "Comprobantes", "Ventas");
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

/**
 * Comprobante elegido al registrar la venta (condición 10 del Gate de la venta): la venta ya quedó
 * guardada; si esto falla, quien llama deja bitácora `cobro_sin_comprobante` y NO revierte.
 */
export async function adjuntarComprobanteVenta(token: string, ventaId: string, pagoIds: string[], usuarioId?: string) {
  const ruta = consumirSeleccion(token);
  const archivo = await guardarArchivoDesdeRuta({
    entidadTipo: "venta_mostrador",
    entidadId: ventaId,
    rutaOrigen: ruta,
    carpetaDestino: await carpetaComprobanteVenta(ventaId),
    categoria: "comprobante",
    usuarioId,
  });
  // `pagos` solo lo escribe cobros.ts.
  if (archivo && pagoIds.length > 0) ligarComprobanteEnTx(getDb(), pagoIds, archivo.id);
}

/** Comprobante agregado después, desde el detalle de la venta. */
export async function subirComprobanteVenta(ventaId: string, rutaOrigen: string, usuarioId?: string) {
  validarExtensionComprobante(rutaOrigen);
  return guardarArchivoDesdeRuta({
    entidadTipo: "venta_mostrador",
    entidadId: ventaId,
    rutaOrigen,
    carpetaDestino: await carpetaComprobanteVenta(ventaId),
    categoria: "comprobante",
    usuarioId,
  });
}

export async function listarComprobantesVenta(ventaId: string): Promise<ComprobanteRow[]> {
  const db = getDb();
  return db
    .select()
    .from(archivos)
    .where(and(eq(archivos.categoria, "comprobante"), eq(archivos.entidadTipo, "venta_mostrador"), eq(archivos.entidadId, ventaId)))
    .all()
    .map((a) => ({
      id: a.id,
      nombreOriginal: a.nombreOriginal,
      createdAt: a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt),
      origen: "venta" as const,
      esPdf: path.extname(a.rutaFisica).toLowerCase() === ".pdf",
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function listarComprobantesCita(citaId: string): Promise<ComprobanteRow[]> {
  const db = getDb();
  const servicio = db
    .select({ id: serviciosRealizados.id })
    .from(serviciosRealizados)
    .where(eq(serviciosRealizados.citaId, citaId))
    .get();
  const condicionEntidad = servicio
    ? or(
        and(eq(archivos.entidadTipo, "cita"), eq(archivos.entidadId, citaId)),
        and(eq(archivos.entidadTipo, "servicio_realizado"), eq(archivos.entidadId, servicio.id)),
      )
    : and(eq(archivos.entidadTipo, "cita"), eq(archivos.entidadId, citaId));
  return db
    .select()
    .from(archivos)
    .where(and(eq(archivos.categoria, "comprobante"), condicionEntidad))
    .all()
    .map((a) => ({
      id: a.id,
      nombreOriginal: a.nombreOriginal,
      createdAt: a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt),
      origen: a.entidadTipo === "cita" ? ("anticipo" as const) : ("servicio" as const),
      esPdf: path.extname(a.rutaFisica).toLowerCase() === ".pdf",
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Ruta física de un comprobante, solo si está dentro de la carpeta del negocio y existe. */
export async function rutaComprobante(archivoId: string): Promise<{ ruta: string; nombre: string }> {
  const db = getDb();
  const a = db.select().from(archivos).where(eq(archivos.id, archivoId)).get();
  if (!a || a.categoria !== "comprobante") throw new Error("El comprobante no existe.");
  const config = await obtenerConfig();
  // Dentro de "Datos/" del negocio (no de Respaldos/, COB-B7a).
  if (!rutaDentroDe(a.rutaFisica, carpetaDatos(config.carpetaRaiz))) {
    throw new Error("El comprobante está fuera de la carpeta del negocio.");
  }
  if (!fs.existsSync(a.rutaFisica)) throw new Error("El archivo del comprobante ya no está en su carpeta.");
  return { ruta: a.rutaFisica, nombre: a.nombreOriginal };
}

/**
 * Vista previa como data URL JPEG. Usa la miniatura del sistema (asíncrona; también dibuja PDFs en
 * macOS y Windows) y, si no hay, reduce la imagen. null si no se puede dibujar.
 */
export async function vistaPrevia(archivoId: string, tamano: "mini" | "grande"): Promise<string | null> {
  const { ruta } = await rutaComprobante(archivoId);
  const lado = tamano === "grande" ? 1600 : 240;
  try {
    const mini = await nativeImage.createThumbnailFromPath(ruta, { width: lado, height: lado });
    if (!mini.isEmpty()) return `data:image/jpeg;base64,${mini.toJPEG(85).toString("base64")}`;
  } catch {
    // Sin miniatura del sistema (ej. Linux): se intenta con la imagen directa.
  }
  if (!EXT_IMAGEN.has(path.extname(ruta).toLowerCase())) return null;
  const img = nativeImage.createFromPath(ruta);
  if (img.isEmpty()) return null;
  const reducida = img.getSize().width > lado ? img.resize({ width: lado }) : img;
  return `data:image/jpeg;base64,${reducida.toJPEG(85).toString("base64")}`;
}

/** Copia del comprobante a donde la usuaria elija (la ruta destino viene del diálogo del main). */
export async function guardarCopia(archivoId: string, destino: string, usuarioId?: string) {
  const { ruta } = await rutaComprobante(archivoId);
  fs.copyFileSync(ruta, destino);
  registrarAccion(getDb(), {
    usuarioId,
    accion: "comprobante_copiado",
    entidadTipo: "archivo",
    entidadId: archivoId,
    detalle: "Se guardó una copia de un comprobante fuera de la app.",
  });
}
