import fs from "node:fs";
import path from "node:path";

interface EstadoVentana {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximizada: boolean;
}

const ESTADO_DEFECTO: EstadoVentana = { width: 1360, height: 860, maximizada: false };

let archivoEstado: string | null = null;

export function inicializarVentanaStore(userDataPath: string): void {
  archivoEstado = path.join(userDataPath, "window-state.json");
}

export function leerEstadoVentana(): EstadoVentana {
  if (!archivoEstado || !fs.existsSync(archivoEstado)) return ESTADO_DEFECTO;
  try {
    const contenido = JSON.parse(fs.readFileSync(archivoEstado, "utf-8"));
    return { ...ESTADO_DEFECTO, ...contenido };
  } catch {
    return ESTADO_DEFECTO;
  }
}

export function guardarEstadoVentana(estado: EstadoVentana): void {
  if (!archivoEstado) return;
  try {
    fs.writeFileSync(archivoEstado, JSON.stringify(estado), "utf-8");
  } catch {
    // No es crítico perder el estado de ventana entre sesiones.
  }
}
