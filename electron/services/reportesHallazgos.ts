import { reporteResumen } from "./reportesResumen";
import { reporteAgenda } from "./reportesAgenda";
import { reporteClientesDetalle } from "./reportesClientesDetalle";
import { reporteInventarioDetalle } from "./reportesInventarioDetalle";
import { obtenerEstados } from "./hallazgosEstado";
import type { ResumenFiltro } from "../../shared/schemas";
import type { Hallazgo, KPI, TonoHallazgo } from "../../shared/types";

const pesosFmt = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function pesos(n: number): string {
  return `$${pesosFmt.format(n)}`;
}
function pct(n: number): string {
  return `${Math.abs(n).toFixed(1)}%`;
}

function valor(kpis: KPI[], id: string): number | null {
  return kpis.find((k) => k.id === id)?.valor ?? null;
}
function comparacion(kpis: KPI[], id: string) {
  return kpis.find((k) => k.id === id)?.comparacion;
}

const PRIORIDAD: Record<TonoHallazgo, number> = { critico: 0, atencion: 1, positivo: 2, informativo: 3 };

// Umbrales (ajustables): qué tan grande debe ser un cambio o nivel para "valer la pena" un hallazgo.
const CAMBIO_RELEVANTE = 12; // % de variación para reportar subida/bajada de ventas
const NO_SHOW_ALTO = 15; // % de no-show que enciende alerta
const OCUPACION_BAJA = 40; // % de ocupación por debajo del cual sobra hueco
const OCUPACION_ALTA = 85; // % de ocupación por encima del cual conviene ampliar

/**
 * Capa de inteligencia: corre los reportes del periodo y traduce las cifras a frases accionables.
 * No recalcula métricas — reutiliza exactamente lo que el usuario ve en cada pestaña, para que
 * nunca haya contradicción entre un hallazgo y su reporte de origen.
 */
