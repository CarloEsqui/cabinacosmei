import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionDocumento } from "@/components/ui/ilustraciones";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge, type BadgeProps } from "@/components/ui/badge";
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

// Mismo lenguaje semántico que el resto de la app: verde = suma inventario, ámbar = requiere
// atención (devolución), rojo = pérdida real (merma). El resto queda en tono neutro.
const TIPO_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  entrada: "success",
  venta: "jacaranda",
  consumo_servicio: "neutral",
  merma: "danger",
  devolucion: "warning",
  uso_interno: "neutral",
  ajuste: "neutral",
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

  // Para distinguir "sin datos aún" de "sin resultados con estos filtros" en el EmptyState (§2),
  // sin disparar ninguna query adicional: basta ver si el usuario activó algún filtro.
  const hayFiltros = useMemo(
    () =>
      Boolean(
        filtro.fechaDesde ||
          filtro.fechaHasta ||
          (filtro.productoIds && filtro.productoIds.length > 0) ||
          (filtro.tipos && filtro.tipos.length > 0),
      ),
    [filtro],
  );

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Rango de fechas como un solo control visual (§1): dos inputs unidos por un "–" dentro
            de un contenedor con borde común, en vez de dos campos sueltos con label. */}
        <div className="flex h-10 items-center gap-1 rounded-xl border border-beige-300 bg-beige-50 px-2">
          <input
            type="date"
            title="Desde"
            value={filtro.fechaDesde ?? ""}
            onChange={(e) => setFiltro({ ...filtro, fechaDesde: e.target.value || undefined })}
            className="h-8 border-0 bg-transparent px-1 text-sm text-ink-900 focus:outline-none"
          />
          <span className="text-ink-400">–</span>
          <input
            type="date"
            title="Hasta"
            value={filtro.fechaHasta ?? ""}
            onChange={(e) => setFiltro({ ...filtro, fechaHasta: e.target.value || undefined })}
            className="h-8 border-0 bg-transparent px-1 text-sm text-ink-900 focus:outline-none"
          />
        </div>
        <MultiSelect
          options={productos.map((p) => ({ value: p.id, label: p.nombre }))}
          selected={filtro.productoIds ?? []}
          onChange={(productoIds) =>
            setFiltro({ ...filtro, productoIds: productoIds.length > 0 ? productoIds : undefined })
          }
          placeholder="Todos los productos"
          className="min-w-[180px]"
        />
        <MultiSelect
          options={Object.entries(TIPO_LABEL).map(([valor, label]) => ({ value: valor, label }))}
          selected={filtro.tipos ?? []}
          onChange={(tipos) => setFiltro({ ...filtro, tipos: tipos.length > 0 ? tipos : undefined })}
          placeholder="Todos los tipos"
          className="min-w-[160px]"
        />
        <div className="ml-auto">
          <BotonExportarCsv tipo="movimientos" filtro={filtro} label="Exportar" variant="secondary" />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="tabla-bellora">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Folio</th>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Lote</th>
              <th className="num">Cantidad</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody key={JSON.stringify(filtro)} className="aparecer-suave">
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td>{formatFecha(m.fecha)}</td>
                <td>{m.folio || "—"}</td>
                <td>
                  <Badge variant={TIPO_VARIANT[m.tipo] ?? "neutral"}>{TIPO_LABEL[m.tipo] ?? m.tipo}</Badge>
                </td>
                <td className="text-ink-900">{m.productoNombre || "—"}</td>
                <td>{m.numeroLote || "—"}</td>
                <td className="num">{m.cantidad}</td>
                <td className="text-ink-500">{m.observaciones || "—"}</td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6">
                  <EmptyState
                    ilustracion={IlustracionDocumento}
                    mensaje={hayFiltros ? "Ningún movimiento coincide con los filtros." : "Sin movimientos registrados aún."}
                    submensaje={
                      hayFiltros
                        ? "Prueba ajustando el rango de fechas o los filtros."
                        : "Las entradas y salidas de inventario aparecerán aquí."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {movimientos.length > 0 && (
          <div className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-500">
            Mostrando {movimientos.length} {movimientos.length === 1 ? "movimiento" : "movimientos"}
          </div>
        )}
      </Card>
    </div>
  );
}
