import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import type { ServicioCatalogo } from "@shared/types";
import type { ServicioCatalogoInput } from "@shared/schemas";

const VACIO: ServicioCatalogoInput = {
  nombre: "",
  categoriaServicio: "",
  duracionEstimadaMin: 60,
  precioSugerido: 0,
  periodicidadMantenimientoDias: null,
  activo: true,
  descripcion: "",
  notasInternas: "",
  consumeInventario: false,
};

export function ServiciosTab() {
  const queryClient = useQueryClient();
  const { data: servicios = [] } = useQuery({
    queryKey: ["serviciosCatalogo"],
    queryFn: () => window.api.serviciosCatalogo.listar(),
  });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<ServicioCatalogo | null>(null);
  const [form, setForm] = useState<ServicioCatalogoInput>(VACIO);

  const guardar = useMutation({
    mutationFn: async () => {
      if (editando) return window.api.serviciosCatalogo.actualizar(editando.id, form);
      return window.api.serviciosCatalogo.crear(form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviciosCatalogo"] });
      setModalAbierto(false);
    },
  });

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setModalAbierto(true);
  }

  function abrirEditar(s: ServicioCatalogo) {
    setEditando(s);
    setForm({
      nombre: s.nombre,
      categoriaServicio: s.categoriaServicio ?? "",
      duracionEstimadaMin: s.duracionEstimadaMin,
      precioSugerido: s.precioSugerido ?? 0,
      periodicidadMantenimientoDias: s.periodicidadMantenimientoDias,
      activo: s.activo,
      descripcion: s.descripcion ?? "",
      notasInternas: s.notasInternas ?? "",
      consumeInventario: s.consumeInventario,
    });
    setModalAbierto(true);
  }

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-500">
          Catálogo de servicios (limpieza facial, radiofrecuencia, microneedling...)
        </p>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo servicio
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Categoría</th>
              <th className="px-4 py-2">Precio sugerido</th>
              <th className="px-4 py-2">Mantenimiento</th>
              <th className="px-4 py-2">Estatus</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {servicios.map((s) => (
              <tr key={s.id} className="border-t border-beige-200">
                <td className="px-4 py-2 font-medium text-ink-900">{s.nombre}</td>
                <td className="px-4 py-2 text-ink-700">{s.categoriaServicio || "—"}</td>
                <td className="px-4 py-2 text-ink-700">${(s.precioSugerido ?? 0).toFixed(2)}</td>
                <td className="px-4 py-2 text-ink-700">
                  {s.periodicidadMantenimientoDias ? `cada ${s.periodicidadMantenimientoDias} días` : "—"}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={s.activo ? "success" : "neutral"}>{s.activo ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => abrirEditar(s)}>
                    <Pencil size={14} />
                  </Button>
                </td>
              </tr>
            ))}
            {servicios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  Aún no hay servicios en el catálogo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? "Editar servicio" : "Nuevo servicio"}
      >
        <form
          key={editando?.id ?? "nuevo"}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Nombre *</label>
            <Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Categoría</label>
            <Input
              value={form.categoriaServicio}
              onChange={(e) => setForm({ ...form, categoriaServicio: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Duración estimada (min)</label>
              <NumberInput
                allowNull
                placeholder="60"
                value={form.duracionEstimadaMin ?? null}
                onValueChange={(v) => setForm({ ...form, duracionEstimadaMin: v })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Precio sugerido</label>
              <NumberInput
                placeholder="0.00"
                value={form.precioSugerido}
                onValueChange={(v) => setForm({ ...form, precioSugerido: v ?? 0 })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">
              Periodicidad de mantenimiento (días)
            </label>
            <NumberInput
              allowNull
              placeholder="Sin mantenimiento sugerido"
              value={form.periodicidadMantenimientoDias ?? null}
              onValueChange={(v) => setForm({ ...form, periodicidadMantenimientoDias: v })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Descripción</label>
            <Input
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.consumeInventario}
              onChange={(e) => setForm({ ...form, consumeInventario: e.target.checked })}
            />
            Consume inventario (sugiere insumos al cerrar la cita)
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

        {editando && <RecetaEditor servicioCatalogoId={editando.id} />}
      </Modal>
    </div>
  );
}

interface FilaReceta {
  productoId: string;
  cantidadSugerida: number;
}

function RecetaEditor({ servicioCatalogoId }: { servicioCatalogoId: string }) {
  const queryClient = useQueryClient();
  const { data: receta = [] } = useQuery({
    queryKey: ["recetaServicio", servicioCatalogoId],
    queryFn: () => window.api.serviciosCatalogo.listarReceta(servicioCatalogoId),
  });
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });

  const [filas, setFilas] = useState<FilaReceta[] | null>(null);
  const activas = filas ?? receta.map((r) => ({ productoId: r.productoId, cantidadSugerida: r.cantidadSugerida }));

  const guardar = useMutation({
    mutationFn: () =>
      window.api.serviciosCatalogo.guardarReceta({
        servicioCatalogoId,
        items: activas.filter((f) => f.productoId && f.cantidadSugerida > 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recetaServicio", servicioCatalogoId] });
      setFilas(null);
    },
  });

  function actualizar(i: number, cambios: Partial<FilaReceta>) {
    setFilas(activas.map((f, idx) => (idx === i ? { ...f, ...cambios } : f)));
  }
  function agregar() {
    setFilas([...activas, { productoId: "", cantidadSugerida: 1 }]);
  }
  function quitar(i: number) {
    setFilas(activas.filter((_, idx) => idx !== i));
  }

  return (
    <div className="mt-5 border-t border-beige-300 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-jacaranda-700">Insumos por defecto</h3>
        <Button type="button" variant="ghost" size="sm" onClick={agregar}>
          <Plus size={14} /> Agregar
        </Button>
      </div>
      <p className="mb-2 text-xs text-ink-500">
        Se precargan automáticamente en "Productos consumidos" al cerrar una cita de este servicio.
      </p>
      {activas.length === 0 && <p className="text-xs text-ink-500">Ningún insumo definido.</p>}
      <div className="flex flex-col gap-2">
        {activas.map((fila, i) => (
          <div key={i} className="flex gap-2">
            <Select
              className="flex-1"
              value={fila.productoId}
              onChange={(e) => actualizar(i, { productoId: e.target.value })}
            >
              <option value="">Selecciona un producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
            <NumberInput
              className="w-24"
              placeholder="1"
              value={fila.cantidadSugerida}
              onValueChange={(v) => actualizar(i, { cantidadSugerida: v ?? 1 })}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => quitar(i)}>
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
      {filas && (
        <Button type="button" size="sm" className="mt-3" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
          Guardar insumos
        </Button>
      )}
    </div>
  );
}
