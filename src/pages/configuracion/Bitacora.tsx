import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-end gap-3">
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
        <p className="text-xs text-ink-500">
          Registro de quién hizo qué y cuándo: citas, clientas, productos, inventario, cortes y respaldos.
        </p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Usuario</th>
              <th className="px-4 py-2">Acción</th>
              <th className="px-4 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.id} className="border-t border-beige-200">
                <td className="whitespace-nowrap px-4 py-2 text-ink-700">{formatFechaHoraMs(e.createdAt)}</td>
                <td className="px-4 py-2 text-ink-700">{e.usuarioNombre ?? "—"}</td>
                <td className="px-4 py-2">
                  {ACCIONES_SENSIBLES.has(e.accion) ? (
                    <Badge variant="warning" className="gap-1">
                      <ShieldAlert size={12} /> {etiquetaAccion(e.accion)}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">{etiquetaAccion(e.accion)}</Badge>
                  )}
                </td>
                <td className="px-4 py-2 text-ink-700">{e.detalle ?? "—"}</td>
              </tr>
            ))}
            {eventos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-500">
                  Aún no hay eventos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
