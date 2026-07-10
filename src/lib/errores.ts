const MARCADOR_HISTORIAL = "HISTORIAL_ASOCIADO:";

/** Limpia el mensaje de un error lanzado desde el proceso principal vía IPC para mostrarlo al usuario. */
export function mensajeDeError(error: unknown, fallback = "Ocurrió un error inesperado."): string {
  if (error instanceof Error) {
    const limpio = error.message
      .replace(/^Error invoking remote method '[^']*':\s*/, "")
      .replace(/^Error:\s*/, "")
      .replace(MARCADOR_HISTORIAL, "");
    return limpio || fallback;
  }
  return fallback;
}

/** Detecta el marcador que usa `ErrorConHistorial` (electron/services/errores.ts) vía IPC. */
export function tieneHistorialAsociado(error: unknown): boolean {
  return error instanceof Error && error.message.includes(MARCADOR_HISTORIAL);
}
