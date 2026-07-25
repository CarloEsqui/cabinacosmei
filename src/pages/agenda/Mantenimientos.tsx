import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <p className="mb-4 text-sm text-ink-500">
        Clientas cuya próxima visita sugerida ya venció o está por vencer, y que no tienen ninguna cita
        futura agendada. La anticipación del aviso se ajusta en Configuración → General.
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Clienta</th>
              <th className="px-4 py-2">Último servicio</th>
              <th className="px-4 py-2">Fecha sugerida</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {mantenimientos.map((m) => (
              <tr key={m.servicioRealizadoId} className="border-t border-beige-200">
                <td className="px-4 py-2 font-medium text-ink-900">{m.clienteNombre}</td>
                <td className="px-4 py-2 text-ink-700">
                  {m.servicioNombre ?? "—"} · {formatFecha(m.fechaUltimoServicio)}
                </td>
                <td className="px-4 py-2 text-ink-700">{formatFecha(m.fechaSugerida)}</td>
                <td className="px-4 py-2">
                  <Badge variant={m.diasRestantes < 0 ? "danger" : "warning"}>
                    {m.diasRestantes < 0
                      ? `Venció hace ${-m.diasRestantes} ${-m.diasRestantes === 1 ? "día" : "días"}`
                      : m.diasRestantes === 0
                        ? "Vence hoy"
                        : `Vence en ${m.diasRestantes} ${m.diasRestantes === 1 ? "día" : "días"}`}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => onAgendar(m.clienteId)}>
                      <CalendarPlus size={14} /> Agendar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => eliminar(m)} title="Descartar">
                      <Trash2 size={14} className="text-danger-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {mantenimientos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-500">
                  No hay mantenimientos pendientes por programar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
