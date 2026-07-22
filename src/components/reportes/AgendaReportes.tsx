import { useQuery } from "@tanstack/react-query";
import { KpiPrincipal } from "@/components/reportes/KpiPrincipal";
import { KpiSecundario } from "@/components/reportes/KpiSecundario";
import { KpiRiesgo } from "@/components/reportes/KpiRiesgo";
import { ChartHeader } from "@/components/reportes/ChartHeader";
import { GraficaDemanda } from "@/components/reportes/GraficaDemanda";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/format";
import type { ResumenFiltro } from "@shared/schemas";

const NO_SHOW_ALTO = 15;

export function AgendaReportes({ filtro }: { filtro: ResumenFiltro }) {
  const { data, isLoading } = useQuery({
    queryKey: ["reporteAgenda", filtro],
    queryFn: () => window.api.reportes.agenda(filtro),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-ink-500">Calculando agenda…</div>;
  }

  const kpi = (id: string) => data.kpis.find((k) => k.id === id);
  const noShow = kpi("no_show");
  const impactoNoShow = kpi("ingreso_perdido_no_show");
  const noShowAlto = (noShow?.valor ?? 0) >= NO_SHOW_ALTO;

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Primer nivel: ocupación, asistencia, citas y no-show (con tratamiento de riesgo si está
          alto) — INSTRUCCIONES §12.1. */}
      <div
        key={`${filtro.fechaDesde}|${filtro.fechaHasta}`}
        className="aparecer-suave grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        {kpi("ocupacion") && <KpiPrincipal kpi={kpi("ocupacion")!} />}
        {kpi("asistencia") && <KpiPrincipal kpi={kpi("asistencia")!} />}
        {kpi("citas_agendadas") && <KpiPrincipal kpi={kpi("citas_agendadas")!} />}
        {noShow &&
          (noShowAlto ? (
            <KpiRiesgo
              kpi={noShow}
              severidad={(noShow.valor ?? 0) >= 25 ? "critico" : "atencion"}
              impacto={
                impactoNoShow && (impactoNoShow.valor ?? 0) > 0
                  ? `~${formatMoneda(impactoNoShow.valor)} no facturados (estimado).`
                  : "Muchas clientas no llegaron a su cita."
              }
            />
          ) : (
            <KpiPrincipal kpi={noShow} />
          ))}
      </div>

      {/* Segundo nivel: compacto. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpi("cancelaciones") && <KpiSecundario kpi={kpi("cancelaciones")!} />}
        {kpi("reagendadas") && <KpiSecundario kpi={kpi("reagendadas")!} />}
        {kpi("anticipacion") && <KpiSecundario kpi={kpi("anticipacion")!} />}
        {kpi("duracion_media") && <KpiSecundario kpi={kpi("duracion_media")!} />}
      </div>

      <Card>
        <CardHeader>
          <ChartHeader
            titulo="Demanda por día y hora"
            conclusion="Cada valor cuenta las citas que ocuparon agenda (no canceladas). Úsalo para ver tus horas pico y los huecos que podrías promocionar."
          />
        </CardHeader>
        <CardContent>
          <GraficaDemanda
            demanda={data.demanda}
            horaMin={data.horaMin}
            horaMax={data.horaMax}
            diasLaborales={data.diasLaborales}
          />
        </CardContent>
      </Card>
    </div>
  );
}
