import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectBuscable } from "@/components/ui/select-buscable";
import { NumberInput } from "@/components/ui/number-input";
import { ClienteFormModal } from "@/components/catalogos/ClienteFormModal";
import { mensajeDeError } from "@/lib/errores";
import type { CitaInput } from "@shared/schemas";
import type { CitaRow } from "@shared/types";
import { fechaLocalIso } from "@shared/fechas";
import { AlertaError } from "@/components/ui/alerta-error";

interface NuevaCitaModalProps {
  open: boolean;
  onClose: () => void;
  fechaInicial?: string;
  horaInicial?: string;
  clienteInicial?: string;
  /** Si viene, el modal reagenda/edita esta cita (misma fila) en vez de crear una nueva. */
  citaEditar?: CitaRow | null;
}

export function NuevaCitaModal({
  open,
  onClose,
  fechaInicial,
  horaInicial,
  clienteInicial,
  citaEditar,
}: NuevaCitaModalProps) {
  const queryClient = useQueryClient();
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });
  const { data: servicios = [] } = useQuery({
    queryKey: ["serviciosCatalogo"],
    queryFn: () => window.api.serviciosCatalogo.listar(),
  });

  function vacio(): CitaInput {
    if (citaEditar) {
      return {
        clienteId: citaEditar.clienteId,
        servicioCatalogoId: citaEditar.servicioCatalogoId ?? "",
        fecha: citaEditar.fecha,
        hora: citaEditar.hora,
        duracionMin: citaEditar.duracionMin ?? 60,
        notas: citaEditar.notas ?? "",
      };
    }
    return {
      clienteId: clienteInicial ?? "",
      servicioCatalogoId: "",
      fecha: fechaInicial ?? fechaLocalIso(),
      hora: horaInicial ?? "10:00",
      duracionMin: 60,
      notas: "",
    };
  }
  const [form, setForm] = useState<CitaInput>(vacio);
  const [error, setError] = useState<string | null>(null);
  const [nuevaClienta, setNuevaClienta] = useState(false);

  // El modal permanece montado incluso cerrado (para animaciones), así que `form` no puede
  // inicializarse una sola vez desde las props: cada vez que se abre con una fecha/hora/cliente
  // distintos (ej. clic en otro día del calendario) hay que resincronizarlo explícitamente.
  useEffect(() => {
    if (open) {
      setForm(vacio());
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fechaInicial, horaInicial, clienteInicial, citaEditar]);

  const crear = useMutation({
    mutationFn: () => (citaEditar ? window.api.citas.actualizar(citaEditar.id, form) : window.api.citas.crear(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["citas"] });
      setForm(vacio());
      setError(null);
      onClose();
    },
    onError: (e) =>
      setError(mensajeDeError(e, citaEditar ? "No se pudo reagendar la cita." : "No se pudo crear la cita.")),
  });

  return (
    <>
      <Modal open={open} onClose={onClose} title={citaEditar ? "Reagendar cita" : "Nueva cita"}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Clienta *</label>
            <div className="flex gap-1.5">
              <SelectBuscable
                className="flex-1"
                required
                disabled={!!citaEditar}
                value={form.clienteId}
                onChange={(v) => setForm({ ...form, clienteId: v })}
                placeholder="Selecciona una clienta"
                aria-label="Clienta"
                opciones={clientes.map((c) => ({ value: c.id, label: c.nombreCompleto, detalle: c.codigoCliente }))}
              />
              {!citaEditar && (
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2.5"
                  title="Nueva clienta"
                  onClick={() => setNuevaClienta(true)}
                >
                  <Plus size={16} />
                </Button>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Servicio *</label>
            <SelectBuscable
              required
              value={form.servicioCatalogoId}
              onChange={(v) => {
                const servicio = servicios.find((s) => s.id === v);
                setForm({
                  ...form,
                  servicioCatalogoId: v,
                  duracionMin: servicio?.duracionEstimadaMin ?? form.duracionMin,
                });
              }}
              placeholder="Selecciona un servicio"
              aria-label="Servicio"
              opciones={servicios
                // Al reagendar, el servicio actual se muestra aunque ya esté desactivado.
                .filter((s) => s.activo || s.id === form.servicioCatalogoId)
                .map((s) => ({ value: s.id, label: s.nombre }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Fecha *</label>
              <Input
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Hora *</label>
              <Input
                type="time"
                required
                value={form.hora}
                onChange={(e) => setForm({ ...form, hora: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Duración (min)</label>
              <NumberInput
                placeholder="60"
                value={form.duracionMin}
                onValueChange={(v) => setForm({ ...form, duracionMin: v ?? 60 })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Notas</label>
            <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>

          {error && <AlertaError mensaje={error} />}

          <Button type="submit" disabled={crear.isPending} className="mt-2">
            {citaEditar ? "Guardar nueva fecha" : "Agendar cita"}
          </Button>
        </form>
      </Modal>

      <ClienteFormModal
        open={nuevaClienta}
        onClose={() => setNuevaClienta(false)}
        onGuardado={(cliente) => setForm((f) => ({ ...f, clienteId: cliente.id }))}
      />
    </>
  );
}
