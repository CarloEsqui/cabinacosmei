import { formatMoneda } from "@/lib/format";
import type { Hallazgo, KPI, TonoHallazgo } from "@shared/types";

function kpi(kpis: KPI[], id: string): KPI | undefined {
  return kpis.find((k) => k.id === id);
}

export interface Observacion {
  texto: string;
  tono: TonoHallazgo;
}

export interface Narrativa {
  titular: string;
  observaciones: Observacion[];
  advertencia: Hallazgo | null;
}

/**
 * Traduce los KPI y hallazgos del periodo a una interpretación ejecutiva de 1 conclusión + hasta
 * 3 observaciones + 1 advertencia crítica como máximo — la página debe iniciar con comprensión,
 * no con una cuadrícula de números (INSTRUCCIONES §2.2.E, §7.1). Cada observación conserva su tono
 * (positivo/atención/informativo) para poder distinguirlas visualmente, no solo con un bullet plano.
 */
export function generarNarrativa(kpis: KPI[], hallazgos: Hallazgo[]): Narrativa {
  const ventas = kpi(kpis, "ventas");
  const margen = kpi(kpis, "margen_bruto");
  const cambioVentas = ventas?.comparacion?.cambioPorcentual ?? null;

  let titular: string;
  if (cambioVentas === null) {
    titular = "Aquí tienes el resumen de tu negocio en este periodo.";
  } else if (cambioVentas >= 5) {
    titular = `Tu negocio mejoró este periodo: las ventas crecieron ${cambioVentas.toFixed(0)}%.`;
  } else if (cambioVentas <= -5) {
    titular = `Tu negocio bajó este periodo: las ventas cayeron ${Math.abs(cambioVentas).toFixed(0)}%.`;
  } else {
    titular = `Tu negocio se mantuvo estable este periodo (ventas ${formatMoneda(ventas?.valor ?? 0)}).`;
  }

  const observaciones: Observacion[] = [];
  const cambioMargen = margen?.comparacion?.cambioPorcentual;
  if (cambioMargen != null && Math.abs(cambioMargen) >= 8) {
    observaciones.push(
      cambioMargen > 0
        ? { texto: `El margen bruto mejoró ${cambioMargen.toFixed(0)}%.`, tono: "positivo" }
        : { texto: `El margen bruto bajó ${Math.abs(cambioMargen).toFixed(0)}%: revisa costos de insumos.`, tono: "atencion" },
    );
  }
  // Hasta dos observaciones adicionales tomadas de los hallazgos no críticos (positivos o de atención).
  for (const h of hallazgos) {
    if (observaciones.length >= 3) break;
    if (h.tono === "critico") continue;
    observaciones.push({ texto: h.titulo, tono: h.tono });
  }

  const advertencia = hallazgos.find((h) => h.tono === "critico") ?? null;

  return { titular, observaciones: observaciones.slice(0, 3), advertencia };
}
