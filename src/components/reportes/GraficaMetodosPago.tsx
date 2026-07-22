import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoneda } from "@/lib/format";
import { PALETA_CATEGORICA } from "@/components/reportes/paleta";
import type { MetodoPagoFinanzas } from "@shared/types";

interface TooltipProps {
  active?: boolean;
  payload?: { payload: MetodoPagoFinanzas & { pct: number } }[];
}

function TooltipContenido({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-beige-300 bg-beige-50 px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-ink-700">{d.metodo}</p>
      <p className="tabular-nums text-ink-700">
        {formatMoneda(d.monto)} · {d.pct.toFixed(0)}% · {d.operaciones} op.
      </p>
    </div>
  );
}

export function GraficaMetodosPago({ metodos }: { metodos: MetodoPagoFinanzas[] }) {
  const total = metodos.reduce((acc, m) => acc + m.monto, 0);

  if (total <= 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink-400">
        Sin cobros en este periodo.
      </div>
    );
  }

  const datos = metodos.map((m) => ({ ...m, pct: (m.monto / total) * 100 }));

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <ResponsiveContainer width="100%" height={200} className="max-w-[220px]">
        <PieChart>
          <Pie
            data={datos}
            dataKey="monto"
            nameKey="metodo"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            strokeWidth={0}
            isAnimationActive={false}
          >
            {datos.map((_, i) => (
              <Cell key={i} fill={PALETA_CATEGORICA[i % PALETA_CATEGORICA.length]} />
            ))}
          </Pie>
          <Tooltip content={<TooltipContenido />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex w-full flex-col gap-1.5">
        {datos.map((m, i) => (
          <div key={m.metodo} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-ink-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PALETA_CATEGORICA[i % PALETA_CATEGORICA.length] }} />
              {m.metodo}
            </span>
            <span className="tabular-nums text-ink-700">
              {formatMoneda(m.monto)} <span className="text-xs text-ink-400">· {m.pct.toFixed(0)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
