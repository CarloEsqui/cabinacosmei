import { formatMoneda } from "@/lib/format";
import type { SalidaTipoValor } from "@shared/types";

const ETIQUETA_TIPO: Record<string, string> = {
  venta: "Venta",
  consumo_servicio: "Consumo",
  merma: "Merma",
  devolucion: "Devolución",
  uso_interno: "Uso interno",
  ajuste: "Ajuste",
};

function nombreTipo(tipo: string): string {
  return ETIQUETA_TIPO[tipo] ?? tipo.replace(/_/g, " ");
}

/**
 * Barras horizontales compactas con monto y porcentaje — reemplaza el bar chart vertical anterior,
 * que ocupaba demasiado espacio para una lista de 4-6 categorías (INSTRUCCIONES §13.5).
 */
export function GraficaSalidasTipo({ salidas }: { salidas: SalidaTipoValor[] }) {
  const total = salidas.reduce((acc, s) => acc + s.valor, 0);
  if (total === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-ink-400">
        No hay salidas de inventario en el periodo.
      </div>
    );
  }

  const max = Math.max(...salidas.map((s) => s.valor));

  return (
    <div className="flex flex-col gap-2">
      {salidas.map((s) => (
        <div key={s.tipo} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-ink-600">{nombreTipo(s.tipo)}</span>
          <div className="h-2 flex-1 rounded-full bg-beige-200">
            <div
              className="h-2 rounded-full bg-jacaranda-500"
              style={{ width: `${Math.max(4, (s.valor / max) * 100)}%` }}
            />
          </div>
          <span className="w-32 shrink-0 text-right text-xs tabular-nums text-ink-900">
            <span className="font-medium">{formatMoneda(s.valor)}</span>{" "}
            <span className="text-ink-400">({((s.valor / total) * 100).toFixed(0)}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}
