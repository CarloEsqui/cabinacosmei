import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { invalidarTratamientos } from "@/components/ficha/FotosTratamiento";

/**
 * Notas del tratamiento (`servicios_realizados.observaciones`), editables con la cita cerrada.
 * No se versionan (decisión del dueño; Gate de la ficha, condición 9).
 */
export function NotasTratamiento({
  servicioRealizadoId,
  inicial,
  onPendiente,
}: {
  servicioRealizadoId: string;
  inicial: string | null;
  /** FIC-M2: avisa al contenedor si hay texto sin guardar, para que pregunte antes de cerrar. */
  onPendiente?: (pendiente: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [texto, setTexto] = useState(inicial ?? "");
  const [base, setBase] = useState(inicial ?? "");
  const cambio = texto.trim() !== base.trim();
  // En un ref: el padre suele pasar una función nueva en cada render, y depender de ella haría que
  // el efecto se repita y alterne el estado del padre en bucle.
  const onPendienteRef = useRef(onPendiente);
  onPendienteRef.current = onPendiente;
  useEffect(() => {
    onPendienteRef.current?.(cambio);
  }, [cambio]);
  useEffect(() => () => onPendienteRef.current?.(false), []);

  const guardar = useMutation({
    mutationFn: () => window.api.serviciosRealizados.actualizarObservaciones(servicioRealizadoId, texto),
    onSuccess: () => {
      setBase(texto);
      invalidarTratamientos(queryClient);
      toast.success("Notas guardadas.");
    },
    onError: (e) => toast.error(mensajeDeError(e, "No se pudieron guardar las notas.")),
  });

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        maxLength={4000}
        placeholder="Notas del tratamiento: qué se hizo, cómo reaccionó la piel…"
        className="w-full resize-y rounded-xl border border-beige-300 bg-beige-50 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-jacaranda-400"
      />
      {cambio && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setTexto(base)}>
            Descartar
          </Button>
          <Button size="sm" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
            Guardar notas
          </Button>
        </div>
      )}
    </div>
  );
}
