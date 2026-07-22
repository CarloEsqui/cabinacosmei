import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoneda } from "@/lib/format";
import { COLOR_BARRA, EJE_LINEA, EJE_TEXTO, GRID } from "@/components/reportes/paleta";
import type { CarteraAntiguedadFila } from "@shared/types";

interface TooltipProps {
  active?: boolean;
  label?: string;
  payload?: { value: number }[];
}

function TooltipContenido({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-beige-300 bg-beige-50 px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-ink-700">{label}</p>
      <p className="tabular-nums text-ink-700">{formatMoneda(payload[0].value)}</p>
    </div>
  );
}

function ejeMoneda(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
}

export function GraficaCartera({ filas }: { filas: CarteraAntiguedadFila[] }) {
  const total = filas.reduce((acc, f) => acc + f.monto, 0);
  if (total <= 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink-400">
        No hay saldos pendientes de cobro.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="rango" tick={{ fill: EJE_TEXTO, fontSize: 11 }} tickLine={false} axisLine={{ stroke: EJE_LINEA }} />
        <YAxis tickFormatter={ejeMoneda} tick={{ fill: EJE_TEXTO, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
        <Tooltip content={<TooltipContenido />} cursor={{ fill: "#efe4d2", opacity: 0.5 }} />
        <Bar dataKey="monto" fill={COLOR_BARRA} radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
