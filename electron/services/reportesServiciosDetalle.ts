import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import { serviciosRealizados, serviciosCatalogo, serviciosProductosConsumidos, lotes } from "../db/schema";
import { agregadosDelRango, comparar } from "./reportesResumen";
import { rangoComparacion } from "../../shared/fechas";
import type { ResumenFiltro } from "../../shared/schemas";
import type { KPI, ReporteServiciosDetalle, ServicioMetricas } from "../../shared/types";

const EPSILON = 0.005;

const ETIQUETA: Record<ResumenFiltro["comparacion"], string> = {
  ninguna: "",
  anterior: "vs. periodo anterior",
  mes_anterior: "vs. mes anterior",
  anio_anterior: "vs. año anterior",
};

export async function reporteServiciosDetalle(filtro: ResumenFiltro): Promise<ReporteServiciosDetalle> {
  const db = getDb();
  const { fechaDesde: desde, fechaHasta: hasta } = filtro;
  const comp = rangoComparacion(desde, hasta, filtro.comparacion);
  const etiqueta = ETIQUETA[filtro.comparacion];

  const servicios = db
    .select({
      id: serviciosRealizados.id,
      catalogoId: serviciosRealizados.servicioCatalogoId,
      precio: serviciosRealizados.precio,
      nombre: serviciosCatalogo.nombre,
      duracion: serviciosCatalogo.duracionEstimadaMin,
    })
    .from(serviciosRealizados)
    .leftJoin(serviciosCatalogo, eq(serviciosRealizados.servicioCatalogoId, serviciosCatalogo.id))
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        inArray(serviciosRealizados.estatusPago, ["pagado", "parcial", "pendiente"]),
        gte(serviciosRealizados.fecha, desde),
        lte(serviciosRealizados.fecha, hasta),
      ),
    )
    .all();

  const ids = servicios.map((s) => s.id);
  const costoPorServicio = new Map<string, number>();
  const conCosto = new Set<string>();
  if (ids.length > 0) {
    const consumos = db
      .select({
        srId: serviciosProductosConsumidos.servicioRealizadoId,
        cantidad: serviciosProductosConsumidos.cantidad,
        costo: lotes.costoUnitarioLote,
      })
      .from(serviciosProductosConsumidos)
      .innerJoin(lotes, eq(serviciosProductosConsumidos.loteId, lotes.id))
      .where(inArray(serviciosProductosConsumidos.servicioRealizadoId, ids))
      .all();
    for (const c of consumos) {
      costoPorServicio.set(c.srId, (costoPorServicio.get(c.srId) ?? 0) + c.cantidad * (c.costo ?? 0));
      conCosto.add(c.srId);
    }
  }

  interface Grupo {
    nombre: string;
    cantidad: number;
    ingresos: number;
    costo: number;
    duracionMin: number;
    sinCosto: boolean;
  }
  const grupos = new Map<string, Grupo>();
  for (const s of servicios) {
    const key = s.catalogoId ?? "sin_catalogo";
    const g = grupos.get(key) ?? {
      nombre: s.nombre ?? "Sin servicio",
      cantidad: 0,
      ingresos: 0,
      costo: 0,
      duracionMin: 0,
      sinCosto: false,
    };
    g.cantidad += 1;
    g.ingresos += s.precio ?? 0;
    g.costo += costoPorServicio.get(s.id) ?? 0;
    g.duracionMin += s.duracion ?? 0;
    if (!conCosto.has(s.id)) g.sinCosto = true;
    grupos.set(key, g);
  }

  const filas: ServicioMetricas[] = [...grupos.values()]
    .map((g) => {
      const margenBruto = g.ingresos - g.costo;
      const margenPct = g.ingresos > EPSILON ? (margenBruto / g.ingresos) * 100 : 0;
      const duracionHoras = g.duracionMin > 0 ? g.duracionMin / 60 : null;
      const ingresoPorHora = duracionHoras && duracionHoras > 0 ? g.ingresos / duracionHoras : null;
      return {
        servicioNombre: g.nombre,
        cantidad: g.cantidad,
        ingresos: g.ingresos,
        costoInsumos: g.costo,
        margenBruto,
        margenPct,
        duracionHoras,
        ingresoPorHora,
        sinCosto: g.sinCosto,
      };
    })
    .sort((a, b) => b.ingresos - a.ingresos);

  // KPIs (con comparación) reutilizando los agregados globales del periodo.
  const act = agregadosDelRango(desde, hasta);
  const prev = comp ? agregadosDelRango(comp.desde, comp.hasta) : null;
  const margenServ = act.ventas - act.costoInsumos;
  const margenServPrev = prev ? prev.ventas - prev.costoInsumos : null;
  const ticket = act.servicios > 0 ? act.ventas / act.servicios : 0;
  const ticketPrev = prev && prev.servicios > 0 ? prev.ventas / prev.servicios : null;
  const duracionTotalMin = servicios.reduce((acc, s) => acc + (s.duracion ?? 0), 0);
  const duracionMedia = act.servicios > 0 ? duracionTotalMin / act.servicios : 0;

  const kpis: KPI[] = [
    {
      id: "servicios",
      titulo: "Servicios realizados",
      valor: act.servicios,
      formato: "numero",
      comparacion: comparar(act.servicios, prev?.servicios ?? null, etiqueta),
      formula: "Servicios cerrados (no cancelados) en el periodo.",
    },
    {
      id: "ingreso",
      titulo: "Ingreso generado",
      valor: act.ventas,
      formato: "moneda",
      comparacion: comparar(act.ventas, prev?.ventas ?? null, etiqueta),
      formula: "Suma del precio de los servicios cerrados.",
    },
    {
      id: "margen",
      titulo: "Margen de servicios",
      valor: margenServ,
      formato: "moneda",
      comparacion: comparar(margenServ, margenServPrev, etiqueta),
      formula: "Ingreso − costo de insumos consumidos (sin merma).",
      microexplicacion: "Margen de la ejecución del servicio.",
    },
    {
      id: "ticket",
      titulo: "Ticket medio",
      valor: ticket,
      formato: "moneda",
      comparacion: comparar(ticket, ticketPrev, etiqueta),
      formula: "Ingreso ÷ número de servicios.",
    },
    {
      id: "duracion",
      titulo: "Duración media",
      valor: duracionMedia,
      formato: "numero",
      formula: "Promedio de la duración estándar de los servicios realizados.",
      microexplicacion: "Minutos por servicio.",
    },
  ];

  const serviciosSinCosto = ids.filter((id) => !conCosto.has(id)).length;
  return { kpis, filas, serviciosSinCosto };
}
