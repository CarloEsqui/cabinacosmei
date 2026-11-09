import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { cn } from "@/lib/utils";
import type { MovimientoRow } from "@shared/types";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionDocumento } from "@/components/ui/ilustraciones";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { BotonExportarCsv } from "@/components/BotonExportarCsv";
import { formatFecha } from "@/lib/format";
import type { MovimientosFiltro } from "@shared/schemas";
import { VentaDetalleModal } from "@/components/ventas/VentaDetalleModal";

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  venta: "Venta",
  consumo_servicio: "Consumo servicio",
  merma: "Merma",
  devolucion: "Devolución",
  uso_interno: "Uso interno",
  ajuste: "Ajuste",
  cancelacion_entrada: "Cancelación de entrada",
  cancelacion_salida: "Cancelación de salida",
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
  cancelacion_entrada: "neutral",
  cancelacion_salida: "neutral",
};

/**
 * Un movimiento original (no una cancelación) cuyo documento sigue vigente y no viene de una cita ni
 * de una venta de mostrador (esas se corrigen desde su cita o su venta).
 */
function esCancelable(m: MovimientoRow): boolean {
  return (
    !m.tipo.startsWith("cancelacion_") &&
    m.documentoEstatus === "vigente" &&
    !m.ligadoAServicio &&
    !m.ventaMostradorId &&
    (m.referenciaTipo === "entrada_inventario" || m.referenciaTipo === "salida_inventario")
  );
}

export function MovimientosTab() {
  const [filtro, setFiltro] = useState<MovimientosFiltro>({});
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [ocupado, setOcupado] = useState(false);
  const [ventaAbierta, setVentaAbierta] = useState<string | null>(null);

  /**
   * Cancelar una entrada o salida capturada por error (DAT-A2). Solo confirmar: sin PIN ni motivo
   * (decisión de Carlos, 2026-11-04). Nada se borra: el documento queda tachado y un movimiento de
   * cancelación deja el rastro.
   */
  async function cancelar(m: MovimientoRow) {
    const esEntrada = m.referenciaTipo === "entrada_inventario";
    const r = await confirm({
      titulo: esEntrada ? "Cancelar entrada" : "Cancelar salida",
      mensaje: esEntrada
        ? `¿Cancelar la entrada de ${m.cantidad} de ${m.productoNombre ?? "este producto"}? Se restará del stock y dejará de contar como compra. Quedará tachada en el historial.`
        : `¿Cancelar la salida de ${m.cantidad} de ${m.productoNombre ?? "este producto"}? Se devolverá al lote${m.folio ? ` (si el folio ${m.folio} tomó de varios lotes, se cancela completo)` : ""}. Quedará tachada en el historial.`,
      confirmarLabel: esEntrada ? "Cancelar entrada" : "Cancelar salida",
      cancelarLabel: "Volver",
      destructivo: true,
    });
    if (r !== "confirmado" || !m.referenciaId) return;
    setOcupado(true);
    try {
      if (esEntrada) await window.api.inventario.cancelarEntrada(m.referenciaId);
      else await window.api.inventario.cancelarSalida(m.referenciaId);
      for (const key of ["movimientos", "inventarioResumen", "lotesPorProducto", "lotesCaducados", "lotesProximosACaducar"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(esEntrada ? "Entrada cancelada." : "Salida cancelada.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

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
              <th></th>
            </tr>
          </thead>
          <tbody key={JSON.stringify(filtro)} className="aparecer-suave">
            {movimientos.map((m) => {
              const cancelado = m.documentoEstatus === "cancelada" && !m.tipo.startsWith("cancelacion_");
              return (
                <tr key={m.id} className={cn(cancelado && "text-ink-400")}>
                  <td className={cn(cancelado && "line-through")}>{formatFecha(m.fecha)}</td>
                  <td className={cn(cancelado && "line-through")}>{m.folio || "—"}</td>
                  <td>
                    <Badge variant={cancelado ? "neutral" : (TIPO_VARIANT[m.tipo] ?? "neutral")}>
                      {TIPO_LABEL[m.tipo] ?? m.tipo}
                    </Badge>
                  </td>
                  <td className={cn("text-ink-900", cancelado && "text-ink-400 line-through")}>{m.productoNombre || "—"}</td>
                  <td>{m.numeroLote || "—"}</td>
                  <td className={cn("num", cancelado && "line-through")}>{m.cantidad}</td>
                  <td className="text-ink-500">
                    {cancelado ? (
                      <span className="text-danger-500">
                        Cancelada{m.documentoMotivoCancelacion ? `: ${m.documentoMotivoCancelacion}` : ""}
                      </span>
                    ) : (
                      m.observaciones || "—"
                    )}
                  </td>
                  <td className="text-right">
                    {esCancelable(m) && (
                      <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => cancelar(m)} title="Cancelar este documento">
                        <Ban size={14} className="text-ink-400" /> Cancelar…
                      </Button>
                    )}
                    {/* La acción está donde aparece el registro: la venta se revisa y se cancela desde su detalle. */}
                    {m.ventaMostradorId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVentaAbierta(m.ventaMostradorId)}
                        title="Esta salida es de una venta de mostrador: se corrige o se cancela desde la venta"
                      >
                        <ShoppingBag size={14} className="text-ink-400" /> Ver venta{m.ventaFolio ? ` ${m.ventaFolio}` : ""}
                      </Button>
                    )}
                    {m.ligadoAServicio && m.documentoEstatus === "vigente" && !m.tipo.startsWith("cancelacion_") && (
                      <span className="text-xs text-ink-400" title="Las salidas del cierre de una cita se corrigen desde la cita">
                        De una cita
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6">
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

      <VentaDetalleModal ventaId={ventaAbierta} onClose={() => setVentaAbierta(null)} />
    </div>
  );
}
