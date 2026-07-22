import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { entradasInventario, lotes, productos, salidasInventario } from "../db/schema";
import { obtenerConfig } from "./config";
import { comparar } from "./reportesResumen";
import { diasEnRango, fechaLocalIso, rangoComparacion, type ModoComparacion } from "../../shared/fechas";
import type { ResumenFiltro } from "../../shared/schemas";
import type {
  ConsumoProducto,
  KPI,
  LotePorCaducar,
  ProductoCritico,
  ReporteInventarioDetalle,
  SalidaTipoValor,
} from "../../shared/types";

// Rango de referencia para "días de cobertura" — no configurable aún, así que se documenta aquí
// como constante única (INSTRUCCIONES §13.3: nunca mostrar el número solo, siempre con estado).
const COBERTURA_OBJETIVO_MIN = 45;
const COBERTURA_OBJETIVO_MAX = 90;

function estadoCobertura(dias: number | null): string {
  if (dias === null) return `Objetivo configurado: ${COBERTURA_OBJETIVO_MIN}–${COBERTURA_OBJETIVO_MAX} días.`;
  if (dias > COBERTURA_OBJETIVO_MAX) return `Sobrestock — objetivo: ${COBERTURA_OBJETIVO_MIN}–${COBERTURA_OBJETIVO_MAX} días.`;
  if (dias < COBERTURA_OBJETIVO_MIN) return `Riesgo de quiebre — objetivo: ${COBERTURA_OBJETIVO_MIN}–${COBERTURA_OBJETIVO_MAX} días.`;
  return `Dentro del objetivo (${COBERTURA_OBJETIVO_MIN}–${COBERTURA_OBJETIVO_MAX} días).`;
}

const ETIQUETA_COMPARACION: Record<ModoComparacion, string> = {
  ninguna: "",
  anterior: "vs. periodo anterior",
  mes_anterior: "vs. mes anterior",
  anio_anterior: "vs. año anterior",
};

/** Suma valorizada de las salidas de ciertos tipos en un rango. */
function valorSalidas(desde: string, hasta: string, tipos: string[]): number {
  const db = getDb();
  const filas = db
    .select({ valor: salidasInventario.valor })
    .from(salidasInventario)
    .where(
      and(
        inArray(salidasInventario.tipoSalida, tipos),
        gte(salidasInventario.fecha, desde),
        lte(salidasInventario.fecha, hasta),
      ),
    )
    .all();
  return filas.reduce((acc, f) => acc + (f.valor ?? 0), 0);
}

/** Total de compras (entradas) en un rango. */
function totalCompras(desde: string, hasta: string): number {
  const db = getDb();
  const filas = db
    .select({ total: entradasInventario.total })
    .from(entradasInventario)
    .where(and(gte(entradasInventario.fecha, desde), lte(entradasInventario.fecha, hasta)))
    .all();
  return filas.reduce((acc, f) => acc + (f.total ?? 0), 0);
}

