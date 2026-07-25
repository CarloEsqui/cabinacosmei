import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import type { Cliente } from "@shared/types";
import type { ClienteInput } from "@shared/schemas";

const VACIO: ClienteInput = {
  nombreCompleto: "",
  telefono: "",
  correo: "",
  fechaNacimiento: "",
  direccion: "",
  contactoEmergencia: "",
  activo: true,
  notas: "",
  observaciones: "",
};

function desde(c: Cliente): ClienteInput {
  return {
    nombreCompleto: c.nombreCompleto,
    telefono: c.telefono ?? "",
    correo: c.correo ?? "",
    fechaNacimiento: c.fechaNacimiento ?? "",
    direccion: c.direccion ?? "",
    contactoEmergencia: c.contactoEmergencia ?? "",
    activo: c.activo,
    notas: c.notas ?? "",
    observaciones: c.observaciones ?? "",
  };
}

/**
 * Formulario completo de clienta en un modal, reutilizable tanto en la página Clientes como en el
 * alta rápida desde una cita (modal apilado que autoselecciona a la recién creada vía `onGuardado`).
 */
export function ClienteFormModal({
  open,
  onClose,
  cliente = null,
  onGuardado,
}: {
  open: boolean;
  onClose: () => void;
  cliente?: Cliente | null;
  onGuardado?: (c: Cliente) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<ClienteInput>(cliente ? desde(cliente) : VACIO);
  const [sesion, setSesion] = useState(0);

  // El modal se mantiene montado (para conservar su animación de salida), así que al abrirlo hay
  // que reinicializar el formulario con la clienta en edición o en blanco.
  useEffect(() => {
    if (!open) return;
    setForm(cliente ? desde(cliente) : VACIO);
    setSesion((s) => s + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cliente?.id]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (cliente) return window.api.clientes.actualizar(cliente.id, form);
      return window.api.clientes.crear(form);
    },
    onSuccess: (guardada) => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast.success(cliente ? "Clienta actualizada." : "Clienta creada.");
      if (guardada && onGuardado) onGuardado(guardada);
      onClose();
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  return (
    <Modal open={open} onClose={onClose} title={cliente ? "Editar clienta" : "Nueva clienta"}>
      <form
        key={`${cliente?.id ?? "nueva"}-${sesion}`}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <Field label="Nombre completo *">
          <Input
            required
            value={form.nombreCompleto}
            onChange={(e) => setForm({ ...form, nombreCompleto: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono">
            <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Field>
          <Field label="Correo">
            <Input
              type="email"
              value={form.correo}
              onChange={(e) => setForm({ ...form, correo: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de nacimiento">
            <Input
              type="date"
              value={form.fechaNacimiento}
              onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
            />
          </Field>
          <Field label="Contacto de emergencia">
            <Input
              value={form.contactoEmergencia}
              onChange={(e) => setForm({ ...form, contactoEmergencia: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Dirección">
          <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        </Field>
        <Field label="Notas">
          <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })}
          />
          Activo
        </label>
        {!cliente && (
          <p className="text-xs text-ink-500">
            Al guardar se creará automáticamente la carpeta local de esta clienta.
          </p>
        )}
        <Button type="submit" disabled={guardar.isPending} className="mt-2">
          Guardar
        </Button>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-500">{label}</label>
      {children}
    </div>
  );
}
