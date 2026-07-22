import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fechaLocalIso, inicioDeMesIso, inicioDeSemanaIso, sumarDiasIso } from "@shared/fechas";
import { formatFecha } from "@/lib/format";
import type { RangoFechas, ResumenFiltro } from "@shared/schemas";

type ModoComparacion = ResumenFiltro["comparacion"];

interface FiltrosReportesProps {
  rango: RangoFechas;
  comparacion: ModoComparacion;
  onRango: (rango: RangoFechas) => void;
  onComparacion: (modo: ModoComparacion) => void;
}

function calcularPreset(id: string): RangoFechas {
  const hoy = fechaLocalIso();
  const ahora = new Date();
  switch (id) {
    case "hoy":
      return { fechaDesde: hoy, fechaHasta: hoy };
    case "ayer": {
      const ayer = sumarDiasIso(hoy, -1);
      return { fechaDesde: ayer, fechaHasta: ayer };
    }
    case "semana":
      return { fechaDesde: inicioDeSemanaIso(), fechaHasta: hoy };
    case "semana_pasada": {
      const inicio = sumarDiasIso(inicioDeSemanaIso(), -7);
      return { fechaDesde: inicio, fechaHasta: sumarDiasIso(inicio, 6) };
    }
    case "mes":
      return { fechaDesde: inicioDeMesIso(), fechaHasta: hoy };
    case "mes_pasado": {
      const inicioMesPasado = fechaLocalIso(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1));
      const finMesPasado = fechaLocalIso(new Date(ahora.getFullYear(), ahora.getMonth(), 0));
      return { fechaDesde: inicioMesPasado, fechaHasta: finMesPasado };
    }
    case "30":
      return { fechaDesde: sumarDiasIso(hoy, -29), fechaHasta: hoy };
    case "90":
      return { fechaDesde: sumarDiasIso(hoy, -89), fechaHasta: hoy };
    case "anio":
      return { fechaDesde: fechaLocalIso(new Date(ahora.getFullYear(), 0, 1)), fechaHasta: hoy };
    default:
      return { fechaDesde: hoy, fechaHasta: hoy };
  }
}

const PRESETS = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "semana", label: "Esta semana" },
  { id: "semana_pasada", label: "Semana pasada" },
  { id: "mes", label: "Este mes" },
  { id: "mes_pasado", label: "Mes pasado" },
  { id: "30", label: "Últimos 30 días" },
  { id: "90", label: "Últimos 90 días" },
  { id: "anio", label: "Este año" },
] as const;

const COMPARACIONES: { value: ModoComparacion; label: string; corta: string }[] = [
  { value: "anterior", label: "vs. periodo anterior", corta: "Periodo anterior" },
  { value: "mes_anterior", label: "vs. mes anterior", corta: "Mes anterior" },
  { value: "anio_anterior", label: "vs. año anterior", corta: "Año anterior" },
  { value: "ninguna", label: "Sin comparación", corta: "Sin comparación" },
];

function nombrePeriodoActivo(rango: RangoFechas): string {
  const preset = PRESETS.find((p) => {
    const calc = calcularPreset(p.id);
    return calc.fechaDesde === rango.fechaDesde && calc.fechaHasta === rango.fechaHasta;
  });
  if (preset) return preset.label;
  if (rango.fechaDesde === rango.fechaHasta) return formatFecha(rango.fechaDesde);
  return `${formatFecha(rango.fechaDesde)} – ${formatFecha(rango.fechaHasta)}`;
}

/**
 * Barra compacta y persistente: el periodo activo y la comparación se leen de un vistazo como
 * texto, y todos los controles (presets, fechas exactas, comparación) viven en un popover — ya no
 * hay una hilera fija de nueve botones ocupando toda la franja superior (INSTRUCCIONES §4.1, §H).
 */
export function FiltrosReportes({ rango, comparacion, onRango, onComparacion }: FiltrosReportesProps) {
  const comparacionActiva = COMPARACIONES.find((c) => c.value === comparacion)!;

  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-beige-300 bg-beige-50/90 px-8 py-2.5 backdrop-blur-sm">
      <Popover
        trigger={({ abierto }) => (
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
              abierto ? "bg-jacaranda-100 text-jacaranda-700" : "text-ink-700 hover:bg-beige-200",
            )}
          >
            {nombrePeriodoActivo(rango)}
            <ChevronDown size={14} className="text-ink-400" />
          </button>
        )}
      >
        {({ cerrar }) => (
          <div className="flex w-72 flex-col gap-3">
            <div className="grid grid-cols-2 gap-1">
              {PRESETS.map((p) => {
                const calc = calcularPreset(p.id);
                const activo = calc.fechaDesde === rango.fechaDesde && calc.fechaHasta === rango.fechaHasta;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onRango(calc);
                      cerrar();
                    }}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                      activo ? "bg-jacaranda-600 text-beige-50" : "bg-beige-100 text-ink-700 hover:bg-beige-200",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-end gap-2 border-t border-beige-200 pt-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-ink-500">Desde</label>
                <Input
                  type="date"
                  className="h-9"
                  value={rango.fechaDesde}
                  onChange={(e) => onRango({ ...rango, fechaDesde: e.target.value })}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-ink-500">Hasta</label>
                <Input
                  type="date"
                  className="h-9"
                  value={rango.fechaHasta}
                  onChange={(e) => onRango({ ...rango, fechaHasta: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </Popover>

      <span className="text-ink-300">·</span>

      <Popover
        align="start"
        trigger={({ abierto }) => (
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
              abierto ? "bg-jacaranda-100 text-jacaranda-700" : "text-ink-500 hover:bg-beige-200",
            )}
          >
            {comparacionActiva.corta}
            <ChevronDown size={14} className="text-ink-400" />
          </button>
        )}
      >
        {({ cerrar }) => (
          <div className="flex w-56 flex-col gap-0.5">
            {COMPARACIONES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  onComparacion(c.value);
                  cerrar();
                }}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                  comparacion === c.value ? "bg-jacaranda-600 text-beige-50" : "text-ink-700 hover:bg-beige-200",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <span className="ml-auto flex items-center gap-1 text-xs text-ink-400">
        <SlidersHorizontal size={12} /> Filtros
      </span>
    </div>
  );
}
