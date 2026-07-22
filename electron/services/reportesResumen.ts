import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  serviciosRealizados,
  serviciosProductosConsumidos,
  lotes,
  salidasInventario,
  pagos,
  clientes,
} from "../db/schema";
import { calcularSaldosPorCliente } from "./clientes";
import {
  diasEnRango,
  fechaLocalIso,
  inicioDeSemanaIso,
  rangoComparacion,
  type ModoComparacion,
} from "../../shared/fechas";
import type { ResumenFiltro } from "../../shared/schemas";
import type { ComparacionKPI, KPI, PuntoSerieResumen, ResumenReporte } from "../../shared/types";

const EPSILON = 0.005;

const ETIQUETA_COMPARACION: Record<ModoComparacion, string> = {
  ninguna: "",
  anterior: "vs. periodo anterior",
  mes_anterior: "vs. mes anterior",
  anio_anterior: "vs. año anterior",
};

export interface Agregados {
  ventas: number;
  servicios: number;
  clientesUnicos: number;
  costoInsumos: number;
  mermaValorizada: number;
  cobranza: number;
  /** Servicios cerrados en el rango que NO tienen ningún insumo registrado (afecta el margen). */
  serviciosSinCosto: number;
}

/** Agregados crudos de un rango [desde, hasta] (inclusivo). */
export function agregadosDelRango(desde: string, hasta: string): Agregados {
  const db = getDb();

  // Ventas = servicios CERRADOS y no cancelados en el rango. No depende de si ya se cobraron.
  const servicios = db
    .select({ id: serviciosRealizados.id, clienteId: serviciosRealizados.clienteId, precio: serviciosRealizados.precio })
    .from(serviciosRealizados)
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        inArray(serviciosRealizados.estatusPago, ["pagado", "parcial", "pendiente"]),
        gte(serviciosRealizados.fecha, desde),
        lte(serviciosRealizados.fecha, hasta),
      ),
    )
    .all();

  const ventas = servicios.reduce((acc, s) => acc + (s.precio ?? 0), 0);
  const clientesUnicos = new Set(servicios.map((s) => s.clienteId)).size;
  const serviciosIds = servicios.map((s) => s.id);

  // Costo real de insumos consumidos por esos servicios = Σ cantidad × costo del lote.
  let costoInsumos = 0;
  const serviciosConCosto = new Set<string>();
  if (serviciosIds.length > 0) {
    const consumos = db
      .select({
        srId: serviciosProductosConsumidos.servicioRealizadoId,
        cantidad: serviciosProductosConsumidos.cantidad,
        costo: lotes.costoUnitarioLote,
      })
      .from(serviciosProductosConsumidos)
      .innerJoin(lotes, eq(serviciosProductosConsumidos.loteId, lotes.id))
      .where(inArray(serviciosProductosConsumidos.servicioRealizadoId, serviciosIds))
      .all();
    for (const c of consumos) {
      costoInsumos += c.cantidad * (c.costo ?? 0);
      serviciosConCosto.add(c.srId);
    }
  }
  const serviciosSinCosto = serviciosIds.filter((id) => !serviciosConCosto.has(id)).length;

  // Pérdidas valorizadas: salidas de tipo merma / devolución en el rango.
  const mermas = db
    .select({ valor: salidasInventario.valor })
    .from(salidasInventario)
    .where(
      and(
        inArray(salidasInventario.tipoSalida, ["merma", "devolucion"]),
        gte(salidasInventario.fecha, desde),
        lte(salidasInventario.fecha, hasta),
      ),
    )
    .all();
  const mermaValorizada = mermas.reduce((acc, m) => acc + (m.valor ?? 0), 0);

  // Cobranza efectivamente recibida en el rango.
  const cobros = db
    .select({ monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.estatus, "cobrado"), gte(pagos.fecha, desde), lte(pagos.fecha, hasta)))
    .all();
  const cobranza = cobros.reduce((acc, p) => acc + p.monto, 0);

  return {
    ventas,
    servicios: servicios.length,
    clientesUnicos,
    costoInsumos,
    mermaValorizada,
    cobranza,
    serviciosSinCosto,
  };
}

function derivados(a: Agregados) {
  const margenBruto = a.ventas - a.costoInsumos - a.mermaValorizada;
  const margenPct = a.ventas > EPSILON ? (margenBruto / a.ventas) * 100 : 0;
  const ticket = a.servicios > 0 ? a.ventas / a.servicios : 0;
  return { margenBruto, margenPct, ticket };
}

export function comparar(actual: number, anterior: number | null, etiqueta: string): ComparacionKPI | undefined {
  if (anterior === null) return undefined;
  const cambioAbsoluto = actual - anterior;
  // Sin base comparable cuando el periodo anterior fue 0 (evita "+∞%" o "+100%" engañosos).
  const cambioPorcentual = Math.abs(anterior) > EPSILON ? (cambioAbsoluto / anterior) * 100 : null;
  return { valorAnterior: anterior, cambioAbsoluto, cambioPorcentual, etiqueta };
}

