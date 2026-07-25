import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, CheckCircle2, Receipt } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatFechaHora, formatFecha, formatMoneda } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { inicioDeSemanaIso, inicioDeMesIso } from "@shared/fechas";

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

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Corte de caja" subtitle="Cobranza pendiente de cortar, por método de pago" />

      <div className="grid grid-cols-1 gap-4 p-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {resumen?.desdeFecha
                ? `Desde el último corte (${formatFecha(resumen.desdeFecha)})`
                : "Desde siempre (aún no hay cortes)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!resumen || resumen.cantidadPagos === 0 ? (
              <p className="text-sm text-ink-500">No hay pagos pendientes de cortar.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {resumen.desglosePorMetodo.map((d) => (
                    <div key={d.metodoPago} className="flex justify-between text-sm">
                      <span className="text-ink-700">{d.metodoPago}</span>
                      <span className="font-medium tabular-nums text-ink-900">{formatMoneda(d.monto)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t border-beige-300 pt-3 text-base">
                  <span className="font-semibold text-jacaranda-700">Total ({resumen.cantidadPagos} pagos)</span>
                  <span className="font-bold tabular-nums text-ink-900">{formatMoneda(resumen.total)}</span>
                </div>

                {!confirmando ? (
                  <Button onClick={() => setConfirmando(true)}>
                    <Lock size={16} /> Hacer corte
                  </Button>
                ) : (
                  <div className="rounded-xl bg-beige-100 p-3">
                    <p className="mb-2 text-sm text-ink-700">
                      ¿Confirmas el corte por {formatMoneda(resumen.total)}? Esta acción queda registrada en el
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
              <CardTitle>Esta semana</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-ink-900">{formatMoneda(resumenSemana?.total)}</p>
              <p className="text-xs text-ink-500">{resumenSemana?.cantidadCortes ?? 0} cortes</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Este mes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums text-ink-900">{formatMoneda(resumenMes?.total)}</p>
              <p className="text-xs text-ink-500">{resumenMes?.cantidadCortes ?? 0} cortes</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="px-8 pb-8">
        <Card className="overflow-x-auto">
          <CardHeader>
            <CardTitle>Historial de cortes</CardTitle>
          </CardHeader>
          <table className="w-full text-sm">
            <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Desglose</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((c) => (
                <tr key={c.id} className="border-t border-beige-200">
                  <td className="px-4 py-2 text-ink-700">{formatFechaHora(c.fecha, c.hora)}</td>
                  <td className="px-4 py-2 text-ink-700">
                    {c.desglosePorMetodo.map((d) => `${d.metodoPago}: ${formatMoneda(d.monto)}`).join(" · ")}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums text-ink-900">{formatMoneda(c.total)}</td>
                </tr>
              ))}
              {historial.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6">
                    <EmptyState icon={Receipt} mensaje="Aún no se ha registrado ningún corte." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
