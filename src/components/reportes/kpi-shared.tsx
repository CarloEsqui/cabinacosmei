import { ArrowDown, ArrowUp, Info, Minus } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { formatKpi } from "@/lib/format";
import type { KPI } from "@shared/types";

/** IDs donde subir es malo (dinero pendiente, riesgo). El resto: subir es bueno. */
export const SUBIR_ES_MALO = new Set(["cartera", "no_show", "caducidad", "caducado", "en_riesgo", "inactivas"]);

export function colorCambio(cambio: number, subirEsBueno: boolean): string {
  if (Math.abs(cambio) < 0.05) return "text-ink-400";
  const bueno = cambio > 0 === subirEsBueno;
  return bueno ? "text-success-500" : "text-danger-500";
}

/** Chip compacto de variación: flecha + %, o "sin base comparable" cuando no hay periodo previo. */
export function ChipComparacion({ kpi, compacto = false }: { kpi: KPI; compacto?: boolean }) {
  const comp = kpi.comparacion;
  if (!comp) return null;
  const pct = comp.cambioPorcentual;
  const subirEsBueno = !SUBIR_ES_MALO.has(kpi.id);

  if (pct === null) {
    return (
      <span className="flex items-center gap-1 text-xs text-ink-400">
        <Minus size={12} /> {compacto ? "s/base" : "sin base comparable"}
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${colorCambio(pct, subirEsBueno)}`}>
      {pct >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(pct).toFixed(1)}%
      {!compacto && <span className="font-normal text-ink-400">{comp.etiqueta}</span>}
    </span>
  );
}

/**
 * Botón "i" que abre un popover con la fórmula en lenguaje llano — reemplaza el tooltip absoluto
 * anterior (que podía desbordar) y evita saturar la tarjeta con texto permanente (INSTRUCCIONES §17).
 */
export function InfoFormula({ kpi }: { kpi: KPI }) {
  return (
    <Popover
      align="end"
      trigger={({ abierto }) => (
        <button
          type="button"
          className={`rounded p-0.5 ${abierto ? "text-jacaranda-600" : "text-ink-300 hover:text-ink-500"}`}
          aria-label="Cómo se calcula"
        >
          <Info size={13} />
        </button>
      )}
      panelClassName="w-64"
    >
      {() => (
        <div className="flex flex-col gap-1.5 text-xs">
          <p className="font-semibold text-ink-900">Cómo se calcula</p>
          <p className="text-ink-600">{kpi.formula}</p>
          {kpi.microexplicacion && <p className="mt-1 text-ink-400">{kpi.microexplicacion}</p>}
        </div>
      )}
    </Popover>
  );
}

/** Estado de calidad de dato, derivado de si el KPI trae advertencias específicas del backend. */
export function estadoDato(kpi: KPI): "completo" | "estimado" {
  return kpi.advertencias && kpi.advertencias.length > 0 ? "estimado" : "completo";
}

export function valorFormateado(kpi: KPI): string {
  return formatKpi(kpi.valor, kpi.formato);
}
