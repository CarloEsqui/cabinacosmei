import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartHeader } from "@/components/reportes/ChartHeader";
import { formatMoneda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PuntoSerieResumen } from "@shared/types";

type Metrica = "ventas" | "margen";
const NOMBRE_METRICA: Record<Metrica, string> = { ventas: "Ventas", margen: "Margen bruto" };
const COLOR_ACTUAL = "#6b3fa0";
const COLOR_COMPARADO = "#c9ade9";

function ejeMoneda(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
}

interface TooltipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
}

function TooltipContenido({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-beige-300 bg-beige-50 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink-700">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-ink-700">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium tabular-nums">{formatMoneda(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

interface Props {
  serie: PuntoSerieResumen[];
  serieComparacion?: PuntoSerieResumen[];
  comparacionEtiqueta: string;
}

/**
 * Gráfica de tendencia principal del Resumen: UNA sola métrica a la vez (selector Ventas/Margen,
 * nunca tres series simultáneas) con el periodo comparado sobrepuesto por índice de bucket, más
 * promedio/mejor/peor y una conclusión textual visible (INSTRUCCIONES §7.4, §14).
 */
export function GraficaTendencia({ serie, serieComparacion, comparacionEtiqueta }: Props) {
  const [metrica, setMetrica] = useState<Metrica>("ventas");

  const datos = useMemo(
    () =>
      serie.map((p, i) => ({
        periodo: p.periodo,
        actual: p[metrica],
        comparado: serieComparacion?.[i]?.[metrica],
      })),
    [serie, serieComparacion, metrica],
  );

  const hayDatos = serie.some((p) => p.ventas || p.cobranza || p.margen);
  const hayComparacion = !!serieComparacion && serieComparacion.length === serie.length;

  const stats = useMemo(() => {
    if (serie.length === 0) return null;
    const valores = serie.map((p) => p[metrica]);
    const total = valores.reduce((a, b) => a + b, 0);
    const promedio = total / valores.length;
    let mejor = serie[0];
    let peor = serie[0];
    for (const p of serie) {
      if (p[metrica] > mejor[metrica]) mejor = p;
      if (p[metrica] < peor[metrica]) peor = p;
    }
    return { promedio, mejor, peor };
  }, [serie, metrica]);

  const conclusion =
    hayDatos && stats
      ? `Promedio: ${formatMoneda(stats.promedio)} por periodo · mejor: ${stats.mejor.periodo} (${formatMoneda(stats.mejor[metrica])})`
      : undefined;

  return (
    <div>
      <ChartHeader
        titulo={`${NOMBRE_METRICA[metrica]} en el tiempo`}
        conclusion={conclusion}
        acciones={
          <div className="flex gap-1 rounded-lg bg-beige-200 p-0.5">
            {(["ventas", "margen"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetrica(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  metrica === m ? "bg-beige-50 text-jacaranda-700 shadow-sm" : "text-ink-500 hover:text-ink-900",
                )}
              >
                {NOMBRE_METRICA[m]}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-2 flex flex-wrap gap-4">
        <span className="flex items-center gap-1.5 text-xs text-ink-600">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_ACTUAL }} />
          {NOMBRE_METRICA[metrica]}
        </span>
        {hayComparacion && (
          <span className="flex items-center gap-1.5 text-xs text-ink-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_COMPARADO }} />
            {comparacionEtiqueta}
          </span>
        )}
      </div>

      {hayDatos ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={datos} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#efe4d2" vertical={false} />
            <XAxis
              dataKey="periodo"
              tick={{ fill: "#9a8f81", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#e2d3b8" }}
              minTickGap={20}
            />
            <YAxis
              tickFormatter={ejeMoneda}
              tick={{ fill: "#9a8f81", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip content={<TooltipContenido />} cursor={{ stroke: "#c9ade9", strokeWidth: 1 }} />
            {hayComparacion && (
              <Line
                type="monotone"
                dataKey="comparado"
                name={comparacionEtiqueta}
                stroke={COLOR_COMPARADO}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="actual"
              name={NOMBRE_METRICA[metrica]}
              stroke={COLOR_ACTUAL}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-52 items-center justify-center text-sm text-ink-400">
          Aún no hay datos para graficar en este periodo.
        </div>
      )}
    </div>
  );
}
