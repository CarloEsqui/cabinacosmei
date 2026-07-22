import { CheckCircle2, AlertCircle } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import type { CalidadDatos } from "@shared/types";

/**
 * Indicador global de calidad de dato para toda la pestaña: reemplaza las advertencias largas
 * repetidas dentro de cada tarjeta KPI por un único punto de entrada ("Completo" / "Requiere
 * atención") que, al abrirse, detalla el problema concreto y cuántos registros afecta
 * (INSTRUCCIONES §16).
 */
export function CalidadDatosIndicador({ calidad }: { calidad: CalidadDatos }) {
  const limpio = calidad.advertencias.length === 0;

  return (
    <Popover
      align="end"
      trigger={({ abierto }) => (
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            limpio
              ? "bg-success-500/10 text-success-500"
              : abierto
                ? "bg-warning-500/20 text-warning-500"
                : "bg-warning-500/10 text-warning-500"
          }`}
        >
          {limpio ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {limpio ? "Datos completos" : "Requiere atención"}
        </button>
      )}
      panelClassName="w-72"
    >
      {() => (
        <div className="flex flex-col gap-2 text-xs">
          <p className="font-semibold text-ink-900">Calidad de datos</p>
          <p className="text-ink-500">{calidad.registrosAnalizados} registro(s) analizados en el periodo.</p>
          {limpio ? (
            <p className="text-ink-600">No encontramos nada que afecte la confiabilidad de estas cifras.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {calidad.advertencias.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5 text-ink-600">
                  <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-warning-500" />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}
