import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import type { Producto } from "@shared/types";
import type { ProductoInput } from "@shared/schemas";

type OrdenKey = "nombre" | "precioVenta";

const VACIO: ProductoInput = {
  nombre: "",
  linea: "",
  tipoProductoId: null,
  unidadMedida: "",
  proveedorPrincipalId: null,
  costoBase: 0,
  precioVenta: 0,
  stockMinimoManual: null,
  ubicacion: "",
  presentacion: "",
  activo: true,
  observaciones: "",
};

export function ProductosTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const eliminarHibrido = useEliminarHibrido();
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ["tiposProducto"],
    queryFn: () => window.api.tiposProducto.listar(),
  });
  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: () => window.api.proveedores.listar(),
  });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<ProductoInput>(VACIO);

  const guardar = useMutation({
    mutationFn: async () => {
      if (editando) return window.api.productos.actualizar(editando.id, form);
      return window.api.productos.crear(form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
      setModalAbierto(false);
      toast.success(editando ? "Producto actualizado." : "Producto creado.");
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["productos"] });
    queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
  }

  async function alternarActivo(p: Producto) {
    try {
      await window.api.productos.setActivo(p.id, !p.activo);
      invalidar();
      toast.success(p.activo ? "Producto desactivado." : "Producto activado.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  function eliminar(p: Producto) {
    eliminarHibrido({
      nombre: `el producto "${p.nombre}"`,
      eliminar: () => window.api.productos.eliminar(p.id),
      desactivar: () => window.api.productos.setActivo(p.id, false),
      onExito: invalidar,
    });
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setModalAbierto(true);
  }

  function abrirEditar(p: Producto) {
    setEditando(p);
    setForm({
      nombre: p.nombre,
      linea: p.linea ?? "",
      tipoProductoId: p.tipoProductoId,
      unidadMedida: p.unidadMedida ?? "",
      proveedorPrincipalId: p.proveedorPrincipalId,
      costoBase: p.costoBase ?? 0,
      precioVenta: p.precioVenta ?? 0,
      stockMinimoManual: p.stockMinimoManual,
      ubicacion: p.ubicacion ?? "",
      presentacion: p.presentacion ?? "",
      activo: p.activo,
      observaciones: p.observaciones ?? "",
    });
    setModalAbierto(true);
  }

  function nombreTipo(id: string | null) {
    return tipos.find((t) => t.id === id)?.nombreTipo ?? "—";
  }

  const [busqueda, setBusqueda] = useState("");
  const [filtrosTipo, setFiltrosTipo] = useState<string[]>([]);
  const [filtrosEstatus, setFiltrosEstatus] = useState<string[]>([]);
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
    let lista = productos.filter((p) => {
      if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
      if (filtrosTipo.length > 0 && !filtrosTipo.includes(p.tipoProductoId ?? "")) return false;
      if (filtrosEstatus.length > 0 && !filtrosEstatus.includes(p.activo ? "activo" : "inactivo")) return false;
      return true;
    });
    lista = [...lista].sort((a, b) => {
      const cmp =
        orden === "nombre" ? a.nombre.localeCompare(b.nombre) : (a.precioVenta ?? 0) - (b.precioVenta ?? 0);
      return direccion === "asc" ? cmp : -cmp;
    });
    return lista;
  }, [productos, busqueda, filtrosTipo, filtrosEstatus, orden, direccion]);

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-500">{productos.length} productos registrados</p>
        <Button size="sm" onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo producto
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <MultiSelect
          options={tipos.map((t) => ({ value: t.id, label: t.nombreTipo }))}
          selected={filtrosTipo}
          onChange={setFiltrosTipo}
          placeholder="Todos los tipos"
          className="max-w-[180px]"
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
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <SortableHeader label="Nombre" sortKey="nombre" activo={orden} direccion={direccion} onSort={alternarOrden} />
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Tipo</th>
              <SortableHeader
                label="Precio venta"
                sortKey="precioVenta"
                activo={orden}
                direccion={direccion}
                onSort={alternarOrden}
              />
              <th className="px-4 py-2">Estatus</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => (
              <tr key={p.id} className="border-t border-beige-200">
                <td className="px-4 py-2 font-medium text-ink-900">{p.nombre}</td>
                <td className="px-4 py-2 text-ink-700">{p.sku || "—"}</td>
                <td className="px-4 py-2 text-ink-700">{nombreTipo(p.tipoProductoId)}</td>
                <td className="px-4 py-2 text-ink-700">${(p.precioVenta ?? 0).toFixed(2)}</td>
                <td className="px-4 py-2">
                  <Badge variant={p.activo ? "success" : "neutral"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(p)} title="Editar">
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => alternarActivo(p)}
                      title={p.activo ? "Desactivar" : "Activar"}
                    >
                      {p.activo ? <PowerOff size={14} /> : <Power size={14} />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => eliminar(p)} title="Eliminar">
                      <Trash2 size={14} className="text-danger-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  {productos.length === 0
                    ? "Aún no hay productos registrados."
                    : "Ningún producto coincide con los filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? "Editar producto" : "Nuevo producto"}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">SKU</label>
              <p className="flex h-10 items-center text-sm text-ink-500">
                {editando?.sku || "Se genera automáticamente"}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Línea / marca</label>
              <Input value={form.linea ?? ""} onChange={(e) => setForm({ ...form, linea: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Tipo de producto</label>
              <Select
                value={form.tipoProductoId ?? ""}
                onChange={(e) => setForm({ ...form, tipoProductoId: e.target.value || null })}
              >
                <option value="">Sin tipo</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombreTipo}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Proveedor principal</label>
              <Select
                value={form.proveedorPrincipalId ?? ""}
                onChange={(e) => setForm({ ...form, proveedorPrincipalId: e.target.value || null })}
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombreComercial}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Costo base</label>
              <NumberInput
                step="0.01"
                placeholder="0.00"
                value={form.costoBase}
                onValueChange={(v) => setForm({ ...form, costoBase: v ?? 0 })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Precio de venta</label>
              <NumberInput
                step="0.01"
                placeholder="0.00"
                value={form.precioVenta}
                onValueChange={(v) => setForm({ ...form, precioVenta: v ?? 0 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Unidad de medida</label>
              <Input
                value={form.unidadMedida ?? ""}
                onChange={(e) => setForm({ ...form, unidadMedida: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Stock mínimo manual</label>
              <NumberInput
                allowNull
                placeholder="Usar umbral general"
                value={form.stockMinimoManual ?? null}
                onValueChange={(v) => setForm({ ...form, stockMinimoManual: v })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Ubicación física</label>
            <Input value={form.ubicacion ?? ""} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
          </div>
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
