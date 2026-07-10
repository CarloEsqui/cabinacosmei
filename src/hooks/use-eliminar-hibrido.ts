import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError, tieneHistorialAsociado } from "@/lib/errores";

interface EliminarHibridoOpciones {
  /** Ej. `el proveedor "ACME"` — se usa en "¿Eliminar {nombre}?". */
  nombre: string;
  eliminar: () => Promise<unknown>;
  desactivar: () => Promise<unknown>;
  /** Texto del botón alternativo cuando no se puede borrar (por defecto "Desactivar en su lugar"). */
  alternativaLabel?: string;
  /** Toast al completar la acción alternativa (por defecto "Desactivado correctamente."). */
  mensajeExitoAlternativa?: string;
  onExito?: () => void;
}

/**
 * Flujo de borrado "híbrido": intenta eliminar de verdad; si el backend responde que el registro
 * tiene historial asociado (`ErrorConHistorial`), ofrece desactivarlo en su lugar.
 */
export function useEliminarHibrido() {
  const confirm = useConfirm();
  const toast = useToast();

  return async function eliminarHibrido({
    nombre,
    eliminar,
    desactivar,
    alternativaLabel = "Desactivar en su lugar",
    mensajeExitoAlternativa = "Desactivado correctamente.",
    onExito,
  }: EliminarHibridoOpciones) {
    const resultado = await confirm({
      titulo: "Eliminar",
      mensaje: `¿Eliminar ${nombre}? Esta acción no se puede deshacer.`,
      confirmarLabel: "Eliminar",
      destructivo: true,
    });
    if (resultado !== "confirmado") return;

    try {
      await eliminar();
      toast.success("Eliminado correctamente.");
      onExito?.();
    } catch (error) {
      if (!tieneHistorialAsociado(error)) {
        toast.error(mensajeDeError(error));
        return;
      }

      const resultadoAlternativa = await confirm({
        titulo: "No se puede eliminar",
        mensaje: mensajeDeError(error),
        confirmarLabel: alternativaLabel,
        cancelarLabel: "Cancelar",
      });
      if (resultadoAlternativa !== "confirmado") return;

      try {
        await desactivar();
        toast.success(mensajeExitoAlternativa);
        onExito?.();
      } catch (error2) {
        toast.error(mensajeDeError(error2));
      }
    }
  };
}
