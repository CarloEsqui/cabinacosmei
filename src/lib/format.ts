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

/** Pluraliza el nombre de una pieza de forma simple: 1 → singular, otro → +s ("bote"→"botes"). */
function pluralizarPieza(pieza: string, cantidad: number): string {
  if (Math.abs(cantidad) === 1) return pieza;
  if (/[sxz]$/i.test(pieza)) return pieza; // ya termina en plural (ej. "pzas")
  return `${pieza}s`;
}

/**
 * Formatea una existencia (que SIEMPRE se cuenta en piezas) de forma amigable para la usuaria:
 *  - Entero exacto: "3 botes".
 *  - Con fracción: "~1.9 botes" (el "~" avisa que es aproximado).
 *  - Si el producto tiene contenido definido, agrega el total entre paréntesis: "~1.9 botes (115 ml)".
 *  - Sin presentación definida cae a piezas genéricas: "2 pzas".
 */
export function formatearStock(
  stockPiezas: number | null | undefined,
  presentacion: string | null | undefined,
  contenidoCantidad: number | null | undefined,
  contenidoUnidad: string | null | undefined,
): string {
  const n = stockPiezas ?? 0;
  const pieza = (presentacion?.trim() || "pza").toLowerCase();
  const esEntero = Math.abs(n - Math.round(n)) < 0.05;
  const cantidadTexto = esEntero ? String(Math.round(n)) : `~${n.toFixed(1)}`;
  const plural = pluralizarPieza(pieza, esEntero ? Math.round(n) : n);
  let texto = `${cantidadTexto} ${plural}`;
  if (contenidoCantidad && contenidoCantidad > 0 && contenidoUnidad) {
    const total = Math.round(n * contenidoCantidad);
    texto += ` (${total} ${contenidoUnidad})`;
  }
  return texto;
}

/** Formatea el valor de un KPI según su tipo. */
export function formatKpi(valor: number | null, formato: "moneda" | "porcentaje" | "numero" | "dias" | "horas"): string {
  if (valor === null || Number.isNaN(valor)) return "—";
  switch (formato) {
    case "moneda":
      return formatMoneda(valor);
    case "porcentaje":
      return `${valor.toFixed(1)}%`;
    case "dias":
      return `${Math.round(valor)} d`;
    case "horas":
      return `${valor.toFixed(1)} h`;
    default:
      return new Intl.NumberFormat("es-MX").format(Math.round(valor));
  }
}
