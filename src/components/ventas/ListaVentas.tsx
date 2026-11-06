import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Paginador, POR_PAGINA, usePaginacion } from "@/components/ui/paginador";
import { formatFecha, formatMoneda } from "@/lib/format";
import { VenderProductoModal } from "@/components/ventas/VenderProductoModal";
import { EstatusVenta, VentaDetalleModal, destinatarioVenta } from "@/components/ventas/VentaDetalleModal";
import type { VentaMostradorRow } from "@shared/types";

/** Una fila de venta: folio, para quién, total y saldo. Al picarla se abre su detalle. */
export function FilaVenta({ venta, onAbrir, sinDestinatario = false }: { venta: VentaMostradorRow; onAbrir: () => void; sinDestinatario?: boolean }) {
  const cancelada = venta.estatus === "cancelada";
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-beige-100"
    >
      <div className="min-w-0">
        <p className={`truncate text-sm font-medium ${cancelada ? "text-ink-400 line-through" : "text-ink-900"}`}>
          {venta.folio}
          {!sinDestinatario && ` · ${destinatarioVenta(venta)}`}
        </p>
        <p className="text-xs text-ink-500">
          {formatFecha(venta.fecha)} · {venta.productos} {venta.productos === 1 ? "pieza" : "piezas"}
          {!cancelada && venta.saldo > 0.005 && <span className="text-danger-500"> · debe {formatMoneda(venta.saldo)}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`text-sm font-semibold tabular-nums ${cancelada ? "text-ink-400" : "text-ink-900"}`}>{formatMoneda(venta.total)}</span>
        <EstatusVenta venta={venta} />
      </div>
    </button>
  );
}

/**
 * Inventario → Ventas (spec de la venta, FR-011): ventas de mostrador, 30 por página, la más
 * reciente primero. La paginación es del main: la lista crece con el tiempo.
 */
export function ListaVentas() {
  const [pagina, setPagina] = useState(1);
  const [vender, setVender] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ventas", pagina],
    queryFn: () => window.api.ventas.listar(pagina),
  });
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">Ventas de productos sin cita. Las ventas dentro de una cita están en su cierre.</p>
        <Button onClick={() => setVender(true)}>
          <ShoppingBag size={16} /> Vender producto
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <p className="p-4 text-sm text-ink-500">Cargando…</p>
        ) : !data || data.filas.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            mensaje="Todavía no hay ventas de mostrador"
            submensaje="Cuando alguien compre un producto sin cita, regístralo aquí para que su dinero entre al corte."
            accion={
              <Button size="sm" onClick={() => setVender(true)}>
                <ShoppingBag size={14} /> Vender producto
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col divide-y divide-beige-200">
            {data.filas.map((v) => (
              <FilaVenta key={v.id} venta={v} onAbrir={() => setAbierta(v.id)} />
            ))}
          </div>
        )}
      </Card>

      {total > 0 && (
        <Paginador
          pagina={pagina}
          totalPaginas={totalPaginas}
          desde={desde}
          hasta={Math.min(pagina * POR_PAGINA, total)}
          total={total}
          sustantivo={["venta", "ventas"]}
          onCambiar={setPagina}
        />
      )}

      <VenderProductoModal open={vender} onClose={() => setVender(false)} />
      <VentaDetalleModal ventaId={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}

/** Ventas de mostrador de una clienta, para su ficha en Clientes (FR-011). */
export function VentasDeCliente({ clienteId }: { clienteId: string }) {
  const [vender, setVender] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const { data: ventas = [] } = useQuery({
    queryKey: ["ventasCliente", clienteId],
    queryFn: () => window.api.ventas.porCliente(clienteId),
  });
  const paginacion = usePaginacion(ventas, clienteId);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Compras de productos</h3>
        <Button variant="ghost" size="sm" onClick={() => setVender(true)}>
          <ShoppingBag size={14} /> Vender producto
        </Button>
      </div>
      {ventas.length === 0 ? (
        <p className="text-xs text-ink-500">Sin compras fuera de cita.</p>
      ) : (
        <div className="flex flex-col divide-y divide-beige-200 overflow-hidden rounded-xl border border-beige-200">
          {paginacion.visibles.map((v) => (
            <FilaVenta key={v.id} venta={v} sinDestinatario onAbrir={() => setAbierta(v.id)} />
          ))}
        </div>
      )}
      {ventas.length > POR_PAGINA && (
        <div className="mt-2">
          <Paginador {...paginacion} sustantivo={["compra", "compras"]} onCambiar={paginacion.irA} />
        </div>
      )}
      <VenderProductoModal open={vender} onClose={() => setVender(false)} clienteIdInicial={clienteId} />
      <VentaDetalleModal ventaId={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}
