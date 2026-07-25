import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { formatFecha, formatearStock } from "@/lib/format";
import type { Lote } from "@shared/types";

type Orden = "fechaCaducidad" | "cantidadDisponible";

function useOrdenados(lotes: Lote[], orden: Orden) {
  return useMemo(() => {
    return [...lotes].sort((a, b) => {
      if (orden === "cantidadDisponible") return b.cantidadDisponible - a.cantidadDisponible;
      return (a.fechaCaducidad || "").localeCompare(b.fechaCaducidad || "");
    });
  }, [lotes, orden]);
}

export function CaducidadTab() {
  const { data: proximos = [] } = useQuery({
    queryKey: ["lotesProximosACaducar"],
    queryFn: () => window.api.inventario.proximosACaducar(),
  });
  const { data: caducados = [] } = useQuery({
    queryKey: ["lotesCaducados"],
    queryFn: () => window.api.inventario.caducados(),
  });

  const [ordenProximos, setOrdenProximos] = useState<Orden>("fechaCaducidad");
  const [ordenCaducados, setOrdenCaducados] = useState<Orden>("fechaCaducidad");

  const proximosOrdenados = useOrdenados(proximos, ordenProximos);
  const caducadosOrdenados = useOrdenados(caducados, ordenCaducados);

  return (
    <div className="grid grid-cols-1 gap-4 p-8 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Próximos a caducar</CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={ordenProximos}
              onChange={(e) => setOrdenProximos(e.target.value as Orden)}
              className="h-8 text-xs"
            >
              <option value="fechaCaducidad">Ordenar por fecha</option>
              <option value="cantidadDisponible">Ordenar por cantidad</option>
            </Select>
            <Badge variant="warning">{proximos.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {proximosOrdenados.length === 0 && <p className="text-sm text-ink-500">Nada próximo a caducar.</p>}
          {proximosOrdenados.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-xl bg-beige-100 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-ink-900">{l.productoNombre}</p>
                <p className="text-xs text-ink-500">Lote {l.numeroLote || l.id.slice(0, 8)}</p>
              </div>
              <div className="text-right">
                <p className="text-warning-500">{formatFecha(l.fechaCaducidad)}</p>
                <p className="text-xs text-ink-500">
                  {formatearStock(l.cantidadDisponible, l.presentacion, l.contenidoCantidad, l.contenidoUnidad)}{" "}
                  disponibles
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Caducados</CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={ordenCaducados}
              onChange={(e) => setOrdenCaducados(e.target.value as Orden)}
              className="h-8 text-xs"
            >
              <option value="fechaCaducidad">Ordenar por fecha</option>
              <option value="cantidadDisponible">Ordenar por cantidad</option>
            </Select>
            <Badge variant="danger">{caducados.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {caducadosOrdenados.length === 0 && <p className="text-sm text-ink-500">No hay lotes caducados.</p>}
          {caducadosOrdenados.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-xl bg-beige-100 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-ink-900">{l.productoNombre}</p>
                <p className="text-xs text-ink-500">Lote {l.numeroLote || l.id.slice(0, 8)}</p>
              </div>
              <div className="text-right">
                <p className="text-danger-500">{formatFecha(l.fechaCaducidad)}</p>
                <p className="text-xs text-ink-500">
                  {formatearStock(l.cantidadDisponible, l.presentacion, l.contenidoCantidad, l.contenidoUnidad)}{" "}
                  disponibles — bloqueado
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
