import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Pencil, Lock, Unlock, Trash2, Boxes } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, semaforoVariant } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import { formatFecha } from "@/lib/format";
import type { Lote } from "@shared/types";
import type { LoteInput } from "@shared/schemas";

type OrdenKey = "nombre" | "stockTotal" | "loteMasProximoACaducar";

export function ResumenTab() {
  const { data: productos = [] } = useQuery({
    queryKey: ["inventarioResumen"],
    queryFn: () => window.api.inventario.resumen(),
  });
  const [expandido, setExpandido] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const [busqueda, setBusqueda] = useState("");
  const [filtrosTipo, setFiltrosTipo] = useState<string[]>([]);
  const [filtrosProveedor, setFiltrosProveedor] = useState<string[]>([]);
  const [filtrosSemaforo, setFiltrosSemaforo] = useState<string[]>(
    () => searchParams.get("semaforo")?.split(",").filter(Boolean) ?? [],
  );
  const [orden, setOrden] = useState<OrdenKey>("nombre");
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");

  // Si se llega desde un enlace (ej. la tarjeta "Stock bajo" del Dashboard, que puede traer
  // varios estados a la vez: "critico,bajo") mientras esta pestaña ya estaba montada, el filtro
  // debe reaccionar al cambio de la URL.
  useEffect(() => {
    const semaforo = searchParams.get("semaforo");
    if (semaforo) setFiltrosSemaforo(semaforo.split(",").filter(Boolean));
  }, [searchParams]);

  const tipos = useMemo(
    () => [...new Set(productos.map((p) => p.tipoProductoNombre).filter(Boolean))] as string[],
    [productos],
  );
  const proveedores = useMemo(
    () => [...new Set(productos.map((p) => p.proveedorNombre).filter(Boolean))] as string[],
    [productos],
  );

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
      if (filtrosTipo.length > 0 && !filtrosTipo.includes(p.tipoProductoNombre ?? "")) return false;
      if (filtrosProveedor.length > 0 && !filtrosProveedor.includes(p.proveedorNombre ?? "")) return false;
      if (filtrosSemaforo.length > 0 && !filtrosSemaforo.includes(p.semaforo)) return false;
      return true;
    });

    lista = [...lista].sort((a, b) => {
      let cmp = 0;
      if (orden === "nombre") cmp = a.nombre.localeCompare(b.nombre);
      if (orden === "stockTotal") cmp = a.stockTotal - b.stockTotal;
      if (orden === "loteMasProximoACaducar") {
        cmp = (a.loteMasProximoACaducar || "9999-99-99").localeCompare(
          b.loteMasProximoACaducar || "9999-99-99",
        );
      }
      return direccion === "asc" ? cmp : -cmp;
    });

    return lista;
  }, [productos, busqueda, filtrosTipo, filtrosProveedor, filtrosSemaforo, orden, direccion]);

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <MultiSelect
          options={tipos.map((t) => ({ value: t, label: t }))}
          selected={filtrosTipo}
          onChange={setFiltrosTipo}
          placeholder="Todas las categorías"
          className="max-w-[160px]"
        />
        <MultiSelect
          options={proveedores.map((p) => ({ value: p, label: p }))}
          selected={filtrosProveedor}
          onChange={setFiltrosProveedor}
          placeholder="Todos los proveedores"
          className="max-w-[180px]"
        />
        <MultiSelect
          options={[
            { value: "critico", label: "Crítico" },
            { value: "bajo", label: "Bajo" },
            { value: "adecuado", label: "Adecuado" },
          ]}
          selected={filtrosSemaforo}
          onChange={setFiltrosSemaforo}
          placeholder="Todos los estados"
          className="max-w-[160px]"
        />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2"></th>
              <SortableHeader label="Producto" sortKey="nombre" activo={orden} direccion={direccion} onSort={alternarOrden} />
              <th className="px-4 py-2">Categoría</th>
              <th className="px-4 py-2">Proveedor</th>
              <SortableHeader label="Stock total" sortKey="stockTotal" activo={orden} direccion={direccion} onSort={alternarOrden} />
              <SortableHeader
                label="Próx. caducidad"
                sortKey="loteMasProximoACaducar"
                activo={orden}
                direccion={direccion}
                onSort={alternarOrden}
              />
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody key={`${filtrosTipo.join()}|${filtrosProveedor.join()}|${filtrosSemaforo.join()}|${orden}|${direccion}`} className="aparecer-suave">
            {filtrados.map((p) => (
              <ProductoFila
                key={p.id}
                producto={p}
                expandido={expandido === p.id}
                onToggle={() => setExpandido(expandido === p.id ? null : p.id)}
              />
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6">
                  <EmptyState icon={Boxes} mensaje="No hay productos que coincidan con los filtros." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ProductoFila({
  producto,
  expandido,
  onToggle,
}: {
  producto: {
    id: string;
    nombre: string;
    tipoProductoNombre: string | null;
    proveedorNombre: string | null;
    stockTotal: number;
    loteMasProximoACaducar: string | null;
    semaforo: "critico" | "bajo" | "adecuado";
    unidadMedida: string | null;
  };
  expandido: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const eliminarHibrido = useEliminarHibrido();
  const [editando, setEditando] = useState<Lote | null>(null);

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotesPorProducto", producto.id],
    queryFn: () => window.api.inventario.lotesPorProducto(producto.id),
    enabled: expandido,
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["lotesPorProducto", producto.id] });
    queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
  }

  async function alternarEstado(l: Lote) {
    try {
      await window.api.inventario.cambiarEstadoLote(l.id, l.estado === "bloqueado" ? "activo" : "bloqueado");
      invalidar();
      toast.success(l.estado === "bloqueado" ? "Lote desbloqueado." : "Lote bloqueado.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }

  function eliminar(l: Lote) {
    eliminarHibrido({
      nombre: `el lote "${l.numeroLote || l.id.slice(0, 8)}"`,
      eliminar: () => window.api.inventario.eliminarLote(l.id),
      desactivar: () => window.api.inventario.cambiarEstadoLote(l.id, "bloqueado"),
      alternativaLabel: "Bloquear en su lugar",
      mensajeExitoAlternativa: "Lote bloqueado.",
      onExito: invalidar,
    });
  }

  return (
    <>
      <tr className="cursor-pointer border-t border-beige-200 hover:bg-beige-100" onClick={onToggle}>
        <td className="px-4 py-2 text-ink-500">
          {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </td>
        <td className="px-4 py-2 font-medium text-ink-900">{producto.nombre}</td>
        <td className="px-4 py-2 text-ink-700">{producto.tipoProductoNombre || "—"}</td>
        <td className="px-4 py-2 text-ink-700">{producto.proveedorNombre || "—"}</td>
        <td className="px-4 py-2 text-ink-700">
          {producto.stockTotal} {producto.unidadMedida || ""}
        </td>
        <td className="px-4 py-2 text-ink-700">{formatFecha(producto.loteMasProximoACaducar)}</td>
        <td className="px-4 py-2">
          <Badge variant={semaforoVariant(producto.semaforo)}>
            {producto.semaforo === "critico" ? "Crítico" : producto.semaforo === "bajo" ? "Bajo" : "Adecuado"}
          </Badge>
        </td>
      </tr>
      {expandido && (
        <tr className="border-t border-beige-200 bg-beige-100">
          <td colSpan={7} className="px-4 py-3">
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
            {lotes.length === 0 ? (
              <p className="text-xs text-ink-500">Sin lotes registrados.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-ink-500">
                  <tr>
                    <th className="px-2 py-1 text-left">Lote</th>
                    <th className="px-2 py-1 text-left">Caducidad</th>
                    <th className="px-2 py-1 text-left">Disponible</th>
                    <th className="px-2 py-1 text-left">Estado</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id} className="border-t border-beige-200">
                      <td className="px-2 py-1">{l.numeroLote || l.id.slice(0, 8)}</td>
                      <td className="px-2 py-1">{formatFecha(l.fechaCaducidad)}</td>
                      <td className="px-2 py-1">{l.cantidadDisponible}</td>
                      <td className="px-2 py-1 capitalize">{l.estado}</td>
                      <td className="px-2 py-1 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditando(l);
                            }}
                            title="Editar"
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              alternarEstado(l);
                            }}
                            title={l.estado === "bloqueado" ? "Desbloquear" : "Bloquear"}
                          >
                            {l.estado === "bloqueado" ? <Unlock size={12} /> : <Lock size={12} />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              eliminar(l);
                            }}
                            title="Eliminar"
                          >
                            <Trash2 size={12} className="text-danger-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            </motion.div>
          </td>
        </tr>
      )}

      {editando && (
        <LoteEditModal
          lote={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            invalidar();
            setEditando(null);
          }}
        />
      )}
    </>
  );
}

