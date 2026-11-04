import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatFecha } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import type { CitaRow } from "@shared/types";

type Accion = "confirmada" | "no_asistio" | "cancelada" | "reactivar" | "eliminar";

/**
 * Acciones sobre una cita que no pasan por el cierre, compartidas por la Lista y el detalle del
 * Calendario. Las irreversibles en la práctica (cancelar, no asistió, eliminar) piden confirmación
 * (auditoría CIT-M1): antes eran de un clic y sin vuelta atrás.
 */
export function useAccionesCita() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const mutacion = useMutation({
    mutationFn: async ({ cita, accion }: { cita: CitaRow; accion: Accion }): Promise<void> => {
      if (accion === "reactivar") await window.api.citas.reactivar(cita.id);
      else if (accion === "eliminar") await window.api.citas.eliminar(cita.id);
      else await window.api.citas.cambiarEstado(cita.id, accion);
    },
    onSuccess: (_r, { accion }) => {
      queryClient.invalidateQueries({ queryKey: ["citas"] });
      if (accion === "eliminar") toast.success("Cita eliminada.");
      if (accion === "reactivar") toast.success("La cita volvió a quedar programada.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  const describir = (c: CitaRow) => `${c.clienteNombre} del ${formatFecha(c.fecha)} a las ${c.hora}`;

  async function ejecutar(cita: CitaRow, accion: Accion, onHecho?: () => void) {
    if (accion === "cancelada") {
      const r = await confirm({
        titulo: "Cancelar cita",
        mensaje: `¿Cancelar la cita de ${describir(cita)}? Seguirá en la agenda como "Cancelada" y contará en el reporte de cancelaciones. Si fue un error, podrás reactivarla.`,
        confirmarLabel: "Cancelar cita",
        cancelarLabel: "Volver",
        destructivo: true,
      });
      if (r !== "confirmado") return;
    }
    if (accion === "no_asistio") {
      const r = await confirm({
        titulo: "Marcar que no asistió",
        mensaje: `¿Marcar que ${cita.clienteNombre} no asistió a su cita del ${formatFecha(cita.fecha)} a las ${cita.hora}? Contará en el reporte de inasistencias. Si fue un error, podrás reactivarla.`,
        confirmarLabel: "No asistió",
        cancelarLabel: "Volver",
        destructivo: true,
      });
      if (r !== "confirmado") return;
    }
    if (accion === "eliminar") {
      const r = await confirm({
        titulo: "Eliminar cita",
        mensaje: `¿Eliminar definitivamente la cita de ${describir(cita)}? Úsalo solo si se capturó por error: desaparece de la agenda y de los reportes. Si la clienta canceló, mejor usa "Cancelar cita".`,
        confirmarLabel: "Eliminar",
        cancelarLabel: "Volver",
        destructivo: true,
      });
      if (r !== "confirmado") return;
    }
    mutacion.mutate({ cita, accion }, { onSuccess: () => onHecho?.() });
  }

  return { ejecutar, ocupado: mutacion.isPending };
}
