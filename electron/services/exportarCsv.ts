import { reporteFinanzas } from "./reportesFinanzas";
import { reporteServiciosDetalle } from "./reportesServiciosDetalle";
import { reporteClientesDetalle } from "./reportesClientesDetalle";
import { reporteAgenda } from "./reportesAgenda";
import { reporteInventarioDetalle } from "./reportesInventarioDetalle";
import { resumenInventario, listarMovimientos } from "./inventario";
import { fechaLocalIso } from "../../shared/fechas";
import type { ExportCsvTipo, MovimientosFiltro, ResumenFiltro } from "../../shared/schemas";
import type { ClienteMetricas, KPI, SegmentoCliente, Semaforo } from "../../shared/types";

// ---------------------------------------------------------------------------
// CSV — formato compatible con Excel
//   · BOM UTF-8 para que Excel abra bien los acentos.
//   · Separador coma, saltos de línea CRLF y escapado RFC 4180.
//   · Fechas DD/MM/YYYY; montos con 2 decimales sin símbolo.
// ---------------------------------------------------------------------------

const BOM = "﻿";

type Celda = string | number;

/** Escapa un campo según RFC 4180: si contiene coma, comilla o salto de línea se envuelve en
 * comillas dobles y las comillas internas se duplican. */
function celda(valor: Celda): string {
  const texto = String(valor ?? "");
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function filasACsv(encabezados: string[], filas: Celda[][]): string {
  return BOM + [encabezados, ...filas].map((fila) => fila.map(celda).join(",")).join("\r\n");
}

/** Fecha ISO (YYYY-MM-DD) → DD/MM/YYYY. Cadena vacía si no hay fecha. */
function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Monto con 2 decimales, sin símbolo. */
function fmtMonto(n: number | null | undefined): string {
  return (n ?? 0).toFixed(2);
}

/** Formatea el valor de un KPI según su tipo (para los exports que exponen KPIs). */
function fmtValorKpi(valor: number | null, formato: KPI["formato"]): string {
  if (valor === null || Number.isNaN(valor)) return "";
  switch (formato) {
    case "moneda":
      return valor.toFixed(2);
    case "porcentaje":
      return `${valor.toFixed(1)}%`;
    case "dias":
      return `${Math.round(valor)} d`;
    case "horas":
      return `${valor.toFixed(1)} h`;
    default:
      return String(Math.round(valor));
  }
}

/** Convierte una lista de KPIs (indicador + valor + comparación) en filas de CSV. */
function kpisACsv(kpis: KPI[]): { encabezados: string[]; filas: Celda[][] } {
  return {
    encabezados: ["Indicador", "Valor", "Periodo anterior", "Cambio %"],
    filas: kpis.map((k) => [
      k.titulo,
      fmtValorKpi(k.valor, k.formato),
      fmtValorKpi(k.comparacion?.valorAnterior ?? null, k.formato),
      k.comparacion?.cambioPorcentual != null ? `${k.comparacion.cambioPorcentual.toFixed(1)}%` : "",
    ]),
  };
}

const ETIQUETA_SEGMENTO: Record<SegmentoCliente, string> = {
  nueva: "Nueva",
  activa: "Activa",
  en_riesgo: "En riesgo",
  inactiva: "Inactiva",
};

const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  critico: "Crítico",
  bajo: "Bajo",
  adecuado: "Adecuado",
};

const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  entrada: "Entrada",
  venta: "Venta",
  consumo_servicio: "Consumo servicio",
  merma: "Merma",
  devolucion: "Devolución",
  uso_interno: "Uso interno",
  ajuste: "Ajuste",
};

function sufijoRango(f: ResumenFiltro): string {
  return `${f.fechaDesde}_a_${f.fechaHasta}`;
}

function clientesACsv(clientas: ClienteMetricas[]): Celda[][] {
  return clientas.map((c) => [
    c.nombre,
    ETIQUETA_SEGMENTO[c.segmento],
    fmtFecha(c.ultimaVisita),
    c.diasSinVisita,
    c.visitas,
    fmtMonto(c.valorHistorico),
    c.intervaloPromedio ?? "",
  ]);
}

/**
 * Construye el CSV del tipo indicado. Consume los reportes/servicios existentes sin modificarlos.
 * Devuelve el contenido listo para escribir y un nombre de archivo descriptivo.
 */
