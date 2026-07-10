import { app } from "electron";
import { getDb, getDbPath, closeDb, checkpointDb, ejecutarSinForeignKeys } from "../db";
import * as schema from "../db/schema";
import { obtenerConfig } from "./config";
import { verificarPin } from "./auth";
import { registrarAccion } from "./bitacora";
import { crearRespaldo } from "./respaldos";
import { vaciarCarpetasDeDatos } from "./folders";
import fs from "node:fs";

// Todo lo que es "dato de negocio". Se excluye a propósito: `configuracion` (PIN + ajustes),
// `usuarios` (identidad del operador) y `respaldosLog` (para no perder el historial de respaldos,
// incluido el de seguridad que se crea justo antes de este borrado).
const TABLAS_NEGOCIO = [
  schema.cortes,
  schema.bitacora,
  schema.alertas,
  schema.archivos,
  schema.citas,
  schema.pagos,
  schema.serviciosProductosConsumidos,
  schema.serviciosRealizados,
  schema.movimientos,
  schema.salidasInventario,
  schema.entradasInventario,
  schema.lotes,
  schema.productos,
  schema.serviciosCatalogoProductos,
  schema.serviciosCatalogo,
  schema.tiposProducto,
  schema.proveedores,
  schema.clientes,
];

interface OpcionesBorrado {
  eliminarArchivos: boolean;
}

/**
 * Borra todos los datos de negocio (clientas, citas, inventario, pagos, servicios, cortes...)
 * pero conserva el PIN y la configuración de la app. Crea un respaldo automático antes de tocar
 * nada, así que siempre es reversible.
 */
export async function borrarDatosNegocio(
  pin: string,
  opciones: OpcionesBorrado,
  usuarioId?: string,
): Promise<void> {
  const pinValido = await verificarPin(pin);
  if (!pinValido) throw new Error("El PIN de acceso no es correcto.");

  await crearRespaldo(usuarioId, "antes_de_borrar_negocio");

  const db = getDb();
  ejecutarSinForeignKeys(() => {
    for (const tabla of TABLAS_NEGOCIO) {
      db.delete(tabla).run();
    }
  });

  if (opciones.eliminarArchivos) {
    const config = await obtenerConfig();
    vaciarCarpetasDeDatos(config.carpetaRaiz);
  }

  registrarAccion(db, {
    usuarioId,
    accion: "datos_negocio_borrados",
    detalle: opciones.eliminarArchivos
      ? "Datos de negocio borrados, incluidos los archivos físicos."
      : "Datos de negocio borrados; los archivos físicos se conservaron.",
  });
}

/**
 * Borra absolutamente todo, incluidos el PIN y la configuración — la app vuelve al estado de
 * "recién instalada" y pedirá crear un PIN nuevo. Crea un respaldo automático antes; ese .zip
 * queda en la carpeta "Respaldos" en disco y se puede restaurar después desde un archivo.
 */
export async function restablecerDeFabrica(
  pin: string,
  opciones: OpcionesBorrado,
  usuarioId?: string,
): Promise<void> {
  const pinValido = await verificarPin(pin);
  if (!pinValido) throw new Error("El PIN de acceso no es correcto.");

  await crearRespaldo(usuarioId, "antes_de_restablecer_fabrica");

  const config = await obtenerConfig();

  registrarAccion(getDb(), {
    usuarioId,
    accion: "restablecido_de_fabrica",
    detalle: opciones.eliminarArchivos ? "Con archivos físicos eliminados." : "Archivos físicos conservados.",
  });

  const dbPath = getDbPath();
  checkpointDb();
  closeDb();

  fs.rmSync(dbPath, { force: true });
  for (const sufijo of ["-wal", "-shm"]) {
    fs.rmSync(dbPath + sufijo, { force: true });
  }

  if (opciones.eliminarArchivos) {
    vaciarCarpetasDeDatos(config.carpetaRaiz);
  }

  app.relaunch();
  app.exit(0);
}
