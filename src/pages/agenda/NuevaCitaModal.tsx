import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import type { CitaInput } from "@shared/schemas";

const HOY = new Date().toISOString().slice(0, 10);

interface NuevaCitaModalProps {
  open: boolean;
  onClose: () => void;
  fechaInicial?: string;
}

export function NuevaCitaModal({ open, onClose, fechaInicial }: NuevaCitaModalProps) {
  const queryClient = useQueryClient();
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });
  const { data: servicios = [] } = useQuery({
    queryKey: ["serviciosCatalogo"],
    queryFn: () => window.api.serviciosCatalogo.listar(),
  });

  const vacio: CitaInput = {
    clienteId: "",
    servicioCatalogoId: "",
    fecha: fechaInicial ?? HOY,
    hora: "10:00",
    duracionMin: 60,
    notas: "",
  };
  const [form, setForm] = useState<CitaInput>(vacio);
  const [error, setError] = useState<string | null>(null);

  const crear = useMutation({
    mutationFn: () => window.api.citas.crear(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["citas"] });
      setForm(vacio);
      setError(null);
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo crear la cita."),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nueva cita">
      <form
        key={open ? fechaInicial : "cerrado"}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Clienta *</label>
          <Select
            required
            value={form.clienteId}
            onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
          >
            <option value="">Selecciona una clienta</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombreCompleto}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Servicio *</label>
          <Select
            required
            value={form.servicioCatalogoId}
            onChange={(e) => {
              const servicio = servicios.find((s) => s.id === e.target.value);
              setForm({
                ...form,
                servicioCatalogoId: e.target.value,
                duracionMin: servicio?.duracionEstimadaMin ?? form.duracionMin,
              });
            }}
          >
            <option value="">Selecciona un servicio</option>
            {servicios
              .filter((s) => s.activo)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
          </Select>
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

        {error && <p className="text-sm text-danger-500">{error}</p>}

        <Button type="submit" disabled={crear.isPending} className="mt-2">
          Agendar cita
        </Button>
      </form>
    </Modal>
  );
}
