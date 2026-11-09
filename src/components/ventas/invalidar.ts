import type { useQueryClient } from "@tanstack/react-query";
import { invalidarDinero } from "@/pages/agenda/PagosDeCita";

/**
 * Todo lo que cambia con una venta de mostrador: su dinero (corte, Inicio, saldos de clientas), sus
 * listas y el inventario que descuenta o regresa.
 */
export function invalidarVentas(queryClient: ReturnType<typeof useQueryClient>) {
  invalidarDinero(queryClient);
  for (const key of ["ventas", "ventasCliente", "ventaDetalle", "ventasFrecuentes", "inventarioResumen", "movimientos", "lotesPorProducto"]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
