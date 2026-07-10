import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import type { TipoProducto } from "@shared/types";
import type { TipoProductoInput } from "@shared/schemas";

const VACIO: TipoProductoInput = {
  nombreTipo: "",
  requiereCaducidad: true,
  seConsumeEnServicio: false,
  seVende: false,
  activo: true,
};

export function CatalogosTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const eliminarHibrido = useEliminarHibrido();
  const { data: tipos = [] } = useQuery({
    queryKey: ["tiposProducto"],
    queryFn: () => window.api.tiposProducto.listar(),
  });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<TipoProducto | null>(null);
  const [form, setForm] = useState<TipoProductoInput>(VACIO);

  const guardar = useMutation({
    mutationFn: async () => {
      if (editando) return window.api.tiposProducto.actualizar(editando.id, form);
      return window.api.tiposProducto.crear(form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tiposProducto"] });
      setModalAbierto(false);
      toast.success(editando ? "Tipo de producto actualizado." : "Tipo de producto creado.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["tiposProducto"] });
  }

  async function alternarActivo(t: TipoProducto) {
    try {
      await window.api.tiposProducto.setActivo(t.id, !t.activo);
      invalidar();
      toast.success(t.activo ? "Tipo desactivado." : "Tipo activado.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  function eliminar(t: TipoProducto) {
    eliminarHibrido({
      nombre: `el tipo "${t.nombreTipo}"`,
      eliminar: () => window.api.tiposProducto.eliminar(t.id),
      desactivar: () => window.api.tiposProducto.setActivo(t.id, false),
      onExito: invalidar,
    });
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setModalAbierto(true);
  }

  function abrirEditar(t: TipoProducto) {
    setEditando(t);
    setForm({
      nombreTipo: t.nombreTipo,
      requiereCaducidad: t.requiereCaducidad,
      seConsumeEnServicio: t.seConsumeEnServicio,
      seVende: t.seVende,
      activo: t.activo,
    });
    setModalAbierto(true);
  }

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-500">Tipos o categorías de producto (sueros, cremas, equipos...)</p>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo tipo
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Caducidad</th>
              <th className="px-4 py-2">Consume en servicio</th>
              <th className="px-4 py-2">Se vende</th>
              <th className="px-4 py-2">Estatus</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t.id} className="border-t border-beige-200">
                <td className="px-4 py-2 font-medium text-ink-900">{t.nombreTipo}</td>
                <td className="px-4 py-2">{t.requiereCaducidad ? "Sí" : "No"}</td>
                <td className="px-4 py-2">{t.seConsumeEnServicio ? "Sí" : "No"}</td>
                <td className="px-4 py-2">{t.seVende ? "Sí" : "No"}</td>
                <td className="px-4 py-2">
                  <Badge variant={t.activo ? "success" : "neutral"}>{t.activo ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(t)} title="Editar">
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => alternarActivo(t)}
                      title={t.activo ? "Desactivar" : "Activar"}
                    >
                      {t.activo ? <PowerOff size={14} /> : <Power size={14} />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => eliminar(t)} title="Eliminar">
                      <Trash2 size={14} className="text-danger-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {tipos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  Aún no hay tipos de producto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? "Editar tipo de producto" : "Nuevo tipo de producto"}
      >
        <form
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
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />
            Activo
          </label>
          <Button type="submit" disabled={guardar.isPending} className="mt-2">
            Guardar
          </Button>
        </form>
      </Modal>
    </div>
  );
}
