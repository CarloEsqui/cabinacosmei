import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import type { TipoProducto } from "@shared/types";
import type { TipoProductoInput } from "@shared/schemas";

const VACIO: TipoProductoInput = {
  nombreTipo: "",
  requiereCaducidad: true,
  seConsumeEnServicio: false,
  seVende: false,
  activo: true,
};

/**
 * Alta rápida de una categoría de producto. Mismos campos que Configuración > Catálogos (nombre +
 * 3 características). Al crear, devuelve la categoría por `onCreado` para autoseleccionarla en el
 * formulario que la abrió.
 */
export function NuevaCategoriaModal({
  open,
  onClose,
  onCreado,
}: {
  open: boolean;
  onClose: () => void;
  onCreado: (tipo: TipoProducto) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<TipoProductoInput>(VACIO);

  const guardar = useMutation({
    mutationFn: () => window.api.tiposProducto.crear(form),
    onSuccess: (tipo) => {
      queryClient.invalidateQueries({ queryKey: ["tiposProducto"] });
      toast.success("Categoría creada.");
      setForm(VACIO);
      onCreado(tipo);
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nueva categoría">
      <form
        key={open ? "abierto" : "cerrado"}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Nombre *</label>
          <Input
            required
            value={form.nombreTipo}
            onChange={(e) => setForm({ ...form, nombreTipo: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.requiereCaducidad}
            onChange={(e) => setForm({ ...form, requiereCaducidad: e.target.checked })}
          />
          Requiere control por caducidad
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.seConsumeEnServicio}
            onChange={(e) => setForm({ ...form, seConsumeEnServicio: e.target.checked })}
          />
          Se consume en servicios
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.seVende}
            onChange={(e) => setForm({ ...form, seVende: e.target.checked })}
          />
          Se vende al cliente
        </label>
        <Button type="submit" disabled={guardar.isPending} className="mt-2 w-full">
          Guardar categoría
        </Button>
      </form>
    </Modal>
  );
}