export async function construirCsvExport(
  tipo: ExportCsvTipo,
  filtro: ResumenFiltro | MovimientosFiltro,
): Promise<{ nombreArchivo: string; contenido: string }> {
  switch (tipo) {
    case "finanzas": {
      const f = filtro as ResumenFiltro;
      const rep = await reporteFinanzas(f);
      const { encabezados, filas } = kpisACsv(rep.kpis);
      return { nombreArchivo: `bellora_finanzas_${sufijoRango(f)}.csv`, contenido: filasACsv(encabezados, filas) };
    }

    case "servicios": {
      const f = filtro as ResumenFiltro;
      const rep = await reporteServiciosDetalle(f);
      const contenido = filasACsv(
        [
          "Servicio",
          "Cantidad",
          "Ingresos",
          "Costo de insumos",
          "Margen bruto",
          "Margen %",
          "Horas ocupadas",
          "Ingreso por hora",
        ],
        rep.filas.map((s) => [
          s.servicioNombre,
          s.cantidad,
          fmtMonto(s.ingresos),
          fmtMonto(s.costoInsumos),
          fmtMonto(s.margenBruto),
          `${s.margenPct.toFixed(1)}%`,
          s.duracionHoras != null ? s.duracionHoras.toFixed(1) : "",
          s.ingresoPorHora != null ? fmtMonto(s.ingresoPorHora) : "",
        ]),
      );
      return { nombreArchivo: `bellora_servicios_${sufijoRango(f)}.csv`, contenido };
    }

    case "clientes": {
      const f = filtro as ResumenFiltro;
      const rep = await reporteClientesDetalle(f);
      // Las clientas accionables del periodo: en riesgo primero, luego inactivas.
      const contenido = filasACsv(
        ["Clienta", "Segmento", "Última visita", "Días sin visita", "Visitas", "Valor histórico", "Intervalo (días)"],
        clientesACsv([...rep.enRiesgo, ...rep.inactivas]),
      );
      return { nombreArchivo: `bellora_clientas_${sufijoRango(f)}.csv`, contenido };
    }

    case "agenda": {
      const f = filtro as ResumenFiltro;
      const rep = await reporteAgenda(f);
      const { encabezados, filas } = kpisACsv(rep.kpis);
      return { nombreArchivo: `bellora_agenda_${sufijoRango(f)}.csv`, contenido: filasACsv(encabezados, filas) };
    }

    case "inventario_reporte": {
      const f = filtro as ResumenFiltro;
      const rep = await reporteInventarioDetalle(f);
      const { encabezados, filas } = kpisACsv(rep.kpis);
      return { nombreArchivo: `bellora_inventario_${sufijoRango(f)}.csv`, contenido: filasACsv(encabezados, filas) };
    }

    case "inventario_stock": {
      // Snapshot del stock actual: no depende del rango de fechas.
      const productos = await resumenInventario();
      const contenido = filasACsv(
        ["Producto", "Categoría", "Proveedor", "Stock total", "Estado", "Próxima caducidad", "Costo base", "Precio venta"],
        productos.map((p) => [
          p.nombre,
          p.tipoProductoNombre ?? "",
          p.proveedorNombre ?? "",
          p.stockTotal,
          ETIQUETA_SEMAFORO[p.semaforo],
          fmtFecha(p.loteMasProximoACaducar),
          fmtMonto(p.costoBase),
          fmtMonto(p.precioVenta),
        ]),
      );
      return { nombreArchivo: `bellora_inventario_stock_${fechaLocalIso()}.csv`, contenido };
    }

    case "movimientos": {
      const f = filtro as MovimientosFiltro;
      const movs = await listarMovimientos(f);
      const contenido = filasACsv(
        ["Fecha", "Folio", "Tipo", "Producto", "Lote", "Cantidad", "Observaciones"],
        movs.map((m) => [
          fmtFecha(m.fecha),
          m.folio ?? "",
          ETIQUETA_MOVIMIENTO[m.tipo] ?? m.tipo,
          m.productoNombre ?? "",
          m.numeroLote ?? "",
          m.cantidad,
          m.observaciones ?? "",
        ]),
      );
      const sufijo =
        f.fechaDesde && f.fechaHasta ? `${f.fechaDesde}_a_${f.fechaHasta}` : fechaLocalIso();
      return { nombreArchivo: `bellora_movimientos_${sufijo}.csv`, contenido };
    }
  }
}
