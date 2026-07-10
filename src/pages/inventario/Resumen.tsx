import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, semaforoVariant } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SortableHeader } from "@/components/ui/sortable-header";
import { formatFecha } from "@/lib/format";

type OrdenKey = "nombre" | "stockTotal" | "loteMasProximoACaducar";

export function ResumenTab() {
  const { data: productos = [] } = useQuery({
    queryKey: ["inventarioResumen"],
    queryFn: () => window.api.inventario.resumen(),
  });
  const [expandido, setExpandido] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroSemaforo, setFiltroSemaforo] = useState("");
  const [orden, setOrden] = useState<OrdenKey>("nombre");
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");

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
      if (filtroTipo && p.tipoProductoNombre !== filtroTipo) return false;
      if (filtroProveedor && p.proveedorNombre !== filtroProveedor) return false;
      if (filtroSemaforo && p.semaforo !== filtroSemaforo) return false;
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
  }, [productos, busqueda, filtroTipo, filtroProveedor, filtroSemaforo, orden, direccion]);

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="max-w-[160px]">
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          className="max-w-[180px]"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select
          value={filtroSemaforo}
          onChange={(e) => setFiltroSemaforo(e.target.value)}
          className="max-w-[160px]"
        >
          <option value="">Todos los estados</option>
          <option value="critico">Crítico</option>
          <option value="bajo">Bajo</option>
          <option value="adecuado">Adecuado</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2"></th>
              <SortableHeader label="Producto" sortKey="nombre" activo={orden} direccion={direccion} onSort={alternarOrden} />
              <th className="px-4 py-2">Tipo</th>
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
          <tbody>
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
                <td colSpan={7} className="px-4 py-8 text-center text-ink-500">
                  No hay productos que coincidan con los filtros.
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
  const { data: lotes = [] } = useQuery({
    queryKey: ["lotesPorProducto", producto.id],
    queryFn: () => window.api.inventario.lotesPorProducto(producto.id),
    enabled: expandido,
  });

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
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id} className="border-t border-beige-200">
                      <td className="px-2 py-1">{l.numeroLote || l.id.slice(0, 8)}</td>
                      <td className="px-2 py-1">{formatFecha(l.fechaCaducidad)}</td>
                      <td className="px-2 py-1">{l.cantidadDisponible}</td>
                      <td className="px-2 py-1 capitalize">{l.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
