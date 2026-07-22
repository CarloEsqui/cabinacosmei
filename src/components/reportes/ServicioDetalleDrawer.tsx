import { Drawer } from "@/components/ui/drawer";
import { formatMoneda } from "@/lib/format";
import type { ServicioMetricas } from "@shared/types";

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-b border-beige-200 py-2 text-sm last:border-0">
      <span className="text-ink-500">{etiqueta}</span>
      <span className="font-medium tabular-nums text-ink-900">{valor}</span>
    </div>
  );
}

/**
 * Detalle completo de un servicio del ranking — las columnas que se sacaron de la tabla para no
 * saturarla (cantidad, costo de insumos, duración) viven aquí, un clic de distancia
 * (INSTRUCCIONES §10.3 "columnas visibles... mover el resto al detalle").
 */
export function ServicioDetalleDrawer({ servicio, onClose }: { servicio: ServicioMetricas | null; onClose: () => void }) {
  return (
    <Drawer open={!!servicio} onClose={onClose} title={servicio?.servicioNombre ?? ""}>
      {servicio && (
        <div className="flex flex-col">
          <Fila etiqueta="Servicios realizados" valor={String(servicio.cantidad)} />
          <Fila etiqueta="Ingresos" valor={formatMoneda(servicio.ingresos)} />
          <Fila etiqueta="Costo de insumos" valor={formatMoneda(servicio.costoInsumos)} />
          <Fila etiqueta="Margen bruto" valor={`${formatMoneda(servicio.margenBruto)} (${servicio.margenPct.toFixed(0)}%)`} />
          <Fila
            etiqueta="Duración total"
            valor={servicio.duracionHoras !== null ? `${servicio.duracionHoras.toFixed(1)} h` : "—"}
          />
          <Fila
            etiqueta="Ingreso por hora"
            valor={servicio.ingresoPorHora !== null ? formatMoneda(servicio.ingresoPorHora) : "—"}
          />
          {servicio.sinCosto && (
            <p className="mt-3 text-xs text-warning-500">
              ⚠ Sin insumos registrados: el margen mostrado puede estar sobreestimado.
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
