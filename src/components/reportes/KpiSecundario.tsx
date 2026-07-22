import { ChipComparacion, valorFormateado } from "@/components/reportes/kpi-shared";
import type { KPI } from "@shared/types";

/**
 * Tarjeta compacta para métricas de apoyo (ticket, no-show, días entre visitas...). Sin
 * descripción permanente ni fórmula visible — sólo título, valor y comparación abreviada
 * (INSTRUCCIONES §5.2). Más chica y con menos peso visual que KpiPrincipal a propósito.
 */
export function KpiSecundario({ kpi }: { kpi: KPI }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-beige-200 bg-beige-50/60 px-4 py-3">
      <p className="text-xs font-medium leading-snug text-ink-500">{kpi.titulo}</p>
      <div className="flex items-baseline gap-2">
        <p className="metric-value text-xl text-ink-900">{valorFormateado(kpi)}</p>
        <ChipComparacion kpi={kpi} compacto />
      </div>
    </div>
  );
}
