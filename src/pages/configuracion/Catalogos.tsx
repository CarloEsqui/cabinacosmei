import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Power, PowerOff, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionDocumento } from "@/components/ui/ilustraciones";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import type { TipoProducto } from "@shared/types";
import type { TipoProductoInput } from "@shared/schemas";

type OrdenKey = "nombre";
type Caracteristica = "requiereCaducidad" | "seConsumeEnServicio" | "seVende";

const OPCIONES_CARACTERISTICAS: { value: Caracteristica; label: string }[] = [
  { value: "requiereCaducidad", label: "Requiere caducidad" },
  { value: "seConsumeEnServicio", label: "Se consume en servicio" },
  { value: "seVende", label: "Se vende" },
];

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
      toast.success(editando ? "Categoría actualizada." : "Categoría creada.");
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
      toast.success(t.activo ? "Categoría desactivada." : "Categoría activada.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  function eliminar(t: TipoProducto) {
    eliminarHibrido({
      nombre: `la categoría "${t.nombreTipo}"`,
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

  const [busqueda, setBusqueda] = useState("");
  const [filtrosEstatus, setFiltrosEstatus] = useState<string[]>([]);
  const [filtrosCaracteristicas, setFiltrosCaracteristicas] = useState<string[]>([]);
  const [orden, setOrden] = useState<OrdenKey>("nombre");
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");

  function alternarOrden(key: OrdenKey) {
    if (orden === key) {
      setDireccion(direccion === "asc" ? "desc" : "asc");
    } else {
      setOrden(key);
      setDireccion("asc");
    }
  }

  const filtrados = useMemo(() => {
    let lista = tipos.filter((t) => {
      if (busqueda && !t.nombreTipo.toLowerCase().includes(busqueda.toLowerCase())) return false;
      if (filtrosEstatus.length > 0 && !filtrosEstatus.includes(t.activo ? "activo" : "inactivo")) return false;
      if (filtrosCaracteristicas.length > 0 && !filtrosCaracteristicas.every((c) => t[c as Caracteristica])) return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      const cmp = a.nombreTipo.localeCompare(b.nombreTipo);
      return direccion === "asc" ? cmp : -cmp;
    });
    return lista;
  }, [tipos, busqueda, filtrosEstatus, filtrosCaracteristicas, direccion]);

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar categoría..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <MultiSelect
          options={[
            { value: "activo", label: "Activo" },
            { value: "inactivo", label: "Inactivo" },
          ]}
          selected={filtrosEstatus}
          onChange={setFiltrosEstatus}
          placeholder="Todos los estatus"
          className="max-w-[160px]"
        />
        <MultiSelect
          options={OPCIONES_CARACTERISTICAS}
          selected={filtrosCaracteristicas}
          onChange={setFiltrosCaracteristicas}
          placeholder="Todas las características"
          className="max-w-[220px]"
        />
        <Button size="sm" className="ml-auto" onClick={abrirNuevo}>
          <Plus size={16} /> Nueva categoría
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="tabla-bellora">
          <thead>
            <tr>
              <SortableHeader label="Nombre" sortKey="nombre" activo={orden} direccion={direccion} onSort={alternarOrden} />
              <th className="text-center">Caducidad</th>
              <th className="text-center">Consume en servicio</th>
              <th className="text-center">Se vende</th>
              <th>Estatus</th>
              <th></th>
            </tr>
          </thead>
          <tbody
            key={`${filtrosEstatus.join()}|${filtrosCaracteristicas.join()}|${orden}|${direccion}`}
            className="aparecer-suave"
          >
            {filtrados.map((t) => (
              <tr key={t.id}>
                <td className="font-medium text-ink-900">{t.nombreTipo}</td>
                <td><Booleano valor={t.requiereCaducidad} /></td>
                <td><Booleano valor={t.seConsumeEnServicio} /></td>
                <td><Booleano valor={t.seVende} /></td>
                <td>
                  <Badge variant={t.activo ? "success" : "neutral"}>{t.activo ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="group" onClick={() => abrirEditar(t)} title="Editar">
                      <Pencil size={14} className="text-ink-400 transition-colors group-hover:text-ink-900" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="group"
                      onClick={() => alternarActivo(t)}
                      title={t.activo ? "Desactivar" : "Activar"}
                    >
                      {t.activo ? (
                        <PowerOff size={14} className="text-ink-400 transition-colors group-hover:text-warning-500" />
                      ) : (
                        <Power size={14} className="text-ink-400 transition-colors group-hover:text-success-500" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" className="group" onClick={() => eliminar(t)} title="Eliminar">
                      <Trash2 size={14} className="text-ink-400 transition-colors group-hover:text-danger-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8">
                  {tipos.length === 0 ? (
                    <EmptyState
                      ilustracion={IlustracionDocumento}
                      mensaje="Aún no hay categorías."
                      submensaje="Crea una con el botón de arriba."
                    />
                  ) : (
                    <EmptyState icon={Search} mensaje="Ninguna categoría coincide con los filtros." />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtrados.length > 0 && (
          <div className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-500">
            Mostrando {filtrados.length} de {tipos.length} categorías
          </div>
        )}
      </Card>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? "Editar categoría" : "Nueva categoría"}
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

/** Celda de columna booleana §2: icono en vez de "Sí/No" en texto plano. */
function Booleano({ valor }: { valor: boolean }) {
  return (
    <div className="flex justify-center">
      {valor ? <Check size={16} className="text-success-500" /> : <span className="text-ink-300">—</span>}
    </div>
  );
}
