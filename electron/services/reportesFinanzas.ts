import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../db";
import { pagos, entradasInventario, lotes, serviciosRealizados, clientes, serviciosCatalogo } from "../db/schema";
import { agregadosDelRango, comparar, serieResumen } from "./reportesResumen";
import { fechaLocalIso, rangoComparacion } from "../../shared/fechas";
import type { ResumenFiltro } from "../../shared/schemas";
import type {
  CarteraAntiguedadFila,
  CarteraClienteFila,
  FilaEstadoResultados,
  KPI,
  MetodoPagoFinanzas,
  ReporteFinanzas,
} from "../../shared/types";

const EPSILON = 0.005;

const ETIQUETA: Record<ResumenFiltro["comparacion"], string> = {
  ninguna: "",
  anterior: "vs. periodo anterior",
  mes_anterior: "vs. mes anterior",
  anio_anterior: "vs. año anterior",
};

/** Compras de inventario = Σ total de las entradas en el rango (salida de efectivo). */
function comprasDelRango(desde: string, hasta: string): number {
  const db = getDb();
  const filas = db
    .select({ total: entradasInventario.total })
    .from(entradasInventario)
    .where(and(gte(entradasInventario.fecha, desde), lte(entradasInventario.fecha, hasta)))
    .all();
  return filas.reduce((acc, f) => acc + (f.total ?? 0), 0);
}

/** Pérdida por caducidad = valor de los lotes que caducaron en el rango conservando existencia. */
function caducidadDelRango(desde: string, hasta: string): number {
  const db = getDb();
  const filas = db
    .select({ disp: lotes.cantidadDisponible, costo: lotes.costoUnitarioLote })
    .from(lotes)
    .where(and(isNotNull(lotes.fechaCaducidad), gte(lotes.fechaCaducidad, desde), lte(lotes.fechaCaducidad, hasta)))
    .all();
  return filas.reduce((acc, l) => acc + (l.disp > 0 ? l.disp * (l.costo ?? 0) : 0), 0);
}

function metodosDePago(desde: string, hasta: string): MetodoPagoFinanzas[] {
  const db = getDb();
  const filas = db
    .select({ metodo: pagos.metodoPago, monto: pagos.monto })
    .from(pagos)
    .where(and(eq(pagos.estatus, "cobrado"), gte(pagos.fecha, desde), lte(pagos.fecha, hasta)))
    .all();
  const mapa = new Map<string, { monto: number; operaciones: number }>();
  for (const p of filas) {
    const e = mapa.get(p.metodo) ?? { monto: 0, operaciones: 0 };
    e.monto += p.monto;
    e.operaciones += 1;
    mapa.set(p.metodo, e);
  }
  return [...mapa.entries()]
    .map(([metodo, e]) => ({ metodo, monto: e.monto, operaciones: e.operaciones }))
    .sort((a, b) => b.monto - a.monto);
}

function fechaMs(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).getTime();
}

/** Cartera pendiente (al día de hoy) agrupada por antigüedad del servicio con saldo. */
function carteraPorAntiguedad(): CarteraAntiguedadFila[] {
  const db = getDb();
  const hoy = fechaLocalIso();

  const serviciosPend = db
    .select({ id: serviciosRealizados.id, precio: serviciosRealizados.precio, fecha: serviciosRealizados.fecha })
    .from(serviciosRealizados)
    .where(
      and(eq(serviciosRealizados.estatus, "cerrado"), inArray(serviciosRealizados.estatusPago, ["parcial", "pendiente"])),
    )
    .all();

  const ids = serviciosPend.map((s) => s.id);
  const pagadoPorServicio = new Map<string, number>();
  if (ids.length > 0) {
    const pgs = db
      .select({ srId: pagos.servicioRealizadoId, monto: pagos.monto })
      .from(pagos)
      .where(and(eq(pagos.estatus, "cobrado"), inArray(pagos.servicioRealizadoId, ids)))
      .all();
    for (const p of pgs) {
      if (p.srId) pagadoPorServicio.set(p.srId, (pagadoPorServicio.get(p.srId) ?? 0) + p.monto);
    }
  }

  const buckets = { b0: 0, b1: 0, b2: 0, b3: 0 };
  for (const s of serviciosPend) {
    const saldo = (s.precio ?? 0) - (pagadoPorServicio.get(s.id) ?? 0);
    if (saldo <= EPSILON) continue;
    const dias = Math.round((fechaMs(hoy) - fechaMs(s.fecha)) / 86_400_000);
    if (dias <= 7) buckets.b0 += saldo;
    else if (dias <= 30) buckets.b1 += saldo;
    else if (dias <= 60) buckets.b2 += saldo;
    else buckets.b3 += saldo;
  }

  return [
    { rango: "0–7 días", monto: buckets.b0 },
    { rango: "8–30 días", monto: buckets.b1 },
    { rango: "31–60 días", monto: buckets.b2 },
    { rango: "+60 días", monto: buckets.b3 },
  ];
}

