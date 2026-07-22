import { formatMoneda } from "@/lib/format";

interface FilaBarra {
  etiqueta: string;
  valor: number;
}

/** Barra horizontal compacta para rankings cortos (sin tabla completa) — INSTRUCCIONES §7.5, §14. */
function BarraHorizontal({ filas, formatoValor }: { filas: FilaBarra[]; formatoValor: (n: number) => string }) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <div className="flex flex-col gap-2">
      {filas.map((f) => (
        <div key={f.etiqueta} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-ink-600" title={f.etiqueta}>
            {f.etiqueta}
          </span>
          <div className="h-2 flex-1 rounded-full bg-beige-200">
            <div
              className="h-2 rounded-full bg-jacaranda-500"
              style={{ width: `${Math.max(4, (f.valor / max) * 100)}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-ink-900">
            {formatoValor(f.valor)}
          </span>
        </div>
      ))}
      {filas.length === 0 && <p className="text-xs text-ink-400">Sin datos suficientes en el periodo.</p>}
    </div>
  );
}

export function TopServiciosPorMargen({ filas }: { filas: FilaBarra[] }) {
  return <BarraHorizontal filas={filas} formatoValor={formatMoneda} />;
}

export function NuevasVsRecurrentes({ nuevas, recurrentes }: { nuevas: number; recurrentes: number }) {
  return (
    <BarraHorizontal
      filas={[
        { etiqueta: "Nuevas", valor: nuevas },
        { etiqueta: "Recurrentes", valor: recurrentes },
      ]}
      formatoValor={(n) => `${n}`}
    />
  );
}
