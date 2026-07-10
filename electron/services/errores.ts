/**
 * Error reconocible por el renderer (vía el prefijo del mensaje, ya que IPC solo propaga
 * `message`) para ofrecer "Desactivar en su lugar" cuando un borrado no procede por historial.
 */
export class ErrorConHistorial extends Error {
  constructor(mensaje: string) {
    super(`HISTORIAL_ASOCIADO:${mensaje}`);
    this.name = "ErrorConHistorial";
  }
}

function esErrorForeignKey(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY";
}

/**
 * Ejecuta un borrado; si SQLite lo rechaza por una referencia (`FOREIGN KEY` con `onDelete: restrict`),
 * relanza un `ErrorConHistorial` con un mensaje claro en vez de un error críptico de SQLite.
 */
export function eliminarOFallarConHistorial<T>(borrar: () => T, mensajeHistorial: string): T {
  try {
    return borrar();
  } catch (error) {
    if (esErrorForeignKey(error)) {
      throw new ErrorConHistorial(mensajeHistorial);
    }
    throw error;
  }
}