export async function reporteHallazgos(filtro: ResumenFiltro): Promise<Hallazgo[]> {
  const [resumen, agenda, clientes, inventario] = await Promise.all([
    reporteResumen(filtro),
    reporteAgenda(filtro),
    reporteClientesDetalle(filtro),
    reporteInventarioDetalle(filtro),
  ]);

  const hallazgos: Hallazgo[] = [];
  const add = (h: Omit<Hallazgo, "estado">) => hallazgos.push({ ...h, estado: "nuevo" });

  // --- Ventas / Finanzas ---
  const ventas = valor(resumen.kpis, "ventas") ?? 0;
  const cVentas = comparacion(resumen.kpis, "ventas");
  if (cVentas?.cambioPorcentual != null && Math.abs(cVentas.cambioPorcentual) >= CAMBIO_RELEVANTE) {
    const sube = cVentas.cambioPorcentual > 0;
    add({
      id: "ventas_cambio",
      tono: sube ? "positivo" : "atencion",
      categoria: "Ventas",
      titulo: sube ? `Tus ventas subieron ${pct(cVentas.cambioPorcentual)}` : `Tus ventas bajaron ${pct(cVentas.cambioPorcentual)}`,
      detalle: `Facturaste ${pesos(ventas)} en el periodo, ${sube ? "arriba" : "abajo"} del periodo anterior (${pesos(cVentas.valorAnterior ?? 0)}).`,
    });
  }

  const margenPct = valor(resumen.kpis, "margen_pct");
  const cMargen = comparacion(resumen.kpis, "margen_pct");
  if (margenPct != null && cMargen?.cambioAbsoluto != null && cMargen.cambioAbsoluto <= -5) {
    add({
      id: "margen_baja",
      tono: "atencion",
      categoria: "Ventas",
      titulo: `Tu margen cayó a ${pct(margenPct)}`,
      detalle: `Bajó ${pct(cMargen.cambioAbsoluto)} respecto al periodo anterior. Revisa precios o el costo de insumos.`,
    });
  }

  const cartera = valor(resumen.kpis, "cartera") ?? 0;
  if (cartera > 0 && ventas > 0 && cartera / ventas >= 0.25) {
    add({
      id: "cartera_alta",
      tono: "atencion",
      categoria: "Ventas",
      titulo: `Tienes ${pesos(cartera)} por cobrar`,
      detalle: `Equivale a ${pct((cartera / ventas) * 100)} de lo que facturaste. Da seguimiento a las clientas con saldo.`,
    });
  }

  // --- Agenda ---
  const noShow = valor(agenda.kpis, "no_show");
  const citas = valor(agenda.kpis, "citas_agendadas") ?? 0;
  if (noShow != null && noShow >= NO_SHOW_ALTO) {
    add({
      id: "no_show_alto",
      tono: noShow >= 25 ? "critico" : "atencion",
      categoria: "Agenda",
      titulo: `No-show en ${pct(noShow)}`,
      detalle: "Muchas clientas no llegaron a su cita. Considera recordatorios o confirmación previa.",
    });
  }
  const ocupacion = valor(agenda.kpis, "ocupacion");
  if (agenda.ocupacionDisponible && ocupacion != null && citas > 0) {
    if (ocupacion < OCUPACION_BAJA) {
      add({
        id: "ocupacion_baja",
        tono: "informativo",
        categoria: "Agenda",
        titulo: `Tu agenda estuvo al ${pct(ocupacion)}`,
        detalle: "Hay bastante hueco libre. Buen momento para una promoción o para llenar tus horas valle.",
      });
    } else if (ocupacion >= OCUPACION_ALTA) {
      add({
        id: "ocupacion_alta",
        tono: "atencion",
        categoria: "Agenda",
        titulo: `Tu agenda estuvo al ${pct(ocupacion)}`,
        detalle: "Estás casi al tope. Considera ampliar horario o capacidad para no rechazar clientas.",
      });
    }
  }

  // --- Clientas ---
  const enRiesgo = clientes.enRiesgo;
  if (enRiesgo.length > 0) {
    const valorRiesgo = enRiesgo.reduce((acc, c) => acc + c.valorHistorico, 0);
    add({
      id: "clientas_riesgo",
      tono: enRiesgo.length >= 5 ? "atencion" : "informativo",
      categoria: "Clientas",
      titulo: `${enRiesgo.length} clienta${enRiesgo.length === 1 ? "" : "s"} en riesgo`,
      detalle: `Se pasaron de su frecuencia habitual (${pesos(valorRiesgo)} de valor histórico). Un mensaje a tiempo las reactiva.`,
    });
  }
  const nuevas = clientes.segmentos.find((s) => s.segmento === "nueva")?.cantidad ?? 0;
  if (nuevas > 0) {
    add({
      id: "clientas_nuevas",
      tono: "positivo",
      categoria: "Clientas",
      titulo: `${nuevas} clienta${nuevas === 1 ? "" : "s"} nueva${nuevas === 1 ? "" : "s"}`,
      detalle: "Llegaron por primera vez en el periodo. Asegúrate de agendarles su mantenimiento.",
    });
  }

  // --- Inventario ---
  const caducado = valor(inventario.kpis, "caducado") ?? 0;
  if (caducado > 0) {
    add({
      id: "inv_caducado",
      tono: "critico",
      categoria: "Inventario",
      titulo: `${pesos(caducado)} caducado sin usar`,
      detalle: "Hay producto vencido con existencia. Regístralo como merma para que tu inventario no quede inflado.",
    });
  }
  const porCaducar = valor(inventario.kpis, "por_caducar") ?? 0;
  if (porCaducar > 0) {
    const prox = inventario.porCaducar.filter((l) => !l.vencido).length;
    add({
      id: "inv_por_caducar",
      tono: "atencion",
      categoria: "Inventario",
      titulo: `${pesos(porCaducar)} por caducar`,
      detalle: `${prox} lote(s) próximos a vencer. Úsalos primero o considera una promoción para moverlos.`,
    });
  }
  const stockBajo = valor(inventario.kpis, "criticos") ?? 0;
  const advStock = inventario.kpis.find((k) => k.id === "criticos")?.advertencias?.length;
  if (stockBajo > 0 && advStock) {
    add({
      id: "inv_stock",
      tono: "atencion",
      categoria: "Inventario",
      titulo: "Productos en nivel crítico",
      detalle: "Tienes insumos por agotarse. Revisa la pestaña de Inventario para reponer antes de quedarte sin.",
    });
  }

  // Aplica el estado persistido (revisado/en_seguimiento/resuelto/descartado) por tipo+rango.
  const estadosGuardados = obtenerEstados(filtro.fechaDesde, filtro.fechaHasta);
  for (const h of hallazgos) {
    const guardado = estadosGuardados.get(h.id);
    if (guardado) h.estado = guardado;
  }

  hallazgos.sort((a, b) => PRIORIDAD[a.tono] - PRIORIDAD[b.tono]);
  return hallazgos;
}
