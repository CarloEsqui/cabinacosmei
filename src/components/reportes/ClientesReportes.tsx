import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { KpiPrincipal } from "@/components/reportes/KpiPrincipal";
import { KpiSecundario } from "@/components/reportes/KpiSecundario";
import { KpiRiesgo } from "@/components/reportes/KpiRiesgo";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatFecha, formatMoneda } from "@/lib/format";
import type { ResumenFiltro } from "@shared/schemas";
import type { ClienteMetricas, SegmentoConteo } from "@shared/types";

const COLOR_SEGMENTO: Record<string, string> = {
  nueva: "bg-jacaranda-500",
  activa: "bg-success-500",
  en_riesgo: "bg-warning-500",
  inactiva: "bg-danger-500",
};

/** Tabla de segmentación: cantidad + valor económico por segmento. */
function TablaSegmento({ segmentos }: { segmentos: SegmentoConteo[] }) {
  const total = segmentos.reduce((acc, s) => acc + s.cantidad, 0);
  return (
    <Card className="overflow-x-auto">
      <CardHeader>
        <CardTitle className="text-sm">Clientas por segmento</CardTitle>
      </CardHeader>
      <table className="w-full text-sm">
        <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
          <tr>
            <th className="px-4 py-2">Segmento</th>
            <th className="px-4 py-2 text-right">Clientas</th>
            <th className="px-4 py-2 text-right">% del total</th>
            <th className="px-4 py-2 text-right">Valor histórico</th>
          </tr>
        </thead>
        <tbody>
          {segmentos.map((s) => (
            <tr key={s.segmento} className="border-t border-beige-200">
              <td className="px-4 py-2 font-medium text-ink-900">
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", COLOR_SEGMENTO[s.segmento])} />
                  {s.etiqueta}
                </span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-ink-700">{s.cantidad}</td>
              <td className="px-4 py-2 text-right tabular-nums text-ink-700">
                {total > 0 ? `${((s.cantidad / total) * 100).toFixed(0)}%` : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-ink-700">{formatMoneda(s.valorTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-beige-200 px-4 py-2 text-xs text-ink-400">
        Nuevas: primera visita en el periodo · Activas: dentro de su frecuencia · En riesgo: se pasaron de su
        patrón · Inactivas: +90 días sin venir.
      </p>
    </Card>
  );
}

function ListaAccionable({ enRiesgo, inactivas }: { enRiesgo: ClienteMetricas[]; inactivas: ClienteMetricas[] }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"riesgo" | "inactivas">("riesgo");
  const filas = tab === "riesgo" ? enRiesgo : inactivas;

  return (
    <Card className="overflow-x-auto">
      <div className="flex items-center gap-1 border-b border-beige-200 px-3 pt-3">
        {(
          [
            { id: "riesgo" as const, label: `En riesgo (${enRiesgo.length})` },
            { id: "inactivas" as const, label: `Inactivas (${inactivas.length})` },
          ]
        ).map((t) => (
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
      <table className="w-full text-sm">
        <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
          <tr>
            <th className="px-4 py-2">Clienta</th>
            <th className="px-4 py-2">Última visita</th>
            <th className="px-4 py-2 text-right">Retraso</th>
            <th className="px-4 py-2 text-right">Valor</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {/* Fila clicable → abre el expediente real de la clienta en Clientes (INSTRUCCIONES
              §11.3 "acciones: ver expediente"), no un dato suelto sin salida. */}
          {filas.slice(0, 30).map((c) => (
            <tr
              key={c.clienteId}
              onClick={() => navigate(`/clientes?expediente=${c.clienteId}`)}
              className="cursor-pointer border-t border-beige-200 hover:bg-beige-100"
            >
              <td className="px-4 py-2 font-medium text-ink-900">{c.nombre}</td>
              <td className="px-4 py-2 text-ink-700">{formatFecha(c.ultimaVisita)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-ink-700">{c.diasSinVisita} días</td>
              <td className="px-4 py-2 text-right tabular-nums text-ink-700">{formatMoneda(c.valorHistorico)}</td>
              <td className="px-4 py-2 text-right text-ink-300">
                <ArrowUpRight size={14} />
              </td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-400">
                {tab === "riesgo" ? "Ninguna clienta en riesgo por ahora." : "No hay clientas inactivas."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

export function ClientesReportes({ filtro }: { filtro: ResumenFiltro }) {
  const { data, isLoading } = useQuery({
    queryKey: ["reporteClientesDetalle", filtro],
    queryFn: () => window.api.reportes.clientesDetalle(filtro),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-ink-500">Calculando clientas…</div>;
  }

  const kpi = (id: string) => data.kpis.find((k) => k.id === id);
  const enRiesgoKpi = kpi("en_riesgo");

  return (
    <div className="flex flex-col gap-6 p-8">
      <div
        key={`${filtro.fechaDesde}|${filtro.fechaHasta}|${filtro.comparacion}`}
        className="aparecer-suave grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        {kpi("atendidas") && <KpiPrincipal kpi={kpi("atendidas")!} />}
        {kpi("recompra") && <KpiPrincipal kpi={kpi("recompra")!} />}
        {kpi("valor_prom") && <KpiPrincipal kpi={kpi("valor_prom")!} />}
        {enRiesgoKpi && (
          <KpiRiesgo
            kpi={enRiesgoKpi}
            impacto={
              (enRiesgoKpi.valor ?? 0) > 0
                ? `${formatMoneda(data.enRiesgo.reduce((a, c) => a + c.valorHistorico, 0))} de valor histórico en riesgo.`
                : undefined
            }
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpi("nuevas") && <KpiSecundario kpi={kpi("nuevas")!} />}
        {kpi("inactivas") && <KpiSecundario kpi={kpi("inactivas")!} />}
        {kpi("dias_visitas") && <KpiSecundario kpi={kpi("dias_visitas")!} />}
      </div>

      <TablaSegmento segmentos={data.segmentos} />

      <ListaAccionable enRiesgo={data.enRiesgo} inactivas={data.inactivas} />
    </div>
  );
}
