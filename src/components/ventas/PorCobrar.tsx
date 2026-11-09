import { useState } from "react";
import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Paginador, POR_PAGINA, usePaginacion } from "@/components/ui/paginador";
import { formatFecha, formatMoneda } from "@/lib/format";
import { VentaDetalleModal } from "@/components/ventas/VentaDetalleModal";
import type { VentaMostradorRow } from "@shared/types";

/**
 * "Por cobrar" del módulo Ventas (§23): compras de clientas con saldo, la más antigua primero. Cada
 * fila abre su venta; "Registrar pago" la abre directo en el abono.
 */
export function PorCobrar({ ventas }: { ventas: VentaMostradorRow[] }) {
  const [abierta, setAbierta] = useState<{ id: string; abono: boolean } | null>(null);
  const paginacion = usePaginacion(ventas, "porCobrar");
  const totalDeuda = ventas.reduce((acc, v) => acc + v.saldo, 0);

  return (
    <div className="flex flex-col gap-4 p-8">
      {ventas.length > 0 && (
        <p className="text-sm text-ink-500">
          {ventas.length} {ventas.length === 1 ? "compra pendiente" : "compras pendientes"} ·{" "}
          <span className="font-semibold text-danger-500">{formatMoneda(totalDeuda)}</span> por cobrar
        </p>
      )}
      <Card className="overflow-hidden p-0">
        {ventas.length === 0 ? (
          <EmptyState
            icon={Wallet}
            mensaje="Nadie debe compras de productos"
            submensaje="Cuando una clienta se lleve un producto y pague después, aparecerá aquí."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-beige-200">
            {paginacion.visibles.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-beige-100">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAbierta({ id: v.id, abono: false })}>
                  <p className="truncate text-sm font-medium text-ink-900">
                    {v.clienteNombre ?? "Clienta"} <span className="font-normal text-ink-500">· {v.folio}</span>
                  </p>
                  <p className="text-xs text-ink-500">
                    {formatFecha(v.fecha)} · total {formatMoneda(v.total)} · pagó {formatMoneda(v.cobrado)}
                  </p>
                </button>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-danger-500">debe {formatMoneda(v.saldo)}</span>
                <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setAbierta({ id: v.id, abono: true })}>
                  <Wallet size={14} /> Registrar pago
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {ventas.length > POR_PAGINA && <Paginador {...paginacion} sustantivo={["compra", "compras"]} onCambiar={paginacion.irA} />}
      <VentaDetalleModal
        ventaId={abierta?.id ?? null}
        panelInicial={abierta?.abono ? "abono" : undefined}
        onClose={() => setAbierta(null)}
      />
    </div>
  );
}
