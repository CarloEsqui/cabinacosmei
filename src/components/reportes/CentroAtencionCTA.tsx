import { AlertTriangle, AlertCircle, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Hallazgo } from "@shared/types";

/**
 * Punto de entrada al Centro de atención — cuando hay algo pendiente debe ser lo más llamativo del
 * encabezado, no un botón secundario que se pierde en el fondo. Usa color sólido (no el tinte suave
 * de las tarjetas individuales) según la severidad real de los hallazgos, para que el ojo vaya ahí
 * primero si algo lo amerita. Cuando no hay nada pendiente, muestra un estado tranquilo "en orden".
 */
export function CentroAtencionCTA({ hallazgos, onClick }: { hallazgos: Hallazgo[]; onClick: () => void }) {
  if (hallazgos.length === 0) {
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-success-500/25 bg-success-500/[0.06] px-4 py-3.5 lg:w-80">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-500 text-beige-50">
          <CheckCircle2 size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">Todo en orden</p>
          <p className="text-xs text-ink-500">Sin pendientes en este periodo.</p>
        </div>
      </div>
    );
  }

  const urgentes = hallazgos.filter((h) => h.tono === "critico" || h.tono === "atencion");
  const critico = urgentes.some((h) => h.tono === "critico");
  const hayUrgencia = urgentes.length > 0;

  const principal = hayUrgencia ? urgentes[0] : hallazgos[0];
  const cantidad = hayUrgencia ? urgentes.length : hallazgos.length;
  const Icono = critico ? AlertTriangle : hayUrgencia ? AlertCircle : Sparkles;

  const acento = critico ? "danger" : hayUrgencia ? "warning" : "jacaranda";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md lg:w-80",
        acento === "danger" && "border-danger-500/40 bg-danger-500/[0.08]",
        acento === "warning" && "border-warning-500/40 bg-warning-500/[0.08]",
        acento === "jacaranda" && "border-jacaranda-400/35 bg-jacaranda-500/[0.08]",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-beige-50 shadow-sm",
          acento === "danger" && "bg-danger-500",
          acento === "warning" && "bg-warning-500",
          acento === "jacaranda" && "bg-jacaranda-500",
        )}
      >
        <Icono size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-ink-900">Centro de atención</p>
          <span
            className={cn(
              "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-beige-50",
              acento === "danger" && "bg-danger-500",
              acento === "warning" && "bg-warning-500",
              acento === "jacaranda" && "bg-jacaranda-500",
            )}
          >
            {cantidad}
          </span>
        </div>
        <p className="truncate text-xs text-ink-600">{principal.titulo}</p>
      </div>
      <ArrowRight size={18} className="shrink-0 text-ink-400 transition-transform group-hover:translate-x-1" />
    </button>
  );
}
