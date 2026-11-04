import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Si el mensaje trae una lista ("Encabezado: a; b; c. Indicación final", como el aviso de stock
 * insuficiente), la separa para mostrarla como viñetas en vez de un renglón larguísimo.
 */
function partir(mensaje: string): { encabezado: string; items: string[]; pie: string | null } | null {
  const m = /^([^:]+):\s(.+?;.+?)\.(?:\s(.+))?$/s.exec(mensaje);
  if (!m) return null;
  return { encabezado: m[1], items: m[2].split(/;\s*/), pie: m[3] ?? null };
}

/** Recuadro de error uniforme para formularios y modales (en vez de texto rojo suelto). */
export function AlertaError({ mensaje, className }: { mensaje: string; className?: string }) {
  const partes = partir(mensaje);
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-danger-500/25 bg-danger-500/10 px-3.5 py-3 text-sm text-ink-700",
        className,
      )}
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger-500" />
      {partes ? (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-ink-900">{partes.encabezado}</p>
          <ul className="list-disc pl-4">
            {partes.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          {partes.pie && <p className="text-ink-500">{partes.pie}</p>}
        </div>
      ) : (
        <p>{mensaje}</p>
      )}
    </div>
  );
}
