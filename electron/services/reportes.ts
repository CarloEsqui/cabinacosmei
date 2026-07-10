import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  pagos,
  entradasInventario,
  salidasInventario,
  serviciosRealizados,
  serviciosCatalogo,
  clientes,
} from "../db/schema";
import type { RangoFechas } from "../../shared/schemas";
import type {
  ReporteCobranza,
  ReporteInventario,
  ReporteServicios,
  ReporteClientes,
  DesgloseMetodo,
} from "../../shared/types";

export async function reporteCobranza(rango: RangoFechas): Promise<ReporteCobranza> {
  const db = getDb();
  const filas = db
    .select({ fecha: pagos.fecha, metodoPago: pagos.metodoPago, monto: pagos.monto })
    .from(pagos)
    .where(
      and(eq(pagos.estatus, "cobrado"), gte(pagos.fecha, rango.fechaDesde), lte(pagos.fecha, rango.fechaHasta)),
    )
    .orderBy(asc(pagos.fecha))
    .all();

  const mapa = new Map<string, number>();
  for (const f of filas) mapa.set(f.metodoPago, (mapa.get(f.metodoPago) ?? 0) + f.monto);
  const totalPorMetodo: DesgloseMetodo[] = [...mapa.entries()].map(([metodoPago, monto]) => ({
    metodoPago,
    monto,
  }));

  return {
    filas,
    totalPorMetodo,
    total: filas.reduce((acc, f) => acc + f.monto, 0),
  };
}

export async function reporteInventario(rango: RangoFechas): Promise<ReporteInventario> {
  const db = getDb();
  const entradas = db
    .select({ cantidad: entradasInventario.cantidad })
    .from(entradasInventario)
    .where(and(gte(entradasInventario.fecha, rango.fechaDesde), lte(entradasInventario.fecha, rango.fechaHasta)))
    .all();

  const salidas = db
    .select({
      cantidad: salidasInventario.cantidad,
      tipoSalida: salidasInventario.tipoSalida,
      valor: salidasInventario.valor,
    })
    .from(salidasInventario)
    .where(and(gte(salidasInventario.fecha, rango.fechaDesde), lte(salidasInventario.fecha, rango.fechaHasta)))
    .all();

  const porTipoMapa = new Map<string, number>();
  let costoConsumo = 0;
  for (const s of salidas) {
    porTipoMapa.set(s.tipoSalida, (porTipoMapa.get(s.tipoSalida) ?? 0) + s.cantidad);
    if (s.tipoSalida === "consumo_servicio") costoConsumo += s.valor ?? 0;
  }

  return {
    totalEntradas: entradas.reduce((acc, e) => acc + e.cantidad, 0),
    totalSalidas: salidas.reduce((acc, s) => acc + s.cantidad, 0),
    costoConsumo,
    porTipoSalida: [...porTipoMapa.entries()].map(([tipo, cantidad]) => ({ tipo, cantidad })),
  };
}

export async function reporteServicios(rango: RangoFechas): Promise<ReporteServicios> {
  const db = getDb();
  const filas = db
    .select({
      servicioNombre: serviciosCatalogo.nombre,
      precio: serviciosRealizados.precio,
    })
    .from(serviciosRealizados)
    .leftJoin(serviciosCatalogo, eq(serviciosRealizados.servicioCatalogoId, serviciosCatalogo.id))
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        gte(serviciosRealizados.fecha, rango.fechaDesde),
        lte(serviciosRealizados.fecha, rango.fechaHasta),
      ),
    )
    .all();

  const mapa = new Map<string, { cantidad: number; total: number }>();
  for (const f of filas) {
    const nombre = f.servicioNombre ?? "Sin nombre";
    const actual = mapa.get(nombre) ?? { cantidad: 0, total: 0 };
    actual.cantidad += 1;
    actual.total += f.precio ?? 0;
    mapa.set(nombre, actual);
  }

  const totalServicios = filas.length;
  const totalIngresos = filas.reduce((acc, f) => acc + (f.precio ?? 0), 0);

  return {
    totalServicios,
    ticketPromedio: totalServicios > 0 ? totalIngresos / totalServicios : 0,
    porServicio: [...mapa.entries()]
      .map(([servicioNombre, v]) => ({ servicioNombre, cantidad: v.cantidad, total: v.total }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}

export async function reporteClientes(rango: RangoFechas): Promise<ReporteClientes> {
  const db = getDb();
  const nuevos = db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(gte(clientes.fechaAlta, rango.fechaDesde), lte(clientes.fechaAlta, rango.fechaHasta)))
    .all();

  const mantenimientos = db
    .select({ id: serviciosRealizados.id })
    .from(serviciosRealizados)
    .where(
      and(
        eq(serviciosRealizados.estatus, "cerrado"),
        gte(serviciosRealizados.fecha, rango.fechaDesde),
        lte(serviciosRealizados.fecha, rango.fechaHasta),
        isNotNull(serviciosRealizados.proximaCitaSugerida),
      ),
    )
    .all();

  return {
    nuevosClientes: nuevos.length,
    mantenimientosGenerados: mantenimientos.length,
  };
}

function celda(valor: string | number): string {
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function filasACsv(encabezados: string[], filas: (string | number)[][]): string {
  return [encabezados, ...filas].map((fila) => fila.map(celda).join(",")).join("\n");
}

export type TipoReporte = "cobranza" | "inventario" | "servicios";

/** Genera el CSV de un reporte junto con un nombre de archivo sugerido. */
export async function construirCsv(
  tipo: TipoReporte,
  rango: RangoFechas,
): Promise<{ nombreArchivo: string; contenido: string }> {
  const sufijo = `${rango.fechaDesde}_a_${rango.fechaHasta}`;

  if (tipo === "cobranza") {
    const reporte = await reporteCobranza(rango);
    const contenido = filasACsv(
      ["Fecha", "Método de pago", "Monto"],
      reporte.filas.map((f) => [f.fecha, f.metodoPago, f.monto]),
    );
    return { nombreArchivo: `reporte_cobranza_${sufijo}.csv`, contenido };
  }

  if (tipo === "inventario") {
    const reporte = await reporteInventario(rango);
    const contenido = filasACsv(
      ["Tipo de salida", "Cantidad"],
      reporte.porTipoSalida.map((f) => [f.tipo, f.cantidad]),
    );
    return { nombreArchivo: `reporte_inventario_${sufijo}.csv`, contenido };
  }

  const reporte = await reporteServicios(rango);
  const contenido = filasACsv(
    ["Servicio", "Cantidad", "Total"],
    reporte.porServicio.map((f) => [f.servicioNombre, f.cantidad, f.total]),
  );
  return { nombreArchivo: `reporte_servicios_${sufijo}.csv`, contenido };
}
