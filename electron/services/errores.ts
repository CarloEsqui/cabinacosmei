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

/**
 * SQLite reporta las violaciones de llave foránea con DOS códigos extendidos distintos:
 *  - `SQLITE_CONSTRAINT_FOREIGNKEY` para FKs sin acción (NO ACTION / chequeo diferido).
 *  - `SQLITE_CONSTRAINT_TRIGGER` para `ON DELETE RESTRICT`, que SQLite implementa internamente como
 *    un trigger con RAISE(ABORT, 'FOREIGN KEY constraint failed'). Todas las FKs de historial del
 *    esquema son `restrict`, así que este es el caso real al borrar (auditoría DAT-A1, 2026-11-03).
 * El segundo código también lo usaría un trigger propio, por eso se exige además el mensaje de FK.
 */
function esErrorForeignKey(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") return true;
  return code === "SQLITE_CONSTRAINT_TRIGGER" && error.message.includes("FOREIGN KEY constraint failed");
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
