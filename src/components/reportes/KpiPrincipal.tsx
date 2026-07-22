import { ChipComparacion, InfoFormula, estadoDato, valorFormateado } from "@/components/reportes/kpi-shared";
import type { KPI } from "@shared/types";

/**
 * Tarjeta para las 3-4 métricas que definen la salud del negocio (ventas, margen, clientas...).
 * Sólo responde qué mide, cuánto vale, cómo cambió y si necesita atención — el resto (fórmula
 * completa) vive detrás del ícono "i" (INSTRUCCIONES §5.1, §C). El título nunca se trunca: si no
 * cabe en una línea, se envuelve a dos.
 */
export function KpiPrincipal({ kpi }: { kpi: KPI }) {
  const estimado = estadoDato(kpi) === "estimado";
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-beige-300 bg-beige-50 px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-snug text-ink-500">{kpi.titulo}</p>
        <InfoFormula kpi={kpi} />
      </div>
      <p className="metric-value text-[32px] leading-none text-ink-900">{valorFormateado(kpi)}</p>
      <div className="flex items-center gap-2">
        <ChipComparacion kpi={kpi} />
        {estimado && (
          <span className="rounded-full bg-warning-500/10 px-2 py-0.5 text-[10px] font-medium text-warning-500">
            Estimado
          </span>
        )}
      </div>
      {/* Una nota máxima — nunca un número solo sin contexto (INSTRUCCIONES §5.1, §13.3). */}
      {kpi.microexplicacion && <p className="text-xs text-ink-500">{kpi.microexplicacion}</p>}
    </div>
  );
}
