import { useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatearStock } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { fechaLocalIso } from "@shared/fechas";
import type { Lote } from "@shared/types";

/** Un lote caduca al día siguiente de su fecha (misma regla que el servidor). */
export function loteCaducado(l: Pick<Lote, "fechaCaducidad">): boolean {
  return !!l.fechaCaducidad && l.fechaCaducidad < fechaLocalIso();
}

/**
 * "Dar de baja" un lote: registra como merma todo lo que le queda (DAT-A5). Reemplaza al "Eliminar"
 * de lotes, que nunca podía funcionar porque todo lote tiene su entrada (DAT-B7). Nada se borra: la
 * baja queda en Movimientos con su costo.
 */
export function useDarDeBajaLote() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  return async function darDeBaja(l: Lote) {
    const cantidad = formatearStock(l.cantidadDisponible, l.presentacion, l.contenidoCantidad, l.contenidoUnidad);
    const caducado = loteCaducado(l);
    const r = await confirm({
      titulo: "Dar de baja el lote",
      mensaje: `${l.productoNombre} · lote ${l.numeroLote || l.id.slice(0, 8)}: se registrará como merma lo que queda (${cantidad})${caducado ? " por caducidad" : ""}. Dejará de contar en tu stock y de aparecer en las alertas; el movimiento y su costo quedan en el historial.`,
      confirmarLabel: "Dar de baja",
      cancelarLabel: "Volver",
      destructivo: true,
    });
    if (r !== "confirmado") return;
    try {
      await window.api.inventario.darDeBajaLote(l.id);
      for (const key of ["inventarioResumen", "lotesCaducados", "lotesProximosACaducar", "lotesPorProducto", "movimientos"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success("Lote dado de baja.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  };
}
