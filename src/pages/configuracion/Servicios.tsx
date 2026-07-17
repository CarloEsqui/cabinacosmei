import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Power, PowerOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Expandable } from "@/components/ui/expandable";
import { formatMoneda } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
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
  const toast = useToast();
  const eliminarHibrido = useEliminarHibrido();
  const { data: servicios = [] } = useQuery({
    queryKey: ["serviciosCatalogo"],
    queryFn: () => window.api.serviciosCatalogo.listar(),
  });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<ServicioCatalogo | null>(null);
  const [form, setForm] = useState<ServicioCatalogoInput>(VACIO);
  // Insumos capturados para un servicio que TODAVÍA no existe (mientras se crea). Se persisten
  // justo después de crear el servicio, cuando ya hay un id al cual asociarlos.
  const [recetaNueva, setRecetaNueva] = useState<FilaReceta[]>([]);

  const guardar = useMutation({
    mutationFn: async () => {
      if (editando) return window.api.serviciosCatalogo.actualizar(editando.id, form);
      const creado = await window.api.serviciosCatalogo.crear(form);
      const items = recetaNueva.filter((f) => f.productoId && f.cantidadSugerida > 0);
      if (creado && form.consumeInventario && items.length > 0) {
        await window.api.serviciosCatalogo.guardarReceta({ servicioCatalogoId: creado.id, items });
      }
      return creado;
    },
    onSuccess: (servicio) => {
      queryClient.invalidateQueries({ queryKey: ["serviciosCatalogo"] });
      if (editando) {
        setModalAbierto(false);
        toast.success("Servicio actualizado.");
      } else {
        // En vez de cerrar, se deja el modal abierto sobre el servicio recién creado para poder
        // seguir ajustando su plantilla de insumos (los que ya se capturaron durante la creación
        // ya quedaron guardados arriba).
        queryClient.invalidateQueries({ queryKey: ["recetaServicio", servicio?.id] });
        setRecetaNueva([]);
        setEditando(servicio);
        toast.success("Servicio creado.");
      }
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["serviciosCatalogo"] });
  }

  async function alternarActivo(s: ServicioCatalogo) {
    try {
      await window.api.serviciosCatalogo.setActivo(s.id, !s.activo);
      invalidar();
      toast.success(s.activo ? "Servicio desactivado." : "Servicio activado.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  function eliminar(s: ServicioCatalogo) {
    eliminarHibrido({
      nombre: `el servicio "${s.nombre}"`,
      eliminar: () => window.api.serviciosCatalogo.eliminar(s.id),
      desactivar: () => window.api.serviciosCatalogo.setActivo(s.id, false),
      onExito: invalidar,
    });
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setRecetaNueva([]);
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

      <Card className="overflow-x-auto">
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
                <td className="px-4 py-2 tabular-nums text-ink-700">{formatMoneda(s.precioSugerido)}</td>
                <td className="px-4 py-2 text-ink-700">
                  {s.periodicidadMantenimientoDias ? `cada ${s.periodicidadMantenimientoDias} días` : "—"}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={s.activo ? "success" : "neutral"}>{s.activo ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(s)} title="Editar">
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => alternarActivo(s)}
                      title={s.activo ? "Desactivar" : "Activar"}
                    >
                      {s.activo ? <PowerOff size={14} /> : <Power size={14} />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => eliminar(s)} title="Eliminar">
                      <Trash2 size={14} className="text-danger-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {servicios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6">
                  <EmptyState icon={Sparkles} mensaje="Aún no hay servicios en el catálogo." submensaje="Agrega tu primer servicio con el botón de arriba." />
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

        <Expandable open={form.consumeInventario}>
          {editando ? (
            <RecetaEditor servicioCatalogoId={editando.id} />
          ) : (
            <RecetaEditor value={recetaNueva} onChange={setRecetaNueva} />
          )}
        </Expandable>
      </Modal>
    </div>
  );
}

interface FilaReceta {
  productoId: string;
  cantidadSugerida: number;
}

/**
 * Editor de la plantilla de insumos de un servicio. Dos modos:
 * - Persistido (`servicioCatalogoId`): carga y guarda contra el servidor (servicio ya existente).
 * - Buffer (`value` + `onChange`): edita un arreglo en memoria del padre, sin tocar el servidor,
 *   para poder capturar insumos de un servicio que aún no se ha creado.
 */
function RecetaEditor({
  servicioCatalogoId,
  value,
  onChange,
}: {
  servicioCatalogoId?: string;
  value?: FilaReceta[];
  onChange?: (filas: FilaReceta[]) => void;
}) {
  const persistido = !!servicioCatalogoId;
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: receta = [] } = useQuery({
    queryKey: ["recetaServicio", servicioCatalogoId],
    queryFn: () => window.api.serviciosCatalogo.listarReceta(servicioCatalogoId!),
    enabled: persistido,
  });
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });

  // En modo persistido, las ediciones sin guardar viven aquí (null = todavía sin cambios). En modo
  // buffer, las filas viven en el padre vía value/onChange.
  const [filas, setFilas] = useState<FilaReceta[] | null>(null);
  const activas = persistido
    ? filas ?? receta.map((r) => ({ productoId: r.productoId, cantidadSugerida: r.cantidadSugerida }))
    : value ?? [];

  function setActivas(nuevas: FilaReceta[]) {
    if (persistido) setFilas(nuevas);
    else onChange?.(nuevas);
  }

  const guardar = useMutation({
    mutationFn: () =>
      window.api.serviciosCatalogo.guardarReceta({
        servicioCatalogoId: servicioCatalogoId!,
        items: activas.filter((f) => f.productoId && f.cantidadSugerida > 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recetaServicio", servicioCatalogoId] });
      setFilas(null);
      toast.success("Insumos guardados.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  function actualizar(i: number, cambios: Partial<FilaReceta>) {
    setActivas(activas.map((f, idx) => (idx === i ? { ...f, ...cambios } : f)));
  }
  function agregar() {
    setActivas([...activas, { productoId: "", cantidadSugerida: 1 }]);
  }
  function quitar(i: number) {
    setActivas(activas.filter((_, idx) => idx !== i));
  }

  return (
    <div className="mt-5 border-t border-beige-300 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-jacaranda-700">Plantilla de insumos (por defecto)</h3>
        <Button type="button" variant="ghost" size="sm" onClick={agregar}>
          <Plus size={14} /> Agregar
        </Button>
      </div>
      <p className="mb-2 text-xs text-ink-500">
        Se precargan automáticamente en "Productos consumidos" al cerrar una cita de este servicio.
        {!persistido && " Se guardarán junto con el servicio."}
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
      {persistido && filas && (
        <Button type="button" size="sm" className="mt-3" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
          Guardar insumos
        </Button>
      )}
    </div>
  );
}
