import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Pencil,
  Lock,
  Unlock,
  Trash2,
  Boxes,
  PackagePlus,
  PackageMinus,
  AlertTriangle,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionPaquete } from "@/components/ui/ilustraciones";
import { Badge, semaforoVariant } from "@/components/ui/badge";
import { StatChip } from "@/components/ui/stat-chip";
import { MultiSelect } from "@/components/ui/multi-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { useEliminarHibrido } from "@/hooks/use-eliminar-hibrido";
import { cn } from "@/lib/utils";
import { formatFecha, formatearStock, formatMoneda } from "@/lib/format";
import { EntradaForm } from "@/components/inventario/EntradaForm";
import { SalidaForm } from "@/components/inventario/SalidaForm";
import { BotonExportarCsv } from "@/components/BotonExportarCsv";
import { fechaLocalIso } from "@shared/fechas";
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
  const [modalEntrada, setModalEntrada] = useState(false);
  const [modalSalida, setModalSalida] = useState(false);

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

  // Franja de stats (§4): se calcula sobre `productos`, ya cargado por la query de arriba — cero
  // queries nuevas. El valor en stock usa el costo base, que ya viaja en cada fila del resumen.
  const stats = useMemo(() => {
    let criticos = 0;
    let bajos = 0;
    let valor = 0;
    for (const p of productos) {
      if (p.semaforo === "critico") criticos++;
      else if (p.semaforo === "bajo") bajos++;
      valor += p.stockTotal * (p.costoBase ?? 0);
    }
    return { criticos, bajos, valor };
  }, [productos]);

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
        <StatChip icon={Boxes} valor={productos.length} label="Productos" />
        <StatChip icon={AlertTriangle} valor={stats.criticos} label="En estado crítico" tono="danger" />
        <StatChip icon={TrendingDown} valor={stats.bajos} label="Bajos" tono="warning" />
        <StatChip icon={Wallet} valor={formatMoneda(stats.valor)} label="Valor en stock" />
      </div>

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
        <div className="ml-auto flex gap-2">
          <BotonExportarCsv
            tipo="inventario_stock"
            filtro={{ fechaDesde: fechaLocalIso(), fechaHasta: fechaLocalIso(), comparacion: "ninguna" }}
            label="Exportar"
            variant="secondary"
          />
          <Button onClick={() => setModalEntrada(true)}>
            <PackagePlus size={16} /> Nueva entrada
          </Button>
          <Button variant="secondary" onClick={() => setModalSalida(true)}>
            <PackageMinus size={16} /> Nueva salida
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="tabla-bellora">
          <thead>
            <tr>
              <th className="w-8"></th>
              <SortableHeader label="Producto" sortKey="nombre" activo={orden} direccion={direccion} onSort={alternarOrden} />
              <th>Categoría</th>
              <th>Proveedor</th>
              <SortableHeader
                label="Stock total"
                sortKey="stockTotal"
                activo={orden}
                direccion={direccion}
                onSort={alternarOrden}
                className="num"
              />
              <SortableHeader
                label="Próx. caducidad"
                sortKey="loteMasProximoACaducar"
                activo={orden}
                direccion={direccion}
                onSort={alternarOrden}
              />
              <th>Estado</th>
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
                  <EmptyState
                    ilustracion={IlustracionPaquete}
                    mensaje={
                      productos.length === 0
                        ? "Aún no tienes productos registrados."
                        : "Ningún producto coincide con los filtros."
                    }
                    submensaje={
                      productos.length === 0
                        ? "Registra tu primera entrada de inventario con el botón de arriba."
                        : "Prueba ajustando la búsqueda o los filtros."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtrados.length > 0 && (
          <div className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-500">
            Mostrando {filtrados.length} de {productos.length}{" "}
            {productos.length === 1 ? "producto" : "productos"}
          </div>
        )}
      </Card>

      <Modal open={modalEntrada} onClose={() => setModalEntrada(false)} title="Nueva entrada">
        <EntradaForm onRegistrado={() => setModalEntrada(false)} />
      </Modal>
      <Modal open={modalSalida} onClose={() => setModalSalida(false)} title="Nueva salida">
        <SalidaForm onRegistrado={() => setModalSalida(false)} />
      </Modal>
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
    presentacion: string | null;
    contenidoCantidad: number | null;
    contenidoUnidad: string | null;
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
      <tr className="cursor-pointer" onClick={onToggle}>
        <td>
          <ChevronDown
            size={16}
            className={cn("text-ink-400 transition-transform duration-200", expandido && "rotate-180")}
          />
        </td>
        <td className="font-medium text-ink-900">{producto.nombre}</td>
        <td>{producto.tipoProductoNombre || "—"}</td>
        <td>{producto.proveedorNombre || "—"}</td>
        <td className="num">
          {formatearStock(
            producto.stockTotal,
            producto.presentacion,
            producto.contenidoCantidad,
            producto.contenidoUnidad,
          )}
        </td>
        <td>{formatFecha(producto.loteMasProximoACaducar)}</td>
        <td>
          <Badge variant={semaforoVariant(producto.semaforo)}>
            {producto.semaforo === "critico" ? "Crítico" : producto.semaforo === "bajo" ? "Bajo" : "Adecuado"}
          </Badge>
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={7} className="bg-beige-100 px-4 py-3">
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
            {lotes.length === 0 ? (
              <p className="py-2 text-center text-xs text-ink-500">Sin lotes registrados.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-beige-200 bg-beige-50">
                <table className="w-full text-xs">
                  <thead className="bg-beige-200 text-left font-medium uppercase tracking-wide text-ink-500">
                    <tr>
                      <th className="px-3 py-2">Lote</th>
                      <th className="px-3 py-2">Caducidad</th>
                      <th className="px-3 py-2 text-right">Disponible</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotes.map((l) => (
                      <tr key={l.id} className="border-t border-beige-200 transition-colors hover:bg-beige-100/60">
                        <td className="px-3 py-2 text-ink-700">{l.numeroLote || l.id.slice(0, 8)}</td>
                        <td className="px-3 py-2 text-ink-700">{formatFecha(l.fechaCaducidad)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-700">
                          {formatearStock(l.cantidadDisponible, l.presentacion, l.contenidoCantidad, l.contenidoUnidad)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={l.estado === "bloqueado" ? "warning" : "success"}>
                            {l.estado === "bloqueado" ? "Bloqueado" : "Activo"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
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
                              <Pencil size={12} className="text-ink-400" />
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
                              {l.estado === "bloqueado" ? (
                                <Unlock size={12} className="text-ink-400" />
                              ) : (
                                <Lock size={12} className="text-ink-400" />
                              )}
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
                              <Trash2 size={12} className="text-ink-400 hover:text-danger-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            <MoneyInput
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
        <Button type="submit" disabled={guardar.isPending} className="mt-2 w-full">
          Guardar
        </Button>
      </form>
    </Modal>
  );
}