/**
 * Detalle de cartera por clienta (al día de hoy): quién debe, cuánto, desde cuándo y por qué
 * servicio — el drill-down al que debe llevar la cifra de "cuentas por cobrar"
 * (INSTRUCCIONES §15, ejemplo "clientas, servicios, saldo, antigüedad, último pago").
 */
export function carteraDetallePorCliente(): CarteraClienteFila[] {
  const db = getDb();
  const hoy = fechaLocalIso();

  const serviciosPend = db
    .select({
      id: serviciosRealizados.id,
      clienteId: serviciosRealizados.clienteId,
      clienteNombre: clientes.nombreCompleto,
      servicioNombre: serviciosCatalogo.nombre,
      precio: serviciosRealizados.precio,
      fecha: serviciosRealizados.fecha,
    })
    .from(serviciosRealizados)
    .innerJoin(clientes, eq(serviciosRealizados.clienteId, clientes.id))
    .innerJoin(serviciosCatalogo, eq(serviciosRealizados.servicioCatalogoId, serviciosCatalogo.id))
    .where(
      and(eq(serviciosRealizados.estatus, "cerrado"), inArray(serviciosRealizados.estatusPago, ["parcial", "pendiente"])),
    )
    .all();

  const ids = serviciosPend.map((s) => s.id);
  const pagadoPorServicio = new Map<string, number>();
  if (ids.length > 0) {
    const pgs = db
      .select({ srId: pagos.servicioRealizadoId, monto: pagos.monto })
      .from(pagos)
      .where(and(eq(pagos.estatus, "cobrado"), inArray(pagos.servicioRealizadoId, ids)))
      .all();
    for (const p of pgs) {
      if (p.srId) pagadoPorServicio.set(p.srId, (pagadoPorServicio.get(p.srId) ?? 0) + p.monto);
    }
  }

  interface Acum {
    clienteNombre: string;
    saldo: number;
    ultimoServicioNombre: string | null;
    ultimaFecha: string;
  }
  const porCliente = new Map<string, Acum>();
  for (const s of serviciosPend) {
    const saldo = (s.precio ?? 0) - (pagadoPorServicio.get(s.id) ?? 0);
    if (saldo <= EPSILON) continue;
    const a = porCliente.get(s.clienteId) ?? {
      clienteNombre: s.clienteNombre,
      saldo: 0,
      ultimoServicioNombre: null,
      ultimaFecha: "",
    };
    a.saldo += saldo;
    if (s.fecha > a.ultimaFecha) {
      a.ultimaFecha = s.fecha;
      a.ultimoServicioNombre = s.servicioNombre;
    }
    porCliente.set(s.clienteId, a);
  }

  const filas: CarteraClienteFila[] = [...porCliente.entries()].map(([clienteId, a]) => ({
    clienteId,
    clienteNombre: a.clienteNombre,
    saldo: a.saldo,
    ultimoServicioNombre: a.ultimoServicioNombre,
    ultimaFecha: a.ultimaFecha,
    diasAntiguedad: Math.round((fechaMs(hoy) - fechaMs(a.ultimaFecha)) / 86_400_000),
  }));
  return filas.sort((a, b) => b.saldo - a.saldo);
}

