import type { ReactNode } from "react";

interface ChartHeaderProps {
  titulo: string;
  /** Conclusión de una línea que la gráfica debe dejar clara sin que el usuario tenga que interpretarla. */
  conclusion?: string;
  acciones?: ReactNode;
}

/**
 * Encabezado estándar para toda gráfica de Reportes: título + una conclusión visible (nunca sólo
 * ejes sin interpretar) + un espacio opcional para selector/acciones (INSTRUCCIONES §14, ejemplo
 * "Ventas por día / El viernes concentra 31% de la facturación.").
 */
export function ChartHeader({ titulo, conclusion, acciones }: ChartHeaderProps) {
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div>
        {/* Mismo color que CardTitle (text-jacaranda-700): todo título de bloque en Reportes usa
            la misma tinta, esté dentro de un Card o de un ChartHeader. */}
        <h3 className="text-sm font-semibold text-jacaranda-700">{titulo}</h3>
        {conclusion && <p className="mt-0.5 text-xs text-ink-500">{conclusion}</p>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </div>
  );
}
