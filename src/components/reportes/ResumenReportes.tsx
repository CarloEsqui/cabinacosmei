import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Info, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiPrincipal } from "@/components/reportes/KpiPrincipal";
import { KpiSecundario } from "@/components/reportes/KpiSecundario";
import { GraficaTendencia } from "@/components/reportes/GraficaTendencia";
import { CalidadDatosIndicador } from "@/components/reportes/CalidadDatosIndicador";
import { HallazgoCard } from "@/components/reportes/HallazgoCard";
import { CentroAtencionCTA } from "@/components/reportes/CentroAtencionCTA";
import { CentroAtencionDrawer, useHallazgos } from "@/components/reportes/CentroAtencion";
import { TopServiciosPorMargen, NuevasVsRecurrentes } from "@/components/reportes/DistribucionCompacta";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { generarNarrativa } from "@/lib/narrativaResumen";
import type { ResumenFiltro } from "@shared/schemas";

const KPI_PRINCIPAL_IDS = ["ventas", "margen_bruto", "clientes"];
const KPI_SECUNDARIO_IDS = ["cobranza", "ticket", "cartera"];

const ESTILO_OBSERVACION = {
  positivo: { icono: TrendingUp, color: "text-success-500", borde: "border-success-500/30" },
  atencion: { icono: AlertCircle, color: "text-warning-500", borde: "border-warning-500/30" },
  informativo: { icono: Info, color: "text-jacaranda-500", borde: "border-jacaranda-400/30" },
  critico: { icono: AlertTriangle, color: "text-danger-500", borde: "border-danger-500/30" },
} as const;

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

  // Señales del periodo como píldoras con color por tono, para leerse de un vistazo (no una lista
  // plana de viñetas). Lo crítico NO se repite aquí: ya lo destaca el CTA del centro de atención.
  const señales = narrativa?.observaciones ?? [];

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Nivel 1 — Hero ejecutivo: conclusión del periodo + señales + acceso al centro de atención,
          todo dentro de una superficie propia para que no floten sueltos sobre el fondo. */}
      <div className="overflow-hidden rounded-2xl border border-beige-300 bg-gradient-to-br from-beige-50 via-beige-50 to-jacaranda-50/60 shadow-sm shadow-ink-900/[0.03]">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-jacaranda-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-jacaranda-500/12">
                <Sparkles size={11} />
              </span>
              Resumen del periodo
            </div>
            <p className="text-2xl font-semibold leading-snug tracking-tight text-ink-900">{narrativa?.titular}</p>
            {señales.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {señales.map((o, i) => {
                  const est = ESTILO_OBSERVACION[o.tono];
                  const Icono = est.icono;
                  return (
                    <span
                      key={i}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border bg-beige-50/70 px-3 py-1 text-sm text-ink-700",
                        est.borde,
                      )}
                    >
                      <Icono size={13} className={cn("shrink-0", est.color)} />
                      {o.texto}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2.5 lg:w-80 lg:items-end">
            <CalidadDatosIndicador calidad={data.calidadDatos} />
            <CentroAtencionCTA hallazgos={hallazgos} onClick={() => setCentroAbierto(true)} />
          </div>
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
