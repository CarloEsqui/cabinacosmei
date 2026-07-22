import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { KpiPrincipal } from "@/components/reportes/KpiPrincipal";
import { CarteraDrawer } from "@/components/reportes/CarteraDrawer";
import { KpiSecundario } from "@/components/reportes/KpiSecundario";
import { KpiRiesgo } from "@/components/reportes/KpiRiesgo";
import { GraficaTendencia } from "@/components/reportes/GraficaTendencia";
import { ChartHeader } from "@/components/reportes/ChartHeader";
import { GraficaMetodosPago } from "@/components/reportes/GraficaMetodosPago";
import { GraficaCartera } from "@/components/reportes/GraficaCartera";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatMoneda } from "@/lib/format";
import type { ResumenFiltro } from "@shared/schemas";
import type { FilaEstadoResultados } from "@shared/types";

function TablaConceptos({ titulo, filas, nota }: { titulo: string; filas: FilaEstadoResultados[]; nota?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {filas.map((f) => (
          <div
            key={f.concepto}
            className={`flex items-center justify-between py-1 text-sm ${
              f.enfasis ? "mt-1 border-t border-beige-300 pt-2 font-semibold text-ink-900" : "text-ink-700"
            }`}
          >
            <span>{f.concepto}</span>
            <span className={`tabular-nums ${f.valor < 0 ? "text-danger-500" : ""}`}>{formatMoneda(f.valor)}</span>
          </div>
        ))}
        {nota && <p className="mt-2 text-xs text-ink-400">{nota}</p>}
      </CardContent>
    </Card>
  );
}

export function FinanzasReportes({ filtro, onNavegarTab }: { filtro: ResumenFiltro; onNavegarTab: (tab: string) => void }) {
  const [carteraAbierta, setCarteraAbierta] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["reporteFinanzas", filtro],
    queryFn: () => window.api.reportes.finanzas(filtro),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-ink-500">Calculando finanzas…</div>;
  }

  const kpi = (id: string) => data.kpis.find((k) => k.id === id);
  const cartera = kpi("cartera");
  const margenPct = kpi("margen_pct");
  const etiquetaComparacion = kpi("ventas")?.comparacion?.etiqueta.replace(/^vs\.\s*/, "") ?? "periodo anterior";

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Primer nivel: ventas, cobranza y margen como KPI principal; cartera con tratamiento de
          riesgo en la misma fila — nunca debe leerse como un número más (INSTRUCCIONES §9.1, §5.3). */}
      <div key={`${filtro.fechaDesde}|${filtro.fechaHasta}|${filtro.comparacion}`} className="aparecer-suave grid grid-cols-1 gap-3 md:grid-cols-4">
        {kpi("ventas") && <KpiPrincipal kpi={kpi("ventas")!} />}
        {kpi("cobranza") && <KpiPrincipal kpi={kpi("cobranza")!} />}
        {kpi("margen_bruto") && <KpiPrincipal kpi={kpi("margen_bruto")!} />}
        {cartera && (
          <KpiRiesgo
            kpi={cartera}
            impacto={
              (cartera.valor ?? 0) > 0 ? "Saldo pendiente de cobro al día de hoy. Clic para ver el detalle." : "Sin saldo pendiente."
            }
            onDetalle={(cartera.valor ?? 0) > 0 ? () => setCarteraAbierta(true) : undefined}
            accion={
              (cartera.valor ?? 0) > 0
                ? {
                    label: "Ver antigüedad de cartera",
                    onClick: () => document.getElementById("cartera-antiguedad")?.scrollIntoView({ behavior: "smooth" }),
                  }
                : undefined
            }
          />
        )}
      </div>

      {/* Segundo nivel: compacto, sin descripción permanente (INSTRUCCIONES §9.2, §5.2). */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {margenPct && <KpiSecundario kpi={margenPct} />}
        {kpi("compras") && <KpiSecundario kpi={kpi("compras")!} />}
        {kpi("mermas") && <KpiSecundario kpi={kpi("mermas")!} />}
        {kpi("caducidad") && <KpiSecundario kpi={kpi("caducidad")!} />}
      </div>

      <Card>
        <CardContent className="pt-5">
          <GraficaTendencia serie={data.serie} comparacionEtiqueta={etiquetaComparacion} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <TablaConceptos titulo="Estado de resultados (margen)" filas={data.estadoResultados} />
          {margenPct && (
            <button
              type="button"
              onClick={() => onNavegarTab("servicios")}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-jacaranda-600 hover:underline"
            >
              Ver los servicios que explican este costo <ArrowRight size={12} />
            </button>
          )}
        </div>
        <TablaConceptos
          titulo="Flujo de caja parcial"
          filas={data.flujoCaja}
          nota="El flujo parcial no incluye renta, nómina, impuestos ni otros gastos generales."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.metodosPago.length > 1 ? (
          <Card>
            <CardHeader>
              <ChartHeader titulo="Métodos de pago" />
            </CardHeader>
            <CardContent>
              <GraficaMetodosPago metodos={data.metodosPago} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <ChartHeader titulo="Métodos de pago" conclusion="No hay diversidad de método este periodo." />
            </CardHeader>
            <CardContent>
              {data.metodosPago[0] && (
                <p className="text-sm text-ink-700">
                  {formatMoneda(data.metodosPago[0].monto)} en {data.metodosPago[0].metodo} (
                  {data.metodosPago[0].operaciones} operación{data.metodosPago[0].operaciones === 1 ? "" : "es"}).
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <Card id="cartera-antiguedad">
          <CardHeader>
            <ChartHeader titulo="Cuentas por cobrar por antigüedad" />
          </CardHeader>
          <CardContent>
            <GraficaCartera filas={data.carteraAntiguedad} />
          </CardContent>
        </Card>
      </div>

      <CarteraDrawer open={carteraAbierta} onClose={() => setCarteraAbierta(false)} />
    </div>
  );
}