// ---------------------------------------------------------------------------
// Serie temporal para la gráfica (ventas / cobranza / margen por bucket)
// ---------------------------------------------------------------------------

type Granularidad = "dia" | "semana" | "mes";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fechaDesdeIso(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function granularidadDe(desde: string, hasta: string): Granularidad {
  const dias = diasEnRango(desde, hasta);
  if (dias <= 31) return "dia";
  if (dias <= 120) return "semana";
  return "mes";
}

function claveBucket(fechaIso: string, gran: Granularidad): string {
  if (gran === "dia") return fechaIso;
  if (gran === "mes") return `${fechaIso.slice(0, 7)}-01`;
  return inicioDeSemanaIso(fechaDesdeIso(fechaIso));
}

/** Secuencia ordenada y continua de buckets que cubren el rango (para una línea sin huecos). */
function bucketsDelRango(desde: string, hasta: string, gran: Granularidad): string[] {
  const claves: string[] = [];
  const fin = fechaDesdeIso(hasta);
  let cur: Date;
  if (gran === "mes") {
    cur = fechaDesdeIso(desde);
    cur.setDate(1);
    while (cur <= fin) {
      claves.push(fechaLocalIso(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
  } else if (gran === "semana") {
    cur = fechaDesdeIso(inicioDeSemanaIso(fechaDesdeIso(desde)));
    while (cur <= fin) {
      claves.push(fechaLocalIso(cur));
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    cur = fechaDesdeIso(desde);
    while (cur <= fin) {
      claves.push(fechaLocalIso(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return claves;
}

function etiquetaBucket(claveIso: string, gran: Granularidad): string {
  const [y, m, d] = claveIso.split("-");
  if (gran === "mes") return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
  return `${d} ${MESES[Number(m) - 1]}`;
}

export function serieResumen(desde: string, hasta: string): PuntoSerieResumen[] {
  const db = getDb();
  const gran = granularidadDe(desde, hasta);
  const claves = bucketsDelRango(desde, hasta, gran);

  const acum = new Map<string, { ventas: number; cobranza: number; costo: number; merma: number }>();
  for (const k of claves) acum.set(k, { ventas: 0, cobranza: 0, costo: 0, merma: 0 });

  const servicios = db
    .select({ id: serviciosRealizados.id, fecha: serviciosRealizados.fecha, precio: serviciosRealizados.precio })
    .from(serviciosRealizados)
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        inArray(serviciosRealizados.estatusPago, ["pagado", "parcial", "pendiente"]),
        gte(serviciosRealizados.fecha, desde),
        lte(serviciosRealizados.fecha, hasta),
      ),
    )
    .all();

  const bucketPorServicio = new Map<string, string>();
  for (const s of servicios) {
    const k = claveBucket(s.fecha, gran);
    const b = acum.get(k);
    if (!b) continue;
    b.ventas += s.precio ?? 0;
    bucketPorServicio.set(s.id, k);
  }

  const serviciosIds = servicios.map((s) => s.id);
  if (serviciosIds.length > 0) {
    const consumos = db
      .select({
        srId: serviciosProductosConsumidos.servicioRealizadoId,
        cantidad: serviciosProductosConsumidos.cantidad,
        costo: lotes.costoUnitarioLote,
      })
      .from(serviciosProductosConsumidos)
      .innerJoin(lotes, eq(serviciosProductosConsumidos.loteId, lotes.id))
      .where(inArray(serviciosProductosConsumidos.servicioRealizadoId, serviciosIds))
      .all();
    for (const c of consumos) {
      const k = bucketPorServicio.get(c.srId);
      const b = k ? acum.get(k) : undefined;
      if (b) b.costo += c.cantidad * (c.costo ?? 0);
    }
  }

  const cobros = db
    .select({ fecha: pagos.fecha, monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.estatus, "cobrado"), gte(pagos.fecha, desde), lte(pagos.fecha, hasta)))
    .all();
  for (const p of cobros) {
    const b = acum.get(claveBucket(p.fecha, gran));
    if (b) b.cobranza += p.monto;
  }

  const mermas = db
    .select({ fecha: salidasInventario.fecha, valor: salidasInventario.valor })
    .from(salidasInventario)
    .where(
      and(
        inArray(salidasInventario.tipoSalida, ["merma", "devolucion"]),
        gte(salidasInventario.fecha, desde),
        lte(salidasInventario.fecha, hasta),
      ),
    )
    .all();
  for (const m of mermas) {
    const b = acum.get(claveBucket(m.fecha, gran));
    if (b) b.merma += m.valor ?? 0;
  }

  return claves.map((k) => {
    const b = acum.get(k)!;
    return { periodo: etiquetaBucket(k, gran), ventas: b.ventas, cobranza: b.cobranza, margen: b.ventas - b.costo - b.merma };
  });
}

/** Total pendiente de cobro (al día de hoy), sumando los saldos positivos de todas las clientas. */
async function carteraTotal(): Promise<number> {
  const db = getDb();
  const ids = db.select({ id: clientes.id }).from(clientes).all().map((c) => c.id);
  const saldos = await calcularSaldosPorCliente(ids);
  let total = 0;
  for (const saldo of saldos.values()) if (saldo > EPSILON) total += saldo;
  return total;
}

export async function reporteResumen(filtro: ResumenFiltro): Promise<ResumenReporte> {
  const { fechaDesde: desde, fechaHasta: hasta } = filtro;
  const comp = rangoComparacion(desde, hasta, filtro.comparacion);
  const etiqueta = ETIQUETA_COMPARACION[filtro.comparacion];

  const act = agregadosDelRango(desde, hasta);
  const prev = comp ? agregadosDelRango(comp.desde, comp.hasta) : null;
  const dAct = derivados(act);
  const dPrev = prev ? derivados(prev) : null;
  const cartera = await carteraTotal();

  const kpis: KPI[] = [
    {
      id: "ventas",
      titulo: "Ventas realizadas",
      valor: act.ventas,
      formato: "moneda",
      comparacion: comparar(act.ventas, prev?.ventas ?? null, etiqueta),
      formula: "Suma del precio de los servicios cerrados (no cancelados) en el periodo, se hayan cobrado o no.",
      microexplicacion: "Lo que facturaste este periodo.",
    },
    {
      id: "cobranza",
      titulo: "Cobranza recibida",
      valor: act.cobranza,
      formato: "moneda",
      comparacion: comparar(act.cobranza, prev?.cobranza ?? null, etiqueta),
      formula: "Suma de los pagos con estatus cobrado en el periodo.",
      microexplicacion: "Dinero que realmente entró.",
    },
    {
      id: "margen_bruto",
      titulo: "Margen bruto estimado",
      valor: dAct.margenBruto,
      formato: "moneda",
      comparacion: comparar(dAct.margenBruto, dPrev?.margenBruto ?? null, etiqueta),
      formula: "Ventas realizadas − costo de insumos consumidos − mermas/devoluciones del periodo.",
      microexplicacion: "No incluye renta, nómina ni otros gastos.",
      advertencias:
        act.serviciosSinCosto > 0
          ? [`${act.serviciosSinCosto} servicio(s) sin insumos registrados: el margen puede estar sobreestimado.`]
          : undefined,
    },
    {
      id: "margen_pct",
      titulo: "Margen bruto %",
      valor: dAct.margenPct,
      formato: "porcentaje",
      comparacion: comparar(dAct.margenPct, dPrev?.margenPct ?? null, etiqueta),
      formula: "Margen bruto estimado ÷ ventas realizadas × 100.",
      microexplicacion: "Qué porcentaje de cada venta queda como margen.",
    },
    {
      id: "clientes",
      titulo: "Clientas atendidas",
      valor: act.clientesUnicos,
      formato: "numero",
      comparacion: comparar(act.clientesUnicos, prev?.clientesUnicos ?? null, etiqueta),
      formula: "Clientas únicas con al menos un servicio cerrado en el periodo.",
      microexplicacion: "Personas distintas, no número de servicios.",
    },
    {
      id: "ticket",
      titulo: "Ticket promedio",
      valor: dAct.ticket,
      formato: "moneda",
      comparacion: comparar(dAct.ticket, dPrev?.ticket ?? null, etiqueta),
      formula: "Ventas realizadas ÷ número de servicios realizados.",
      microexplicacion: "Promedio facturado por servicio.",
    },
    {
      id: "cartera",
      titulo: "Cuentas por cobrar",
      valor: cartera,
      formato: "moneda",
      formula: "Suma de los saldos pendientes (servicios cerrados − pagos) de todas las clientas, al día de hoy.",
      microexplicacion: "Dinero pendiente de cobrar (total actual).",
    },
  ];

  const advertencias: string[] = [];
  if (act.serviciosSinCosto > 0) {
    advertencias.push(`${act.serviciosSinCosto} servicio(s) sin costo de insumos configurado.`);
  }
  if (act.servicios === 0) {
    advertencias.push("No hay servicios cerrados en el periodo seleccionado.");
  }

  return {
    periodo: {
      desde,
      hasta,
      comparacionDesde: comp?.desde,
      comparacionHasta: comp?.hasta,
      comparacionEtiqueta: etiqueta,
    },
    calidadDatos: {
      registrosAnalizados: act.servicios,
      registrosExcluidos: 0,
      advertencias,
    },
    kpis,
    serie: serieResumen(desde, hasta),
    serieComparacion: comp ? serieResumen(comp.desde, comp.hasta) : undefined,
  };
}
