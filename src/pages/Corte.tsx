import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, CheckCircle2, Receipt, Wallet, CalendarClock, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatChip } from "@/components/ui/stat-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionDocumento } from "@/components/ui/ilustraciones";
import { useToast } from "@/components/ui/toast";
import { formatFechaHora, formatFecha, formatMoneda } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { inicioDeSemanaIso, inicioDeMesIso } from "@shared/fechas";
import { TalloMinimal } from "@/components/ui/decoracion";

export function CortePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmando, setConfirmando] = useState(false);

  const { data: resumen } = useQuery({
    queryKey: ["corteResumenPendiente"],
    queryFn: () => window.api.corte.resumenPendiente(),
  });
  const { data: historial = [] } = useQuery({
    queryKey: ["corteHistorial"],
    queryFn: () => window.api.corte.historial(),
  });

  const inicioSemana = useMemo(() => inicioDeSemanaIso(), []);
  const inicioMes = useMemo(() => inicioDeMesIso(), []);

  const { data: resumenSemana } = useQuery({
    queryKey: ["corteResumenSemana", inicioSemana],
    queryFn: () => window.api.corte.resumenDesde(inicioSemana),
  });
  const { data: resumenMes } = useQuery({
    queryKey: ["corteResumenMes", inicioMes],
    queryFn: () => window.api.corte.resumenDesde(inicioMes),
  });

  const registrar = useMutation({
    mutationFn: () => window.api.corte.registrar(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corteResumenPendiente"] });
      queryClient.invalidateQueries({ queryKey: ["corteHistorial"] });
      queryClient.invalidateQueries({ queryKey: ["corteResumenSemana"] });
      queryClient.invalidateQueries({ queryKey: ["corteResumenMes"] });
      setConfirmando(false);
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  const hayPendiente = !!resumen && resumen.cantidadPagos > 0;

  return (
    <div className="relative isolate flex h-full flex-col overflow-y-auto">
      {/* Decoración de sección (§10): tallo mínimo pegado al borde derecho. Casi un remate
          tipográfico: es la página con más cifras, así que aquí la decoración solo rompe el borde. */}
      <TalloMinimal
        className="pointer-events-none absolute right-0 top-28 -z-10 hidden select-none lg:block"
        width={96}
        opacity={0.5}
      />
      <PageHeader title="Corte de caja" subtitle="Cobranza pendiente de cortar, por método de pago" />

      {/* Franja de stats: estado de la caja de un vistazo (datos ya cargados, §4). */}
      {resumen && (
        <div className="grid grid-cols-1 gap-3 px-8 pt-6 sm:grid-cols-3">
          <StatChip icon={Wallet} valor={formatMoneda(resumen.total)} label="Pendiente de cortar" />
          <StatChip icon={Receipt} valor={resumen.cantidadPagos} label="Pagos por cortar" />
          <StatChip
            icon={CalendarClock}
            valor={resumen.desdeFecha ? formatFecha(resumen.desdeFecha) : "Sin cortes aún"}
            label="Último corte"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle icon={Lock}>
              {resumen?.desdeFecha
                ? `Desde el último corte (${formatFecha(resumen.desdeFecha)})`
                : "Desde siempre (aún no hay cortes)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!hayPendiente ? (
              <EmptyState
                ilustracion={IlustracionDocumento}
                mensaje="Todo cortado"
                submensaje="No hay pagos pendientes de cortar en este momento."
              />
            ) : (
              <>
                <div className="flex flex-col">
                  {resumen!.desglosePorMetodo.map((d) => (
                    <div
                      key={d.metodoPago}
                      className="flex items-center justify-between border-b border-beige-200 py-2.5 text-sm last:border-b-0"
                    >
                      <span className="text-ink-700">{d.metodoPago}</span>
                      <span className="font-medium tabular-nums text-ink-900">{formatMoneda(d.monto)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-baseline justify-between border-t border-beige-300 pt-3">
                  <span className="text-sm font-semibold text-ink-900">
                    Total <span className="font-normal text-ink-500">({resumen!.cantidadPagos} pagos)</span>
                  </span>
                  <span className="metric-value text-xl text-ink-900">{formatMoneda(resumen!.total)}</span>
                </div>

                {!confirmando ? (
                  <Button className="self-end" onClick={() => setConfirmando(true)}>
                    <Lock size={16} /> Hacer corte
                  </Button>
                ) : (
                  <div className="rounded-xl bg-beige-100 p-3">
                    <p className="mb-2 text-sm text-ink-700">
                      ¿Confirmas el corte por {formatMoneda(resumen!.total)}? Esta acción queda registrada en el
                      historial.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={registrar.isPending} onClick={() => registrar.mutate()}>
                        <CheckCircle2 size={16} /> Confirmar corte
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirmando(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle icon={CalendarClock}>Esta semana</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="metric-value text-2xl text-ink-900">{formatMoneda(resumenSemana?.total)}</p>
              <p className="text-xs text-ink-500">{resumenSemana?.cantidadCortes ?? 0} cortes</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle icon={CalendarDays}>Este mes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="metric-value text-2xl text-ink-900">{formatMoneda(resumenMes?.total)}</p>
              <p className="text-xs text-ink-500">{resumenMes?.cantidadCortes ?? 0} cortes</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="px-8 pb-8">
        <Card className="overflow-x-auto">
          <CardHeader>
            <CardTitle icon={Receipt}>Historial de cortes</CardTitle>
          </CardHeader>
          <table className="tabla-bellora mt-3">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Desglose</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody className="aparecer-suave">
              {historial.map((c) => (
                <tr key={c.id}>
                  <td>{formatFechaHora(c.fecha, c.hora)}</td>
                  <td className="text-ink-500">
                    {c.desglosePorMetodo.map((d) => `${d.metodoPago}: ${formatMoneda(d.monto)}`).join(" · ")}
                  </td>
                  <td className="num font-medium text-ink-900">{formatMoneda(c.total)}</td>
                </tr>
              ))}
              {historial.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6">
                    <EmptyState
                      ilustracion={IlustracionDocumento}
                      mensaje="Aún no se ha registrado ningún corte."
                      submensaje="Cuando hagas tu primer corte aparecerá aquí el registro."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {historial.length > 0 && (
            <div className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-500">
              Mostrando {historial.length} {historial.length === 1 ? "corte" : "cortes"}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
