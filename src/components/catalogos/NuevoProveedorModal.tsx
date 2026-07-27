import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import type { Proveedor } from "@shared/types";
import type { ProveedorInput } from "@shared/schemas";

const VACIO: ProveedorInput = {
  nombreComercial: "",
  razonSocial: "",
  contacto: "",
  telefono: "",
  correo: "",
  rfc: "",
  diasCredito: 0,
  categoria: "",
  activo: true,
  notas: "",
};

/**
 * Alta rápida de un proveedor. Para el flujo encadenado basta el nombre comercial y el teléfono;
 * el resto de los datos se completan luego en Configuración. Devuelve el proveedor por `onCreado`
 * para autoseleccionarlo en el formulario que lo abrió.
 */
export function NuevoProveedorModal({
  open,
  onClose,
  onCreado,
}: {
  open: boolean;
  onClose: () => void;
  onCreado: (proveedor: Proveedor) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<ProveedorInput>(VACIO);

  const guardar = useMutation({
    mutationFn: () => window.api.proveedores.crear(form),
    onSuccess: (proveedor) => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      toast.success("Proveedor creado.");
      setForm(VACIO);
      onCreado(proveedor);
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  return (
    <Modal open={open} onClose={onClose} title="Nuevo proveedor">
      <form
        key={open ? "abierto" : "cerrado"}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Nombre comercial *</label>
          <Input
            required
            value={form.nombreComercial}
            onChange={(e) => setForm({ ...form, nombreComercial: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Teléfono</label>
          <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        </div>
        <p className="text-xs text-ink-400">
          Puedes completar el resto de los datos luego en Configuración &gt; Proveedores.
        </p>
        <Button type="submit" disabled={guardar.isPending} className="mt-2 w-full">
          Guardar proveedor
        </Button>
      </form>
    </Modal>
  );
}
