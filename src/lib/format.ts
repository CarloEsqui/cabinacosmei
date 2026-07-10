import { format, parseISO } from "date-fns";

/** Convierte una fecha ISO (YYYY-MM-DD) a DD/MM/YYYY para mostrar en la interfaz. */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

/** Convierte fecha ISO + hora (HH:mm) a "DD/MM/YYYY HH:mm". */
export function formatFechaHora(iso: string | null | undefined, hora?: string | null): string {
  const fecha = formatFecha(iso);
  if (fecha === "—") return fecha;
  return hora ? `${fecha} ${hora}` : fecha;
}

/** Convierte un timestamp (epoch ms) a "DD/MM/YYYY HH:mm" en hora local. */
export function formatFechaHoraMs(ms: number): string {
  return format(new Date(ms), "dd/MM/yyyy HH:mm");
}
