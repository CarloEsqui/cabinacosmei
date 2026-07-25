import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { BotonExportarCsv } from "@/components/BotonExportarCsv";
import { formatFecha } from "@/lib/format";
import type { MovimientosFiltro } from "@shared/schemas";

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  venta: "Venta",
  consumo_servicio: "Consumo servicio",
  merma: "Merma",
  devolucion: "Devolución",
  uso_interno: "Uso interno",
  ajuste: "Ajuste",
};

export function MovimientosTab() {
  const [filtro, setFiltro] = useState<MovimientosFiltro>({});

  const { data: movimientos = [] } = useQuery({
    queryKey: ["movimientos", filtro],
    queryFn: () => window.api.inventario.movimientos(filtro),
  });
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Desde</label>
          <Input
            type="date"
            value={filtro.fechaDesde ?? ""}
            onChange={(e) => setFiltro({ ...filtro, fechaDesde: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Hasta</label>
          <Input
            type="date"
            value={filtro.fechaHasta ?? ""}
            onChange={(e) => setFiltro({ ...filtro, fechaHasta: e.target.value || undefined })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Producto</label>
          <MultiSelect
            options={productos.map((p) => ({ value: p.id, label: p.nombre }))}
            selected={filtro.productoIds ?? []}
            onChange={(productoIds) =>
              setFiltro({ ...filtro, productoIds: productoIds.length > 0 ? productoIds : undefined })
            }
            placeholder="Todos"
            className="min-w-[180px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Tipo</label>
          <MultiSelect
            options={Object.entries(TIPO_LABEL).map(([valor, label]) => ({ value: valor, label }))}
            selected={filtro.tipos ?? []}
            onChange={(tipos) => setFiltro({ ...filtro, tipos: tipos.length > 0 ? tipos : undefined })}
            placeholder="Todos"
            className="min-w-[160px]"
          />
        </div>
        <div className="ml-auto flex items-end">
          <BotonExportarCsv tipo="movimientos" filtro={filtro} label="Exportar" variant="secondary" />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Folio</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2">Lote</th>
              <th className="px-4 py-2">Cantidad</th>
              <th className="px-4 py-2">Observaciones</th>
            </tr>
          </thead>
          <tbody key={JSON.stringify(filtro)} className="aparecer-suave">
            {movimientos.map((m) => (
              <tr key={m.id} className="border-t border-beige-200">
                <td className="px-4 py-2 text-ink-700">{formatFecha(m.fecha)}</td>
                <td className="px-4 py-2 text-ink-700">{m.folio || "—"}</td>
                <td className="px-4 py-2">
                  <Badge variant={m.tipo === "entrada" ? "success" : "neutral"}>
                    {TIPO_LABEL[m.tipo] ?? m.tipo}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-ink-900">{m.productoNombre || "—"}</td>
                <td className="px-4 py-2 text-ink-700">{m.numeroLote || "—"}</td>
                <td className="px-4 py-2 text-ink-700">{m.cantidad}</td>
                <td className="px-4 py-2 text-ink-500">{m.observaciones || "—"}</td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6">
                  <EmptyState icon={ArrowLeftRight} mensaje="Sin movimientos registrados aún." submensaje="Las entradas y salidas de inventario aparecerán aquí." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
