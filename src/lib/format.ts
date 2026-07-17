import { format, parseISO } from "date-fns";

const formateadorMoneda = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatea un número como dinero con separador de miles y 2 decimales: 590 → "$590.00", 1234.5 → "$1,234.50". */
export function formatMoneda(n: number | null | undefined): string {
  return `$${formateadorMoneda.format(n ?? 0)}`;
}

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

/** Primer nombre de un nombre completo, para saludos personalizados ("Daniela Fernanda López" → "Daniela"). */
export function getFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0];
}
