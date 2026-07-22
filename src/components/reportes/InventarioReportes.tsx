import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { KpiPrincipal } from "@/components/reportes/KpiPrincipal";
import { KpiSecundario } from "@/components/reportes/KpiSecundario";
import { ChartHeader } from "@/components/reportes/ChartHeader";
import { GraficaSalidasTipo } from "@/components/reportes/GraficaSalidasTipo";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatFecha, formatMoneda } from "@/lib/format";
import type { ResumenFiltro } from "@shared/schemas";

type TabLista = "caducidad" | "consumo" | "criticos";

export function InventarioReportes({ filtro }: { filtro: ResumenFiltro }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabLista>("caducidad");
  const { data, isLoading } = useQuery({
    queryKey: ["reporteInventarioDetalle", filtro],
    queryFn: () => window.api.reportes.inventarioDetalle(filtro),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-ink-500">Calculando inventario…</div>;
  }

  const kpi = (id: string) => data.kpis.find((k) => k.id === id);

  const tabs: { id: TabLista; label: string }[] = [
    { id: "caducidad", label: `Por caducar / vencidos (${data.porCaducar.length})` },
    { id: "consumo", label: `Mayor consumo (${data.topConsumo.length})` },
    { id: "criticos", label: `Críticos (${data.criticos.length})` },
  ];

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Primer nivel: foto de hoy + lo estructural del periodo (INSTRUCCIONES §13.1). */}
      <div
        key={`${filtro.fechaDesde}|${filtro.fechaHasta}|${filtro.comparacion}`}
        className="aparecer-suave grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        {kpi("valor_inventario") && <KpiPrincipal kpi={kpi("valor_inventario")!} />}
        {kpi("inventario_riesgo") && <KpiPrincipal kpi={kpi("inventario_riesgo")!} />}
        {kpi("consumo_servicios") && <KpiPrincipal kpi={kpi("consumo_servicios")!} />}
        {kpi("cobertura") && <KpiPrincipal kpi={kpi("cobertura")!} />}
      </div>

      {/* Segundo nivel: compacto (INSTRUCCIONES §13.2). */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpi("compras") && <KpiSecundario kpi={kpi("compras")!} />}
        {kpi("mermas") && <KpiSecundario kpi={kpi("mermas")!} />}
        {kpi("criticos") && <KpiSecundario kpi={kpi("criticos")!} />}
        {kpi("sin_movimiento") && <KpiSecundario kpi={kpi("sin_movimiento")!} />}
      </div>

      <Card>
        <CardHeader>
          <ChartHeader titulo="Salidas de inventario por tipo (a costo)" conclusion="Consumo = insumos usados en servicios; merma y devolución son pérdida real." />
        </CardHeader>
        <CardContent>
          <GraficaSalidasTipo salidas={data.salidasPorTipo} />
        </CardContent>
      </Card>

      {/* Lista prioritaria unificada con tabs, no varias tablas completas a la vez
          (INSTRUCCIONES §13.6). */}
      <Card className="overflow-x-auto">
        <div className="flex items-center justify-between gap-2 border-b border-beige-200 px-3 pt-3">
          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.id ? "border-jacaranda-600 text-jacaranda-700" : "border-transparent text-ink-500 hover:text-ink-900",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Enlace real a la pestaña de Inventario donde se actúa sobre estos registros
              (INSTRUCCIONES §15: toda métrica debe poder explicarse / llevar a la acción). */}
          {tab === "caducidad" && (
            <button
              type="button"
              onClick={() => navigate("/inventario?tab=caducidad")}
              className="mb-2 flex shrink-0 items-center gap-1 text-xs font-medium text-jacaranda-600 hover:underline"
            >
              Gestionar en Inventario <ArrowUpRight size={12} />
            </button>
          )}
          {tab === "criticos" && (
            <button
              type="button"
              onClick={() => navigate("/inventario?tab=resumen&semaforo=critico")}
              className="mb-2 flex shrink-0 items-center gap-1 text-xs font-medium text-jacaranda-600 hover:underline"
            >
              Reponer en Inventario <ArrowUpRight size={12} />
            </button>
          )}
        </div>

        {tab === "caducidad" && (
          <table className="w-full text-sm">
            <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Caduca</th>
                <th className="px-4 py-2 text-right">Días</th>
                <th className="px-4 py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.porCaducar.slice(0, 30).map((l, i) => (
                <tr key={`${l.productoNombre}-${l.numeroLote ?? i}`} className="border-t border-beige-200">
                  <td className="px-4 py-2 font-medium text-ink-900">
                    {l.productoNombre}
                    {l.numeroLote && <span className="ml-1 text-xs text-ink-400">{l.numeroLote}</span>}
                  </td>
                  <td className="px-4 py-2 text-ink-700">{formatFecha(l.fechaCaducidad)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${l.vencido ? "font-medium text-danger-500" : "text-ink-700"}`}>
                    {l.vencido ? `vencido ${Math.abs(l.diasRestantes)}d` : `${l.diasRestantes}d`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">{formatMoneda(l.valor)}</td>
                </tr>
              ))}
              {data.porCaducar.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink-400">
                    Nada por caducar en la ventana de alerta. 👌
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "consumo" && (
          <table className="w-full text-sm">
            <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2 text-right">Unidades</th>
                <th className="px-4 py-2 text-right">Costo</th>
              </tr>
            </thead>
            <tbody>
              {data.topConsumo.map((c) => (
                <tr key={c.productoNombre} className="border-t border-beige-200">
                  <td className="px-4 py-2 font-medium text-ink-900">{c.productoNombre}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">{c.unidades}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">{formatMoneda(c.costo)}</td>
                </tr>
              ))}
              {data.topConsumo.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-ink-400">
                    No hubo consumo de insumos en servicios este periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "criticos" && (
          <table className="w-full text-sm">
            <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2 text-right">Stock actual</th>
                <th className="px-4 py-2 text-right">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {data.criticos.map((c) => (
                <tr key={c.productoNombre} className="border-t border-beige-200">
                  <td className="px-4 py-2 font-medium text-ink-900">{c.productoNombre}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-danger-500">{c.stock}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">{c.minimo}</td>
                </tr>
              ))}
              {data.criticos.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-ink-400">
                    Ningún producto en nivel crítico. 👌
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
