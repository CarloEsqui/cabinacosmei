import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Trash2, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionCalendario } from "@/components/ui/ilustraciones";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { formatFecha } from "@/lib/format";
import type { MantenimientoPendiente } from "@shared/types";

interface MantenimientosTabProps {
  onAgendar: (clienteId: string) => void;
}

export function MantenimientosTab({ onAgendar }: MantenimientosTabProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const { data: mantenimientos = [] } = useQuery({
    queryKey: ["mantenimientosNoProgramados"],
    queryFn: () => window.api.citas.mantenimientosNoProgramados(),
  });

  const descartar = useMutation({
    mutationFn: (servicioRealizadoId: string) => window.api.citas.descartarMantenimiento(servicioRealizadoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mantenimientosNoProgramados"] });
      toast.success("Mantenimiento descartado.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  async function eliminar(m: MantenimientoPendiente) {
    const resultado = await confirm({
      titulo: "Descartar mantenimiento",
      mensaje: `¿Dejar de mostrar el recordatorio de mantenimiento para ${m.clienteNombre}? Se puede volver a generar la próxima vez que le cierres un servicio con periodicidad.`,
      confirmarLabel: "Descartar",
      destructivo: true,
    });
    if (resultado === "confirmado") descartar.mutate(m.servicioRealizadoId);
  }

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-beige-200/70 bg-beige-50 px-4 py-2.5 text-sm text-ink-500">
        <Info size={14} className="shrink-0 text-ink-400" />
        <p>
          Clientas cuya próxima visita sugerida ya venció o está por vencer, y que no tienen ninguna cita
          futura agendada. La anticipación del aviso se ajusta en Configuración → General.
        </p>
      </div>
      <Card className="overflow-x-auto">
        <table className="tabla-bellora">
          <thead>
            <tr>
              <th>Clienta</th>
              <th>Último servicio</th>
              <th>Fecha sugerida</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody key={mantenimientos.length} className="aparecer-suave">
            {mantenimientos.map((m) => (
              <tr key={m.servicioRealizadoId}>
                <td className="font-medium text-ink-900">{m.clienteNombre}</td>
                <td>
                  {m.servicioNombre ?? "—"} · {formatFecha(m.fechaUltimoServicio)}
                </td>
                <td>{formatFecha(m.fechaSugerida)}</td>
                <td>
                  <Badge variant={m.diasRestantes < 0 ? "danger" : "warning"}>
                    {m.diasRestantes < 0
                      ? `Venció hace ${-m.diasRestantes} ${-m.diasRestantes === 1 ? "día" : "días"}`
                      : m.diasRestantes === 0
                        ? "Vence hoy"
                        : `Vence en ${m.diasRestantes} ${m.diasRestantes === 1 ? "día" : "días"}`}
                  </Badge>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="secondary" size="sm" onClick={() => onAgendar(m.clienteId)}>
                      <CalendarPlus size={14} /> Agendar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-ink-400 hover:text-danger-500"
                      onClick={() => eliminar(m)}
                      title="Descartar"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {mantenimientos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6">
                  <EmptyState
                    ilustracion={IlustracionCalendario}
                    mensaje="Nadie pendiente de mantenimiento."
                    submensaje="Cuando la próxima visita sugerida de una clienta esté por vencer, aparecerá aquí."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
