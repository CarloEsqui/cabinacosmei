import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Power, PowerOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionPaquete } from "@/components/ui/ilustraciones";
import { ProductoFormModal } from "@/components/catalogos/ProductoFormModal";
import { formatMoneda } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import type { Producto } from "@shared/types";

type OrdenKey = "nombre" | "precioVenta";

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

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);

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
    setModalAbierto(true);
  }

  function abrirEditar(p: Producto) {
    setEditando(p);
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
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
          placeholder="Todas las categorías"
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
        <Button size="sm" className="ml-auto" onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo producto
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="tabla-bellora">
          <thead>
            <tr>
              <SortableHeader label="Nombre" sortKey="nombre" activo={orden} direccion={direccion} onSort={alternarOrden} />
              <th>SKU</th>
              <th>Categoría</th>
              <th>Presentación</th>
              <th className="num">Precio base</th>
              <SortableHeader
                label="Precio venta"
                sortKey="precioVenta"
                activo={orden}
                direccion={direccion}
                onSort={alternarOrden}
                className="num"
              />
              <th>Estatus</th>
              <th></th>
            </tr>
          </thead>
          <tbody key={`${filtrosTipo.join()}|${filtrosEstatus.join()}|${orden}|${direccion}`} className="aparecer-suave">
            {filtrados.map((p) => (
              <tr key={p.id}>
                <td className="font-medium text-ink-900">{p.nombre}</td>
                <td>{p.sku || "—"}</td>
                <td>{nombreTipo(p.tipoProductoId)}</td>
                <td>
                  {p.presentacion
                    ? p.contenidoCantidad && p.contenidoUnidad
                      ? `${p.presentacion} · ${p.contenidoCantidad} ${p.contenidoUnidad}`
                      : p.presentacion
                    : "—"}
                </td>
                <td className="num">{formatMoneda(p.costoBase)}</td>
                <td className="num">{formatMoneda(p.precioVenta)}</td>
                <td>
                  <Badge variant={p.activo ? "success" : "neutral"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="group" onClick={() => abrirEditar(p)} title="Editar">
                      <Pencil size={14} className="text-ink-400 transition-colors group-hover:text-ink-900" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="group"
                      onClick={() => alternarActivo(p)}
                      title={p.activo ? "Desactivar" : "Activar"}
                    >
                      {p.activo ? (
                        <PowerOff size={14} className="text-ink-400 transition-colors group-hover:text-warning-500" />
                      ) : (
                        <Power size={14} className="text-ink-400 transition-colors group-hover:text-success-500" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" className="group" onClick={() => eliminar(p)} title="Eliminar">
                      <Trash2 size={14} className="text-ink-400 transition-colors group-hover:text-danger-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8">
                  {productos.length === 0 ? (
                    <EmptyState
                      ilustracion={IlustracionPaquete}
                      mensaje="Aún no hay productos registrados."
                      submensaje="Crea tu primer producto con el botón de arriba."
                    />
                  ) : (
                    <EmptyState icon={Search} mensaje="Ningún producto coincide con los filtros." />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtrados.length > 0 && (
          <div className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-500">
            Mostrando {filtrados.length} de {productos.length} productos
          </div>
        )}
      </Card>

      <ProductoFormModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        producto={editando}
      />
    </div>
  );
}
