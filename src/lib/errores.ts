const MARCADOR_HISTORIAL = "HISTORIAL_ASOCIADO:";

// Prefijos que Electron antepone al reenviar por IPC un error del proceso principal. El formato
// cambió entre versiones: antes "Error invoking remote method 'canal': …" y desde Electron 2x
// "Error occurred in handler for 'canal': …". La usuaria nunca debe ver ninguno.
const PREFIJO_IPC = /^Error (?:invoking remote method|occurred in handler for) '[^']*':\s*/;
// Nombre de la clase del error ("Error:", "SqliteError:", "ErrorConHistorial:", "ZodError:"…),
// a veces repetido tras el prefijo de IPC (DAT-B1).
const PREFIJO_CLASE = /^\w*Error\w*:\s*/;

/**
 * Un error de validación de zod llega como el JSON de sus "issues". Si el texto lo es, devuelve el
 * mensaje del primer issue (los esquemas de shared/schemas.ts ya traen mensajes en español).
 */
function mensajeDeZod(texto: string): string | null {
  if (!texto.startsWith("[")) return null;
  try {
    const issues = JSON.parse(texto) as { message?: unknown }[];
    const primero = Array.isArray(issues) ? issues.find((i) => typeof i?.message === "string") : undefined;
    return primero ? (primero.message as string) : null;
  } catch {
    return null;
  }
}

/** Limpia el mensaje de un error lanzado desde el proceso principal vía IPC para mostrarlo al usuario. */
export function mensajeDeError(error: unknown, fallback = "Ocurrió un error inesperado."): string {
  if (!(error instanceof Error)) return fallback;
  let limpio = error.message.trim().replace(PREFIJO_IPC, "");
  while (PREFIJO_CLASE.test(limpio)) limpio = limpio.replace(PREFIJO_CLASE, "");
  limpio = limpio.replace(MARCADOR_HISTORIAL, "").trim();
  const deZod = mensajeDeZod(limpio);
  if (deZod) return deZod;
  // Un JSON o un volcado técnico que no supimos interpretar no se muestra tal cual.
  if (limpio.startsWith("[") || limpio.startsWith("{")) return fallback;
  return limpio || fallback;
}

/** Detecta el marcador que usa `ErrorConHistorial` (electron/services/errores.ts) vía IPC. */
export function tieneHistorialAsociado(error: unknown): boolean {
  return error instanceof Error && error.message.includes(MARCADOR_HISTORIAL);
}
