import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { serviciosRealizados, clientes } from "../db/schema";
import { agregadosDelRango, comparar } from "./reportesResumen";
import { fechaLocalIso, rangoComparacion } from "../../shared/fechas";
import type { ResumenFiltro } from "../../shared/schemas";
import type {
  ClienteMetricas,
  KPI,
  ReporteClientesDetalle,
  SegmentoCliente,
  SegmentoConteo,
} from "../../shared/types";

const DIAS_INACTIVA = 90; // sin visitas → inactiva
const DIAS_RIESGO_MIN = 45; // colchón mínimo para considerar "en riesgo"

const ETIQUETA_COMP: Record<ResumenFiltro["comparacion"], string> = {
  ninguna: "",
  anterior: "vs. periodo anterior",
  mes_anterior: "vs. mes anterior",
  anio_anterior: "vs. año anterior",
};

const ETIQUETA_SEG: Record<SegmentoCliente, string> = {
  nueva: "Nuevas",
  activa: "Activas",
  en_riesgo: "En riesgo",
  inactiva: "Inactivas",
};

function fechaMs(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).getTime();
}
function diasEntre(a: string, b: string): number {
  return Math.round((fechaMs(b) - fechaMs(a)) / 86_400_000);
}

export async function reporteClientesDetalle(filtro: ResumenFiltro): Promise<ReporteClientesDetalle> {
  const db = getDb();
  const { fechaDesde: desde, fechaHasta: hasta } = filtro;
  const hoy = fechaLocalIso();
  const comp = rangoComparacion(desde, hasta, filtro.comparacion);
  const etiqueta = ETIQUETA_COMP[filtro.comparacion];

  // Histórico completo de servicios cerrados, con nombre de la clienta.
  const servicios = db
    .select({
      clienteId: serviciosRealizados.clienteId,
      fecha: serviciosRealizados.fecha,
      precio: serviciosRealizados.precio,
      nombre: clientes.nombreCompleto,
    })
    .from(serviciosRealizados)
    .innerJoin(clientes, eq(serviciosRealizados.clienteId, clientes.id))
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        inArray(serviciosRealizados.estatusPago, ["pagado", "parcial", "pendiente"]),
      ),
    )
    .all();

  interface Acum {
    nombre: string;
    fechas: string[];
    valor: number;
  }
  const porCliente = new Map<string, Acum>();
  for (const s of servicios) {
    const a = porCliente.get(s.clienteId) ?? { nombre: s.nombre, fechas: [], valor: 0 };
    a.fechas.push(s.fecha);
    a.valor += s.precio ?? 0;
    porCliente.set(s.clienteId, a);
  }

  const metricas: ClienteMetricas[] = [];
  for (const [id, a] of porCliente) {
    const fechas = [...a.fechas].sort();
    const primera = fechas[0];
    const ultima = fechas[fechas.length - 1];
    const visitas = fechas.length;
    const diasSinVisita = diasEntre(ultima, hoy);
    const intervaloPromedio = visitas >= 2 ? Math.round(diasEntre(primera, ultima) / (visitas - 1)) : null;

    let segmento: SegmentoCliente;
    if (diasSinVisita > DIAS_INACTIVA) segmento = "inactiva";
    else if (primera >= desde && primera <= hasta) segmento = "nueva";
    else if ((intervaloPromedio !== null && diasSinVisita > intervaloPromedio * 1.5) || diasSinVisita > DIAS_RIESGO_MIN)
      segmento = "en_riesgo";
    else segmento = "activa";

    metricas.push({
      clienteId: id,
      nombre: a.nombre,
      ultimaVisita: ultima,
      diasSinVisita,
      visitas,
      valorHistorico: a.valor,
      intervaloPromedio,
      segmento,
    });
  }

  const conteo = new Map<SegmentoCliente, number>([
    ["nueva", 0],
    ["activa", 0],
    ["en_riesgo", 0],
    ["inactiva", 0],
  ]);
  const valorSegmento = new Map<SegmentoCliente, number>([
    ["nueva", 0],
    ["activa", 0],
    ["en_riesgo", 0],
    ["inactiva", 0],
  ]);
  for (const m of metricas) {
    conteo.set(m.segmento, (conteo.get(m.segmento) ?? 0) + 1);
    valorSegmento.set(m.segmento, (valorSegmento.get(m.segmento) ?? 0) + m.valorHistorico);
  }
  const segmentos: SegmentoConteo[] = (["nueva", "activa", "en_riesgo", "inactiva"] as SegmentoCliente[]).map((s) => ({
    segmento: s,
    etiqueta: ETIQUETA_SEG[s],
    cantidad: conteo.get(s) ?? 0,
    valorTotal: valorSegmento.get(s) ?? 0,
  }));

  // Métricas de rango: atendidas / nuevas / recurrentes.
  function contarRango(d: string, h: string) {
    const atendidas = new Set<string>();
    for (const s of servicios) if (s.fecha >= d && s.fecha <= h) atendidas.add(s.clienteId);
    let nuevas = 0;
    for (const id of atendidas) {
      const fechas = [...(porCliente.get(id)?.fechas ?? [])].sort();
      if (fechas[0] >= d) nuevas += 1;
    }
    return { atendidas: atendidas.size, nuevas, recurrentes: atendidas.size - nuevas };
  }

  const rangoAct = contarRango(desde, hasta);
  const rangoPrev = comp ? contarRango(comp.desde, comp.hasta) : null;
  const recompra = rangoAct.atendidas > 0 ? (rangoAct.recurrentes / rangoAct.atendidas) * 100 : 0;
  const recompraPrev =
    rangoPrev && rangoPrev.atendidas > 0 ? (rangoPrev.recurrentes / rangoPrev.atendidas) * 100 : null;

  const act = agregadosDelRango(desde, hasta);
  const prev = comp ? agregadosDelRango(comp.desde, comp.hasta) : null;
  const valorPromedio = rangoAct.atendidas > 0 ? act.ventas / rangoAct.atendidas : 0;
  const valorPromedioPrev =
    rangoPrev && rangoPrev.atendidas > 0 ? (prev?.ventas ?? 0) / rangoPrev.atendidas : null;

  const intervalos = metricas.map((m) => m.intervaloPromedio).filter((x): x is number => x !== null);
  const diasPromedio = intervalos.length > 0 ? Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length) : 0;

  const kpis: KPI[] = [
    {
      id: "atendidas",
      titulo: "Clientas atendidas",
      valor: rangoAct.atendidas,
      formato: "numero",
      comparacion: comparar(rangoAct.atendidas, rangoPrev?.atendidas ?? null, etiqueta),
      formula: "Clientas únicas con al menos un servicio cerrado en el periodo.",
    },
    {
      id: "nuevas",
      titulo: "Nuevas clientas",
      valor: rangoAct.nuevas,
      formato: "numero",
      comparacion: comparar(rangoAct.nuevas, rangoPrev?.nuevas ?? null, etiqueta),
      formula: "Clientas cuyo primer servicio histórico ocurrió dentro del periodo.",
    },
    {
      id: "recompra",
      titulo: "Tasa de recompra",
      valor: recompra,
      formato: "porcentaje",
      comparacion: comparar(recompra, recompraPrev, etiqueta),
      formula: "Clientas recurrentes ÷ clientas atendidas × 100.",
      microexplicacion: "Qué parte de las atendidas ya eran clientas.",
    },
    {
      id: "valor_prom",
      titulo: "Valor promedio por clienta",
      valor: valorPromedio,
      formato: "moneda",
      comparacion: comparar(valorPromedio, valorPromedioPrev, etiqueta),
      formula: "Ventas del periodo ÷ clientas atendidas.",
    },
    {
      id: "dias_visitas",
      titulo: "Días entre visitas",
      valor: diasPromedio,
      formato: "dias",
      formula: "Promedio del intervalo entre visitas de las clientas con 2+ visitas.",
    },
    {
      id: "en_riesgo",
      titulo: "Clientas en riesgo",
      valor: conteo.get("en_riesgo") ?? 0,
      formato: "numero",
      formula: "Clientas que se pasaron de su frecuencia habitual (o de 45 días) sin llegar a inactivas.",
      microexplicacion: "Requieren seguimiento pronto.",
    },
    {
      id: "inactivas",
      titulo: "Clientas inactivas",
      valor: conteo.get("inactiva") ?? 0,
      formato: "numero",
      formula: `Sin servicios en más de ${DIAS_INACTIVA} días.`,
    },
  ];

  const porValor = (a: ClienteMetricas, b: ClienteMetricas) => b.valorHistorico - a.valorHistorico;

  return {
    kpis,
    segmentos,
    enRiesgo: metricas.filter((m) => m.segmento === "en_riesgo").sort(porValor),
    inactivas: metricas.filter((m) => m.segmento === "inactiva").sort(porValor),
  };
}
