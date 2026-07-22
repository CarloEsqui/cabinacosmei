import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ResponsiveContainer,
} from "recharts";
import { formatMoneda } from "@/lib/format";
import { COLOR_BARRA, EJE_LINEA, EJE_TEXTO, GRID } from "@/components/reportes/paleta";
import type { ServicioMetricas } from "@shared/types";

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: ServicioMetricas }[];
}

function TooltipContenido({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="rounded-lg border border-beige-300 bg-beige-50 px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 font-medium text-ink-700">{s.servicioNombre}</p>
      <p className="tabular-nums text-ink-600">
        {s.cantidad} servicios · margen {s.margenPct.toFixed(0)}%
      </p>
      <p className="tabular-nums text-ink-600">ingresos {formatMoneda(s.ingresos)}</p>
    </div>
  );
}

export function GraficaMatrizServicios({ filas }: { filas: ServicioMetricas[] }) {
  if (filas.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-ink-400">
        Se necesitan al menos dos servicios con cierres para comparar volumen y margen.
      </div>
    );
  }

  const medX = mediana(filas.map((f) => f.cantidad));
  const medY = mediana(filas.map((f) => f.margenPct));

  return (
    <div>
      <p className="mb-2 text-xs text-ink-400">
        Cada punto es un servicio · eje X: cantidad · eje Y: margen % · tamaño: ingresos.
      </p>
      <div className="relative">
        {/* Nombres de cuadrante: la gráfica debe leerse sin interpretación adicional
            (INSTRUCCIONES §10.2, §14). Aproximados a las cuatro esquinas del área de trazado. */}
        <span className="pointer-events-none absolute right-10 top-1 text-[11px] font-medium text-jacaranda-500/70">
          Estrellas
        </span>
        <span className="pointer-events-none absolute left-1 top-1 text-[11px] font-medium text-ink-400">
          Potencial
        </span>
        <span className="pointer-events-none absolute bottom-6 right-10 text-[11px] font-medium text-warning-500/80">
          Revisar rentabilidad
        </span>
        <span className="pointer-events-none absolute bottom-6 left-1 text-[11px] font-medium text-ink-300">
          Bajo impacto
        </span>
        <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis
            type="number"
            dataKey="cantidad"
            name="Cantidad"
            tick={{ fill: EJE_TEXTO, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: EJE_LINEA }}
          />
          <YAxis
            type="number"
            dataKey="margenPct"
            name="Margen %"
            unit="%"
            tick={{ fill: EJE_TEXTO, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <ZAxis type="number" dataKey="ingresos" range={[60, 400]} name="Ingresos" />
          <ReferenceLine x={medX} stroke={EJE_LINEA} strokeDasharray="4 4" />
          <ReferenceLine y={medY} stroke={EJE_LINEA} strokeDasharray="4 4" />
          <Tooltip content={<TooltipContenido />} cursor={{ strokeDasharray: "3 3", stroke: "#c9ade9" }} />
          <Scatter data={filas} fill={COLOR_BARRA} fillOpacity={0.7} isAnimationActive={false} />
        </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