function diasEntre(desdeIso: string, hastaIso: string): number {
  const [a1, m1, d1] = desdeIso.split("-").map(Number);
  const [a2, m2, d2] = hastaIso.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export async function reporteInventarioDetalle(filtro: ResumenFiltro): Promise<ReporteInventarioDetalle> {
  const { fechaDesde: desde, fechaHasta: hasta } = filtro;
  const db = getDb();
  const config = await obtenerConfig();
  const hoy = fechaLocalIso();
  const comp = rangoComparacion(desde, hasta, filtro.comparacion);
  const etiqueta = ETIQUETA_COMPARACION[filtro.comparacion];

  // --- Valor del inventario actual (snapshot): Σ existencias × costo del lote ---
  const lotesConExistencia = db
    .select({
      productoNombre: productos.nombre,
      numeroLote: lotes.numeroLote,
      fechaCaducidad: lotes.fechaCaducidad,
      cantidad: lotes.cantidadDisponible,
      costo: lotes.costoUnitarioLote,
    })
    .from(lotes)
    .innerJoin(productos, eq(lotes.productoId, productos.id))
    .where(sql`${lotes.cantidadDisponible} > 0`)
    .all();

  const valorInventario = lotesConExistencia.reduce((acc, l) => acc + l.cantidad * (l.costo ?? 0), 0);

  // --- Métricas del periodo (con comparación) ---
  const compras = totalCompras(desde, hasta);
  const comprasPrev = comp ? totalCompras(comp.desde, comp.hasta) : null;
  const consumo = valorSalidas(desde, hasta, ["consumo_servicio"]);
  const consumoPrev = comp ? valorSalidas(comp.desde, comp.hasta, ["consumo_servicio"]) : null;
  const mermas = valorSalidas(desde, hasta, ["merma", "devolucion"]);
  const mermasPrev = comp ? valorSalidas(comp.desde, comp.hasta, ["merma", "devolucion"]) : null;

  // --- Caducidad ---
  const ventanaAlerta = config.diasAlertaCaducidad;
  const porCaducar: LotePorCaducar[] = [];
  let valorPorCaducar = 0;
  let valorCaducado = 0;
  for (const l of lotesConExistencia) {
    if (!l.fechaCaducidad) continue;
    const dias = diasEntre(hoy, l.fechaCaducidad); // negativo si ya venció
    const valor = l.cantidad * (l.costo ?? 0);
    const vencido = dias < 0;
    if (vencido) {
      valorCaducado += valor;
    } else if (dias <= ventanaAlerta) {
      valorPorCaducar += valor;
    } else {
      continue; // caduca lejos: no entra a la tabla de alerta
    }
    porCaducar.push({
      productoNombre: l.productoNombre,
      numeroLote: l.numeroLote,
      fechaCaducidad: l.fechaCaducidad,
      diasRestantes: dias,
      cantidad: l.cantidad,
      valor,
      vencido,
    });
  }
  porCaducar.sort((a, b) => a.diasRestantes - b.diasRestantes);

  // --- Salidas por tipo (valorizadas) ---
  const salidasAgrupadas = db
    .select({
      tipo: salidasInventario.tipoSalida,
      valor: sql<number>`COALESCE(SUM(${salidasInventario.valor}), 0)`,
      unidades: sql<number>`COALESCE(SUM(${salidasInventario.cantidad}), 0)`,
    })
    .from(salidasInventario)
    .where(and(gte(salidasInventario.fecha, desde), lte(salidasInventario.fecha, hasta)))
    .groupBy(salidasInventario.tipoSalida)
    .all();
  const salidasPorTipo: SalidaTipoValor[] = salidasAgrupadas
    .map((s) => ({ tipo: s.tipo, valor: Number(s.valor), unidades: Number(s.unidades) }))
    .sort((a, b) => b.valor - a.valor);

  // --- Top productos por costo consumido en servicios ---
  const consumoAgrupado = db
    .select({
      productoNombre: productos.nombre,
      unidades: sql<number>`COALESCE(SUM(${salidasInventario.cantidad}), 0)`,
      costo: sql<number>`COALESCE(SUM(${salidasInventario.valor}), 0)`,
    })
    .from(salidasInventario)
    .innerJoin(productos, eq(salidasInventario.productoId, productos.id))
    .where(
      and(
        eq(salidasInventario.tipoSalida, "consumo_servicio"),
        gte(salidasInventario.fecha, desde),
        lte(salidasInventario.fecha, hasta),
      ),
    )
    .groupBy(productos.id)
    .all();
  const topConsumo: ConsumoProducto[] = consumoAgrupado
    .map((c) => ({ productoNombre: c.productoNombre, unidades: Number(c.unidades), costo: Number(c.costo) }))
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 10);

  // --- Días de cobertura: a este ritmo de consumo, cuánto dura el stock actual ---
  const dias = Math.max(1, diasEnRango(desde, hasta));
  const consumoDiario = consumo / dias;
  const diasCobertura = consumoDiario > 0 ? valorInventario / consumoDiario : null;

  // --- Stock crítico / bajo (snapshot) ---
  const stockPorProducto = db
    .select({
      productoId: productos.id,
      productoNombre: productos.nombre,
      stock: sql<number>`COALESCE(SUM(CASE WHEN ${lotes.estado} = 'activo' THEN ${lotes.cantidadDisponible} ELSE 0 END), 0)`,
      minimo: productos.stockMinimoManual,
    })
    .from(productos)
    .leftJoin(lotes, eq(lotes.productoId, productos.id))
    .where(eq(productos.activo, true))
    .groupBy(productos.id)
    .all();
  let bajos = 0;
  const criticosDetalle: ProductoCritico[] = [];
  for (const p of stockPorProducto) {
    const stock = Number(p.stock);
    const minimo = p.minimo ?? config.umbralStockCritico;
    if (stock <= minimo) criticosDetalle.push({ productoNombre: p.productoNombre, stock, minimo });
    else if (stock <= config.umbralStockBajo) bajos += 1;
  }
  const criticos = criticosDetalle.length;

  // --- Productos sin movimiento: con existencia, pero sin ninguna entrada ni salida en el periodo
  // (capital inmovilizado que ni siquiera se está tocando) ---
  const productosConMovimiento = new Set<string>();
  for (const s of db
    .select({ productoId: salidasInventario.productoId })
    .from(salidasInventario)
    .where(and(gte(salidasInventario.fecha, desde), lte(salidasInventario.fecha, hasta)))
    .all())
    productosConMovimiento.add(s.productoId);
  for (const e of db
    .select({ productoId: entradasInventario.productoId })
    .from(entradasInventario)
    .where(and(gte(entradasInventario.fecha, desde), lte(entradasInventario.fecha, hasta)))
    .all())
    productosConMovimiento.add(e.productoId);
  const sinMovimiento = stockPorProducto.filter(
    (p) => Number(p.stock) > 0 && !productosConMovimiento.has(p.productoId),
  ).length;

  const kpis: KPI[] = [
    {
      id: "valor_inventario",
      titulo: "Valor del inventario",
      valor: valorInventario,
      formato: "moneda",
      formula: "Suma de (existencias × costo del lote) de todos los lotes con producto disponible, al día de hoy.",
      microexplicacion: "Capital parado en stock hoy.",
    },
    {
      id: "inventario_riesgo",
      titulo: "Inventario en riesgo",
      valor: valorPorCaducar + valorCaducado,
      formato: "moneda",
      formula: `Valor de los lotes ya caducados más los que caducan en los próximos ${ventanaAlerta} días.`,
      microexplicacion: "Dinero que puedes perder si no actúas.",
      advertencias: valorCaducado > 0 ? ["Incluye producto ya vencido con existencia."] : undefined,
    },
    {
      id: "consumo_servicios",
      titulo: "Consumo en servicios",
      valor: consumo,
      formato: "moneda",
      comparacion: comparar(consumo, consumoPrev, etiqueta),
      formula: "Suma valorizada (a costo) de las salidas por consumo en servicios en el periodo.",
      microexplicacion: "Costo de insumos usados en clientas.",
    },
    {
      id: "compras",
      titulo: "Compras del periodo",
      valor: compras,
      formato: "moneda",
      comparacion: comparar(compras, comprasPrev, etiqueta),
      formula: "Suma del total de las entradas de inventario con fecha en el periodo.",
      microexplicacion: "Dinero invertido en reponer stock.",
    },
    {
      id: "mermas",
      titulo: "Mermas y devoluciones",
      valor: mermas,
      formato: "moneda",
      comparacion: comparar(mermas, mermasPrev, etiqueta),
      formula: "Suma valorizada de las salidas por merma o devolución en el periodo.",
      microexplicacion: "Producto perdido (a costo).",
    },
    {
      id: "por_caducar",
      titulo: "Por caducar",
      valor: valorPorCaducar,
      formato: "moneda",
      formula: `Valor (a costo) de los lotes con existencia que caducan en los próximos ${ventanaAlerta} días.`,
      microexplicacion: `Úsalo antes de ${ventanaAlerta} días o se pierde.`,
    },
    {
      id: "caducado",
      titulo: "Caducado sin usar",
      valor: valorCaducado,
      formato: "moneda",
      formula: "Valor (a costo) de los lotes que ya caducaron pero siguen con existencia registrada.",
      microexplicacion: "Ya vencido: da de baja o retira.",
      advertencias:
        valorCaducado > 0 ? ["Hay producto caducado con existencia: regístralo como merma para no inflar tu inventario."] : undefined,
    },
    {
      id: "cobertura",
      titulo: "Días de cobertura",
      valor: diasCobertura,
      formato: "dias",
      formula: "Valor del inventario ÷ consumo diario promedio del periodo. Estima cuántos días dura el stock actual.",
      microexplicacion: estadoCobertura(diasCobertura),
    },
    {
      id: "criticos",
      titulo: "Productos críticos",
      valor: criticos,
      formato: "numero",
      formula: "Productos activos cuyo stock ya llegó a su nivel crítico (mínimo configurado).",
      microexplicacion: bajos > 0 ? `Además, ${bajos} en nivel bajo.` : "Repón antes de quedarte sin.",
      advertencias: criticos > 0 ? [`${criticos} producto(s) en nivel crítico: revisa Inventario.`] : undefined,
    },
    {
      id: "sin_movimiento",
      titulo: "Sin movimiento",
      valor: sinMovimiento,
      formato: "numero",
      formula: "Productos con existencia que no tuvieron ninguna entrada ni salida en el periodo.",
      microexplicacion: "Capital parado que ni siquiera se está usando.",
    },
  ];

  return { kpis, salidasPorTipo, porCaducar, topConsumo, criticos: criticosDetalle };
}
