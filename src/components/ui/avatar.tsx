import { cn } from "@/lib/utils";

// Tonos suaves de la paleta: cada clienta conserva siempre el mismo (se deriva de su nombre), así
// se reconoce de un vistazo en listas largas sin depender de una foto.
const TONOS = [
  "bg-jacaranda-100 text-jacaranda-700",
  "bg-beige-200 text-ink-700",
  "bg-success-500/15 text-success-500",
  "bg-warning-500/15 text-warning-500",
  "bg-jacaranda-50 text-jacaranda-600",
];

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primera = partes[0][0] ?? "";
  const segunda = partes.length > 1 ? partes[partes.length > 2 ? 2 : 1][0] : "";
  return (primera + segunda).toUpperCase();
}

function tono(nombre: string): string {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length];
}

/** Círculo con las iniciales de la clienta (nombre + primer apellido). */
export function Avatar({
  nombre,
  size = "md",
  apagado = false,
  className,
}: {
  nombre: string;
  size?: "sm" | "md" | "lg";
  /** Clienta inactiva o cita cancelada: en gris para que no compita con lo vigente. */
  apagado?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        size === "sm" && "h-8 w-8 text-xs",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-14 w-14 text-lg",
        apagado ? "bg-beige-200 text-ink-400" : tono(nombre),
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}
