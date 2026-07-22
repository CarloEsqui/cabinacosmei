import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { KpiPrincipal } from "@/components/reportes/KpiPrincipal";
import { KpiSecundario } from "@/components/reportes/KpiSecundario";
import { ChartHeader } from "@/components/reportes/ChartHeader";
import { CalidadDatosIndicador } from "@/components/reportes/CalidadDatosIndicador";
import { GraficaMatrizServicios } from "@/components/reportes/GraficaMatrizServicios";
import { ServicioDetalleDrawer } from "@/components/reportes/ServicioDetalleDrawer";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatKpi, formatMoneda } from "@/lib/format";
import type { ResumenFiltro } from "@shared/schemas";
import type { ServicioMetricas } from "@shared/types";

function PanelLateral({ filas }: { filas: ServicioMetricas[] }) {
  const mejor = [...filas].sort((a, b) => b.ingresos - a.ingresos)[0];
  const masRentable = [...filas].sort((a, b) => b.margenPct - a.margenPct)[0];
  const aRevisar = [...filas].sort((a, b) => a.margenPct - b.margenPct)[0];

  const items = [
    { etiqueta: "Mejor servicio", dato: mejor, valor: formatMoneda(mejor?.ingresos ?? 0) },
    { etiqueta: "Más rentable", dato: masRentable, valor: `${masRentable?.margenPct.toFixed(0) ?? 0}% margen` },
    { etiqueta: "A revisar", dato: aRevisar, valor: `${aRevisar?.margenPct.toFixed(0) ?? 0}% margen` },
  ].filter((i) => !!i.dato);

  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <div key={i.etiqueta} className="rounded-xl border border-beige-200 bg-beige-50/60 px-3 py-2.5">
          <p className="text-xs font-medium text-ink-500">{i.etiqueta}</p>
          <p className="truncate text-sm font-semibold text-ink-900" title={i.dato!.servicioNombre}>
            {i.dato!.servicioNombre}
          </p>
          <p className="text-xs text-ink-600">{i.valor}</p>
        </div>
      ))}
    </div>
  );
}

export function ServiciosReportes({ filtro }: { filtro: ResumenFiltro }) {
  const [seleccionado, setSeleccionado] = useState<ServicioMetricas | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["reporteServiciosDetalle", filtro],
    queryFn: () => window.api.reportes.serviciosDetalle(filtro),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-ink-500">Calculando servicios…</div>;
  }

  const kpi = (id: string) => data.kpis.find((k) => k.id === id);
  // Con menos de 5 servicios el scatter no aporta lectura clara: se sustituye por el ranking solo
  // (INSTRUCCIONES §10.2 "no mostrar scatter con datos insuficientes").
  const mostrarMatriz = data.filas.length >= 5;

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex justify-end">
        <CalidadDatosIndicador
          calidad={{
            registrosAnalizados: data.filas.reduce((acc, f) => acc + f.cantidad, 0),
            registrosExcluidos: 0,
            advertencias:
              data.serviciosSinCosto > 0
                ? [`${data.serviciosSinCosto} servicio(s) cerrados sin insumos registrados: su margen puede estar sobreestimado.`]
                : [],
          }}
        />
      </div>

      <div
        key={`${filtro.fechaDesde}|${filtro.fechaHasta}|${filtro.comparacion}`}
        className="aparecer-suave grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        {kpi("ingreso") && <KpiPrincipal kpi={kpi("ingreso")!} />}
        {kpi("margen") && <KpiPrincipal kpi={kpi("margen")!} />}
        {kpi("servicios") && <KpiPrincipal kpi={kpi("servicios")!} />}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpi("ticket") && <KpiSecundario kpi={kpi("ticket")!} />}
        {kpi("duracion") && <KpiSecundario kpi={kpi("duracion")!} />}
      </div>

      {mostrarMatriz && (
        <Card>
          <CardHeader>
            <ChartHeader titulo="Matriz volumen / margen" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_200px]">
            <GraficaMatrizServicios filas={data.filas} />
            <PanelLateral filas={data.filas} />
          </CardContent>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle className="text-sm">Ranking de servicios</CardTitle>
        </CardHeader>
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Servicio</th>
              <th className="px-4 py-2 text-right">Ingresos</th>
              <th className="px-4 py-2 text-right">Margen</th>
              <th className="px-4 py-2 text-right">Ingreso/hora</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map((f) => (
              <tr
                key={f.servicioNombre}
                onClick={() => setSeleccionado(f)}
                className="cursor-pointer border-t border-beige-200 hover:bg-beige-100"
              >
                <td className="px-4 py-2 font-medium text-ink-900">
                  {f.servicioNombre}
                  {f.sinCosto && <span className="ml-1 text-xs text-warning-500" title="Sin insumos registrados">⚠</span>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-700">{formatMoneda(f.ingresos)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-ink-900">
                  {formatMoneda(f.margenBruto)} <span className="text-xs font-normal text-ink-400">({f.margenPct.toFixed(0)}%)</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-700">
                  {f.ingresoPorHora === null ? "—" : formatKpi(f.ingresoPorHora, "moneda")}
                </td>
              </tr>
            ))}
            {data.filas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6">
                  <EmptyState icon={Sparkles} mensaje="No hay servicios cerrados en este periodo." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <ServicioDetalleDrawer servicio={seleccionado} onClose={() => setSeleccionado(null)} />
    </div>
  );
}
