import { AlertTriangle, AlertCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { valorFormateado } from "@/components/reportes/kpi-shared";
import type { KPI } from "@shared/types";

interface KpiRiesgoProps {
  kpi: KPI;
  /** "critico" tiñe en rojo; "atencion" (default) en ámbar. Nunca debe leerse como un KPI positivo. */
  severidad?: "critico" | "atencion";
  /** Frase de impacto de una línea (ej. "6 clientas tienen saldo vencido"). */
  impacto?: string;
  accion?: { label: string; onClick: () => void };
  /** Si se pasa, toda la tarjeta se vuelve clicable y abre el drill-down de esta cifra
   * (INSTRUCCIONES §15: toda métrica debe poder explicarse). */
  onDetalle?: () => void;
}

/**
 * Tarjeta para métricas que representan riesgo u oportunidad de pérdida (cartera, caducidad,
 * no-show alto...). Deliberadamente distinta de KpiPrincipal: borde y fondo con tinte de
 * severidad, e incluye una acción concreta en vez de solo mostrar el número (INSTRUCCIONES §5.3).
 */
export function KpiRiesgo({ kpi, severidad = "atencion", impacto, accion, onDetalle }: KpiRiesgoProps) {
  const critico = severidad === "critico";
  const Icono = critico ? AlertTriangle : AlertCircle;
  const color = critico ? "text-danger-500" : "text-warning-500";
  const fondo = critico ? "bg-danger-500/[0.05] border-danger-500/25" : "bg-warning-500/[0.05] border-warning-500/25";

  return (
    <div
      className={`group flex flex-col gap-2 rounded-2xl border px-5 py-4 ${fondo} ${onDetalle ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
      onClick={onDetalle}
      role={onDetalle ? "button" : undefined}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <Icono size={14} className={color} />
          <p className="text-xs font-medium leading-snug text-ink-700">{kpi.titulo}</p>
        </div>
        {onDetalle && <ChevronRight size={14} className="text-ink-300 transition-transform group-hover:translate-x-0.5" />}
      </div>
      <p className="metric-value text-[28px] leading-none text-ink-900">{valorFormateado(kpi)}</p>
      {impacto && <p className="text-xs text-ink-600">{impacto}</p>}
      {accion && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-1 w-fit"
          onClick={(e) => {
            e.stopPropagation();
            accion.onClick();
          }}
        >
          {accion.label}
        </Button>
      )}
    </div>
  );
}
