import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { KpiPrincipal } from "@/components/reportes/KpiPrincipal";
import { KpiSecundario } from "@/components/reportes/KpiSecundario";
import { GraficaTendencia } from "@/components/reportes/GraficaTendencia";
import { CalidadDatosIndicador } from "@/components/reportes/CalidadDatosIndicador";
import { HallazgoCard } from "@/components/reportes/HallazgoCard";
import { CentroAtencionDrawer, useHallazgos } from "@/components/reportes/CentroAtencion";
import { TopServiciosPorMargen, NuevasVsRecurrentes } from "@/components/reportes/DistribucionCompacta";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generarNarrativa } from "@/lib/narrativaResumen";
import type { ResumenFiltro } from "@shared/schemas";

const KPI_PRINCIPAL_IDS = ["ventas", "margen_bruto", "clientes"];
const KPI_SECUNDARIO_IDS = ["cobranza", "ticket", "cartera"];

export function ResumenReportes({ filtro, onNavegarTab }: { filtro: ResumenFiltro; onNavegarTab: (tab: string) => void }) {
  const [centroAbierto, setCentroAbierto] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["reporteResumen", filtro],
    queryFn: () => window.api.reportes.resumen(filtro),
  });
  const { data: hallazgos = [] } = useHallazgos(filtro);
  const { data: agenda } = useQuery({
    queryKey: ["reporteAgenda", filtro],
    queryFn: () => window.api.reportes.agenda(filtro),
  });
  const { data: servicios } = useQuery({
    queryKey: ["reporteServiciosDetalle", filtro],
    queryFn: () => window.api.reportes.serviciosDetalle(filtro),
  });
  const { data: clientes } = useQuery({
    queryKey: ["reporteClientesDetalle", filtro],
    queryFn: () => window.api.reportes.clientesDetalle(filtro),
  });

  const narrativa = useMemo(() => (data ? generarNarrativa(data.kpis, hallazgos) : null), [data, hallazgos]);

  const topServicios = useMemo(() => {
    if (!servicios) return [];
    return [...servicios.filas]
      .sort((a, b) => b.margenBruto - a.margenBruto)
      .slice(0, 3)
      .map((f) => ({ etiqueta: f.servicioNombre, valor: f.margenBruto }));
  }, [servicios]);

  const { nuevas, recurrentes } = useMemo(() => {
    if (!clientes) return { nuevas: 0, recurrentes: 0 };
    const n = clientes.segmentos.find((s) => s.segmento === "nueva")?.cantidad ?? 0;
    const total = clientes.segmentos.reduce((acc, s) => acc + s.cantidad, 0);
    return { nuevas: n, recurrentes: Math.max(0, total - n) };
  }, [clientes]);

  const prioridades = hallazgos.slice(0, 3);

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-ink-500">Calculando resumen…</div>;
  }

  const ocupacionKpi = agenda?.kpis.find((k) => k.id === "ocupacion");
  const kpisPrincipales = KPI_PRINCIPAL_IDS.map((id) => data.kpis.find((k) => k.id === id)).filter((k) => !!k);
  const kpisSecundarios = [
    ...KPI_SECUNDARIO_IDS.map((id) => data.kpis.find((k) => k.id === id)),
    ocupacionKpi,
  ].filter((k) => !!k);

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Nivel 1 — comprender en 5 segundos: conclusión ejecutiva, no una cuadrícula de números. */}
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="font-display text-xl text-ink-900">{narrativa?.titular}</p>
          {narrativa && narrativa.observaciones.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 text-sm text-ink-600">
              {narrativa.observaciones.map((o, i) => (
                <li key={i}>· {o}</li>
              ))}
            </ul>
          )}
          {narrativa?.advertencia && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-danger-500">
              <AlertTriangle size={14} /> {narrativa.advertencia.titulo}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <CalidadDatosIndicador calidad={data.calidadDatos} />
          {hallazgos.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setCentroAbierto(true)}>
              Ver acciones <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Nivel 2 — salud del negocio: 3 métricas principales, máximo (INSTRUCCIONES §7.2, §B). */}
      <div key={`${filtro.fechaDesde}|${filtro.fechaHasta}|${filtro.comparacion}`} className="aparecer-suave grid grid-cols-1 gap-3 md:grid-cols-3">
        {kpisPrincipales.map((kpi) => (
          <KpiPrincipal key={kpi.id} kpi={kpi} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpisSecundarios.map((kpi) => (
          <KpiSecundario key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* Prioridades: máximo tres acciones de mayor impacto, con enlace al detalle completo. */}
      {prioridades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Prioridades</CardTitle>
            <button
              type="button"
              onClick={() => setCentroAbierto(true)}
              className="text-xs font-medium text-jacaranda-600 hover:underline"
            >
              Ver todos los hallazgos ({hallazgos.length})
            </button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {prioridades.map((h) => (
              <HallazgoCard key={h.id} hallazgo={h} onNavegar={onNavegarTab} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tendencia principal: una sola métrica a la vez, con periodo comparado sobrepuesto. */}
      <Card>
        <CardContent className="pt-5">
          <GraficaTendencia
            serie={data.serie}
            serieComparacion={data.serieComparacion}
            comparacionEtiqueta={data.periodo.comparacionEtiqueta.replace(/^vs\.\s*/, "")}
          />
        </CardContent>
      </Card>

      {/* Distribución: dos visualizaciones compactas, sin tablas completas. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Servicios que más aportan al margen</CardTitle>
          </CardHeader>
          <CardContent>
            <TopServiciosPorMargen filas={topServicios} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Nuevas vs. recurrentes</CardTitle>
          </CardHeader>
          <CardContent>
            <NuevasVsRecurrentes nuevas={nuevas} recurrentes={recurrentes} />
          </CardContent>
        </Card>
      </div>

      {hallazgos.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-ink-400">
          <Sparkles size={12} className="text-success-500" /> Sin hallazgos pendientes en este periodo.
        </p>
      )}

      <CentroAtencionDrawer
        open={centroAbierto}
        onClose={() => setCentroAbierto(false)}
        hallazgos={hallazgos}
        filtro={filtro}
        onNavegar={onNavegarTab}
      />
    </div>
  );
}