export async function reporteFinanzas(filtro: ResumenFiltro): Promise<ReporteFinanzas> {
  const { fechaDesde: desde, fechaHasta: hasta } = filtro;
  const comp = rangoComparacion(desde, hasta, filtro.comparacion);
  const etiqueta = ETIQUETA[filtro.comparacion];

  const act = agregadosDelRango(desde, hasta);
  const prev = comp ? agregadosDelRango(comp.desde, comp.hasta) : null;

  const compras = comprasDelRango(desde, hasta);
  const comprasPrev = comp ? comprasDelRango(comp.desde, comp.hasta) : null;
  const caducidad = caducidadDelRango(desde, hasta);

  const margenBruto = act.ventas - act.costoInsumos - act.mermaValorizada;
  const margenBrutoPrev = prev ? prev.ventas - prev.costoInsumos - prev.mermaValorizada : null;
  const margenPct = act.ventas > EPSILON ? (margenBruto / act.ventas) * 100 : 0;
  const margenPctPrev = prev && prev.ventas > EPSILON ? (margenBrutoPrev! / prev.ventas) * 100 : null;

  const aging = carteraPorAntiguedad();
  const carteraTotal = aging.reduce((acc, a) => acc + a.monto, 0);

  const kpis: KPI[] = [
    {
      id: "ventas",
      titulo: "Ventas realizadas",
      valor: act.ventas,
      formato: "moneda",
      comparacion: comparar(act.ventas, prev?.ventas ?? null, etiqueta),
      formula: "Suma del precio de los servicios cerrados (no cancelados) en el periodo.",
    },
    {
      id: "cobranza",
      titulo: "Cobranza recibida",
      valor: act.cobranza,
      formato: "moneda",
      comparacion: comparar(act.cobranza, prev?.cobranza ?? null, etiqueta),
      formula: "Suma de los pagos cobrados en el periodo.",
    },
    {
      id: "margen_bruto",
      titulo: "Margen bruto estimado",
      valor: margenBruto,
      formato: "moneda",
      comparacion: comparar(margenBruto, margenBrutoPrev, etiqueta),
      formula: "Ventas − costo de insumos − merma/devoluciones.",
      microexplicacion: "No incluye renta, nómina ni otros gastos.",
    },
    {
      id: "margen_pct",
      titulo: "Margen bruto %",
      valor: margenPct,
      formato: "porcentaje",
      comparacion: comparar(margenPct, margenPctPrev, etiqueta),
      formula: "Margen bruto ÷ ventas × 100.",
    },
    {
      id: "cartera",
      titulo: "Cuentas por cobrar",
      valor: carteraTotal,
      formato: "moneda",
      formula: "Saldo pendiente (servicios cerrados − pagos) al día de hoy.",
      microexplicacion: "Total actual, independiente del periodo.",
    },
    {
      id: "compras",
      titulo: "Compras de inventario",
      valor: compras,
      formato: "moneda",
      comparacion: comparar(compras, comprasPrev, etiqueta),
      formula: "Suma del total de las entradas de inventario en el periodo (salida de efectivo).",
    },
    {
      id: "mermas",
      titulo: "Pérdida por merma",
      valor: act.mermaValorizada,
      formato: "moneda",
      comparacion: comparar(act.mermaValorizada, prev?.mermaValorizada ?? null, etiqueta),
      formula: "Valor de las salidas por merma y devolución en el periodo.",
    },
    {
      id: "caducidad",
      titulo: "Pérdida por caducidad",
      valor: caducidad,
      formato: "moneda",
      formula: "Valor de los lotes que caducaron en el periodo conservando existencia.",
    },
  ];

  const estadoResultados: FilaEstadoResultados[] = [
    { concepto: "Ventas realizadas", valor: act.ventas },
    { concepto: "− Costo de insumos consumidos", valor: -act.costoInsumos },
    { concepto: "− Merma y devoluciones", valor: -act.mermaValorizada },
    { concepto: "= Margen bruto estimado", valor: margenBruto, enfasis: true },
  ];

  const flujoCaja: FilaEstadoResultados[] = [
    { concepto: "Cobranza recibida", valor: act.cobranza },
    { concepto: "− Compras de inventario", valor: -compras },
    { concepto: "= Flujo de caja parcial", valor: act.cobranza - compras, enfasis: true },
  ];

  return {
    kpis,
    estadoResultados,
    flujoCaja,
    metodosPago: metodosDePago(desde, hasta),
    carteraAntiguedad: aging,
    serie: serieResumen(desde, hasta),
  };
}