function LoteEditModal({
  lote,
  onClose,
  onGuardado,
}: {
  lote: Lote;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<LoteInput>({
    numeroLote: lote.numeroLote ?? "",
    fechaCaducidad: lote.fechaCaducidad ?? "",
    ubicacion: lote.ubicacion ?? "",
    notas: lote.notas ?? "",
    costoUnitarioLote: lote.costoUnitarioLote ?? 0,
  });

  const guardar = useMutation({
    mutationFn: () => window.api.inventario.actualizarLote(lote.id, form),
    onSuccess: () => {
      toast.success("Lote actualizado.");
      onGuardado();
    },
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  return (
    <Modal open onClose={onClose} title={`Editar lote · ${lote.productoNombre}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Número de lote</label>
            <Input
              value={form.numeroLote}
              onChange={(e) => setForm({ ...form, numeroLote: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Fecha de caducidad</label>
            <Input
              type="date"
              value={form.fechaCaducidad}
              onChange={(e) => setForm({ ...form, fechaCaducidad: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Ubicación</label>
            <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Costo unitario</label>
            <NumberInput
              placeholder="0.00"
              value={form.costoUnitarioLote}
              onValueChange={(v) => setForm({ ...form, costoUnitarioLote: v ?? 0 })}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Notas</label>
          <Input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </div>
        <Button type="submit" disabled={guardar.isPending} className="mt-2">
          Guardar
        </Button>
      </form>
    </Modal>
  );
}
