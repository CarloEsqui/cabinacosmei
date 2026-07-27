import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, CalendarRange } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IlustracionDocumento } from "@/components/ui/ilustraciones";
import { formatFechaHoraMs } from "@/lib/format";
import type { BitacoraFiltro } from "@shared/schemas";

const ACCIONES_SENSIBLES = new Set(["cierre_con_pin_override"]);

function etiquetaAccion(accion: string): string {
  return accion.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function BitacoraTab() {
  const [filtro, setFiltro] = useState<BitacoraFiltro>({ limite: 200 });

  const { data: eventos = [] } = useQuery({
    queryKey: ["bitacora", filtro],
    queryFn: () => window.api.bitacora.listar(filtro),
  });

  const hayFiltroFecha = !!(filtro.fechaDesde || filtro.fechaHasta);

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex h-10 items-center gap-2 rounded-xl border border-beige-300 bg-beige-50 px-3">
          <CalendarRange size={14} className="shrink-0 text-ink-400" />
          <input
            type="date"
            aria-label="Desde"
            className="h-full border-0 bg-transparent p-0 text-sm text-ink-900 focus:outline-none focus:ring-0"
            value={filtro.fechaDesde ?? ""}
            onChange={(e) => setFiltro({ ...filtro, fechaDesde: e.target.value || undefined })}
          />
          <span className="text-ink-400">–</span>
          <input
            type="date"
            aria-label="Hasta"
            className="h-full border-0 bg-transparent p-0 text-sm text-ink-900 focus:outline-none focus:ring-0"
            value={filtro.fechaHasta ?? ""}
            onChange={(e) => setFiltro({ ...filtro, fechaHasta: e.target.value || undefined })}
          />
        </div>
        <p className="text-xs text-ink-400">
          Registro de quién hizo qué y cuándo: citas, clientas, productos, inventario, cortes y respaldos.
        </p>
      </div>

      <Card className="overflow-x-auto">
        <table className="tabla-bellora">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody key={`${filtro.fechaDesde ?? ""}|${filtro.fechaHasta ?? ""}`} className="aparecer-suave">
            {eventos.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{formatFechaHoraMs(e.createdAt)}</td>
                <td>{e.usuarioNombre ?? "—"}</td>
                <td>
                  {ACCIONES_SENSIBLES.has(e.accion) ? (
                    <Badge variant="warning" className="gap-1">
                      <ShieldAlert size={12} /> {etiquetaAccion(e.accion)}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">{etiquetaAccion(e.accion)}</Badge>
                  )}
                </td>
                <td>{e.detalle ?? "—"}</td>
              </tr>
            ))}
            {eventos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8">
                  <EmptyState
                    ilustracion={IlustracionDocumento}
                    mensaje={hayFiltroFecha ? "Ningún evento en este rango de fechas." : "Aún no hay eventos registrados."}
                    submensaje={hayFiltroFecha ? undefined : "Aquí aparecerán las acciones importantes que hagas en la app."}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {eventos.length > 0 && (
          <div className="border-t border-beige-200 px-4 py-2.5 text-xs text-ink-500">
            Mostrando {eventos.length} {eventos.length === 1 ? "evento" : "eventos"}
          </div>
        )}
      </Card>
    </div>
  );
}
