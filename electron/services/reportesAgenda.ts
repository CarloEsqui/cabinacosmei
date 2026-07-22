import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import { citas, serviciosCatalogo } from "../db/schema";
import { obtenerConfig } from "./config";
import { fechaLocalIso } from "../../shared/fechas";
import type { ResumenFiltro } from "../../shared/schemas";
import type { CeldaDemanda, KPI, ReporteAgenda } from "../../shared/types";

/** "HH:MM" → minutos desde medianoche. Devuelve null si está vacío o mal formado. */
function horaAMinutos(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fechaDesdeIso(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

/** Minutos productivos de UN día laboral (cierre − apertura − descanso). 0 si el horario es inválido. */
function minutosLaborablesPorDia(
  apertura: number | null,
  cierre: number | null,
  descansoIni: number | null,
  descansoFin: number | null,
): number {
  if (apertura === null || cierre === null || cierre <= apertura) return 0;
  let minutos = cierre - apertura;
  if (
    descansoIni !== null &&
    descansoFin !== null &&
    descansoFin > descansoIni &&
    descansoIni >= apertura &&
    descansoFin <= cierre
  ) {
    minutos -= descansoFin - descansoIni;
  }
  return Math.max(0, minutos);
}

/**
 * Minutos de capacidad disponibles en [desde, hasta] según el horario de atención:
 * por cada día del rango cuyo día de la semana es laboral, se suman los minutos productivos,
 * multiplicados por la capacidad simultánea. Devuelve 0 si el horario no permite calcularlo.
 */
function minutosDisponibles(
  desde: string,
  hasta: string,
  diasLaborales: number[],
  minutosPorDia: number,
  capacidad: number,
): number {
  if (minutosPorDia <= 0 || diasLaborales.length === 0) return 0;
  const setDias = new Set(diasLaborales);
  const fin = fechaDesdeIso(hasta);
  let total = 0;
  for (let cur = fechaDesdeIso(desde); cur <= fin; cur.setDate(cur.getDate() + 1)) {
    if (setDias.has(cur.getDay())) total += minutosPorDia;
  }
  return total * Math.max(1, capacidad);
}

export async function reporteAgenda(filtro: ResumenFiltro): Promise<ReporteAgenda> {
  const { fechaDesde: desde, fechaHasta: hasta } = filtro;
  const db = getDb();
  const config = await obtenerConfig();

  const filas = db
    .select({
      fecha: citas.fecha,
      hora: citas.hora,
      duracionMin: citas.duracionMin,
      estado: citas.estado,
      createdAt: citas.createdAt,
    })
    .from(citas)
    .where(and(gte(citas.fecha, desde), lte(citas.fecha, hasta)))
    .all();

  const hoy = fechaLocalIso();

  // --- Conteos por estado ---
  let asistio = 0;
  let noAsistio = 0;
  let canceladas = 0;
  let reagendadas = 0;
  let pendientesPasadas = 0; // programada/confirmada cuya fecha ya pasó (no se marcó asistencia)
  let sumaDuracionOcupan = 0;
  let citasOcupanConteo = 0;

  // Anticipación: días entre que se creó la cita y la fecha de la cita.
  let sumaAnticipacion = 0;
  let conteoAnticipacion = 0;

  // Ocupación: minutos reservados por citas que ocupan, dentro de la ventana ya transcurrida.
  const finVentanaOcup = hasta <= hoy ? hasta : hoy; // no contar días futuros vacíos
  let minutosReservados = 0;

  // Heatmap de demanda: cuenta de citas que ocupan por (día de la semana, hora).
  const demandaMapa = new Map<string, CeldaDemanda>();

  for (const c of filas) {
    if (c.estado === "cancelada") {
      canceladas += 1;
      continue;
    }
    if (c.estado === "reagendada") {
      reagendadas += 1;
      continue;
    }
    // A partir de aquí: la cita ocupa (programada | confirmada | asistio | no_asistio).
    const dur = c.duracionMin ?? 60;
    sumaDuracionOcupan += dur;
    citasOcupanConteo += 1;

    if (c.estado === "asistio") asistio += 1;
    else if (c.estado === "no_asistio") noAsistio += 1;
    else if (c.fecha < hoy) pendientesPasadas += 1; // programada/confirmada que ya debió ocurrir

    // Ocupación (solo ventana ya transcurrida).
    if (c.fecha <= finVentanaOcup) minutosReservados += dur;

    // Anticipación (createdAt es Date). Fecha/hora de la cita vs. creación.
    const minCita = horaAMinutos(c.hora) ?? 0;
    const fechaCita = fechaDesdeIso(c.fecha);
    fechaCita.setMinutes(minCita);
    const dias = (fechaCita.getTime() - c.createdAt.getTime()) / 86_400_000;
    if (dias >= 0) {
      sumaAnticipacion += dias;
      conteoAnticipacion += 1;
    }

    // Heatmap.
    const dia = fechaDesdeIso(c.fecha).getDay();
    const horaBucket = Math.floor(minCita / 60);
    const clave = `${dia}-${horaBucket}`;
    const celda = demandaMapa.get(clave);
    if (celda) celda.citas += 1;
    else demandaMapa.set(clave, { dia, hora: horaBucket, citas: 1 });
  }

  // Denominador de asistencia = citas que ya debieron ocurrir (asistió + no asistió + pendientes pasadas).
  const debieronOcurrir = asistio + noAsistio + pendientesPasadas;
  const asistenciaPct = debieronOcurrir > 0 ? (asistio / debieronOcurrir) * 100 : null;
  const noShowPct = debieronOcurrir > 0 ? (noAsistio / debieronOcurrir) * 100 : null;
  const duracionMedia = citasOcupanConteo > 0 ? sumaDuracionOcupan / citasOcupanConteo : null;
  const anticipacionMedia = conteoAnticipacion > 0 ? sumaAnticipacion / conteoAnticipacion : null;

  // Ocupación.
  const apertura = horaAMinutos(config.horarioApertura);
  const cierre = horaAMinutos(config.horarioCierre);
  const minPorDia = minutosLaborablesPorDia(
    apertura,
    cierre,
    horaAMinutos(config.descansoInicio),
    horaAMinutos(config.descansoFin),
  );
  const disponibles = minutosDisponibles(
    desde,
    finVentanaOcup,
    config.diasLaborales,
    minPorDia,
    config.capacidadSimultanea,
  );
  const ocupacionDisponible = disponibles > 0;
  const ocupacionPct = ocupacionDisponible ? (minutosReservados / disponibles) * 100 : null;

  const totalCitas = filas.length;

  // Impacto del no-show: precio sugerido del servicio de las citas no asistidas (estimación, ya
  // que nunca se cerró el servicio real). INSTRUCCIONES §12.3.
  const noAsistidas = db
    .select({ precioSugerido: serviciosCatalogo.precioSugerido })
    .from(citas)
    .innerJoin(serviciosCatalogo, eq(citas.servicioCatalogoId, serviciosCatalogo.id))
    .where(and(gte(citas.fecha, desde), lte(citas.fecha, hasta), eq(citas.estado, "no_asistio")))
    .all();
  const ingresoPerdidoNoShow = noAsistidas.reduce((acc, c) => acc + (c.precioSugerido ?? 0), 0);

  const kpis: KPI[] = [
    {
      id: "citas_agendadas",
      titulo: "Citas agendadas",
      valor: totalCitas,
      formato: "numero",
      formula: "Total de citas con fecha dentro del periodo, en cualquier estado.",
      microexplicacion: "Todo lo que entró a la agenda.",
    },
    {
      id: "asistencia",
      titulo: "Asistencia",
      valor: asistenciaPct,
      formato: "porcentaje",
      formula:
        "Citas marcadas como “asistió” ÷ citas que ya debieron ocurrir (asistió + no asistió + no marcadas ya vencidas) × 100.",
      microexplicacion: "De las citas que ya pasaron, cuántas llegaron.",
      advertencias:
        pendientesPasadas > 0
          ? [`${pendientesPasadas} cita(s) pasadas sin marcar asistencia: cuentan como no cumplidas.`]
          : undefined,
    },
    {
      id: "no_show",
      titulo: "No-show",
      valor: noShowPct,
      formato: "porcentaje",
      formula: "Citas marcadas como “no asistió” ÷ citas que ya debieron ocurrir × 100.",
      microexplicacion: "Cuántas te dejaron plantada.",
    },
    {
      id: "cancelaciones",
      titulo: "Cancelaciones",
      valor: canceladas,
      formato: "numero",
      formula: "Citas con estado “cancelada” cuya fecha cae en el periodo.",
      microexplicacion: "Canceladas antes de ocurrir.",
    },
    {
      id: "reagendadas",
      titulo: "Reagendadas",
      valor: reagendadas,
      formato: "numero",
      formula: "Citas con estado “reagendada” cuya fecha cae en el periodo.",
      microexplicacion: "Movidas a otra fecha.",
    },
    {
      id: "ocupacion",
      titulo: "Ocupación",
      valor: ocupacionPct,
      formato: "porcentaje",
      formula:
        "Minutos reservados por citas (que ocupan) ÷ minutos disponibles según tu horario de atención × capacidad simultánea, en los días ya transcurridos del periodo × 100.",
      microexplicacion: "Qué tan llena estuvo tu agenda.",
      advertencias: ocupacionDisponible
        ? undefined
        : ["Configura tu horario de atención (Configuración → General) para calcular la ocupación."],
    },
    {
      id: "duracion_media",
      titulo: "Duración media",
      valor: duracionMedia,
      formato: "numero",
      formula: "Promedio de la duración (min) de las citas que ocupan agenda.",
      microexplicacion: "Minutos promedio por cita.",
    },
    {
      id: "anticipacion",
      titulo: "Anticipación media",
      valor: anticipacionMedia,
      formato: "dias",
      formula: "Promedio de días entre que se creó la cita y la fecha de la cita.",
      microexplicacion: "Con cuántos días de anticipación reservan.",
    },
    {
      id: "ingreso_perdido_no_show",
      titulo: "Ingreso potencial perdido por no-show",
      valor: ingresoPerdidoNoShow,
      formato: "moneda",
      formula: "Suma del precio sugerido del servicio de las citas marcadas como “no asistió”.",
      microexplicacion: "Estimación: no hubo un servicio real que cobrar.",
      advertencias: ingresoPerdidoNoShow > 0 ? ["Estimado con el precio sugerido del servicio, no el precio real cobrado."] : undefined,
    },
  ];

  const horaMin = apertura !== null ? Math.floor(apertura / 60) : 8;
  const horaMax = cierre !== null ? Math.ceil(cierre / 60) : 20;
  const diasLaborales = config.diasLaborales.length > 0 ? [...config.diasLaborales].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6];

  return {
    kpis,
    demanda: [...demandaMapa.values()],
    horaMin,
    horaMax,
    diasLaborales,
    ocupacionDisponible,
  };
}
