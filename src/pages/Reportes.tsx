import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFecha } from "@/lib/format";
import { fechaLocalIso, inicioDeMesIso } from "@shared/fechas";
import type { RangoFechas } from "@shared/schemas";

const TABS = [
  { value: "cobranza", label: "Cobranza" },
  { value: "inventario", label: "Inventario" },
  { value: "servicios", label: "Servicios" },
  { value: "clientes", label: "Clientes" },
];

export function ReportesPage() {
  const [tab, setTab] = useState("cobranza");
  const [rango, setRango] = useState<RangoFechas>({ fechaDesde: inicioDeMesIso(), fechaHasta: fechaLocalIso() });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Reportes" subtitle="Cobranza, inventario, servicios y clientes por rango de fecha" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="flex flex-wrap items-end gap-3 px-8 pt-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Desde</label>
          <Input
            type="date"
            value={rango.fechaDesde}
            onChange={(e) => setRango({ ...rango, fechaDesde: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Hasta</label>
          <Input
            type="date"
            value={rango.fechaHasta}
            onChange={(e) => setRango({ ...rango, fechaHasta: e.target.value })}
          />
        </div>
      </div>

      {tab === "cobranza" && <CobranzaTab rango={rango} />}
      {tab === "inventario" && <InventarioTab rango={rango} />}
      {tab === "servicios" && <ServiciosTab rango={rango} />}
      {tab === "clientes" && <ClientesTab rango={rango} />}
    </div>
  );
}

function ExportarBoton({ tipo, rango }: { tipo: "cobranza" | "inventario" | "servicios"; rango: RangoFechas }) {
  const [exportando, setExportando] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={exportando}
      onClick={async () => {
        setExportando(true);
        try {
          await window.api.reportes.exportarCsv(tipo, rango);
        } finally {
          setExportando(false);
        }
      }}
    >
      <Download size={16} /> Exportar CSV
    </Button>
  );
}

function CobranzaTab({ rango }: { rango: RangoFechas }) {
  const { data } = useQuery({
    queryKey: ["reporteCobranza", rango],
    queryFn: () => window.api.reportes.cobranza(rango),
  });

  return (
    <div className="p-8">
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total cobrado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-ink-900">${(data?.total ?? 0).toFixed(2)}</p>
            <p className="text-xs text-ink-500">{data?.filas.length ?? 0} pagos en el rango</p>
          </CardContent>
        </Card>
        {(data?.totalPorMetodo ?? []).map((m) => (
          <Card key={m.metodoPago}>
            <CardHeader>
              <CardTitle>{m.metodoPago}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-ink-900">${m.monto.toFixed(2)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex justify-end">
        <ExportarBoton tipo="cobranza" rango={rango} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Método de pago</th>
              <th className="px-4 py-2">Monto</th>
            </tr>
          </thead>
          <tbody>
            {(data?.filas ?? []).map((f, i) => (
              <tr key={i} className="border-t border-beige-200">
                <td className="px-4 py-2 text-ink-700">{formatFecha(f.fecha)}</td>
                <td className="px-4 py-2 text-ink-700">{f.metodoPago}</td>
                <td className="px-4 py-2 font-medium text-ink-900">${f.monto.toFixed(2)}</td>
              </tr>
            ))}
            {(data?.filas ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-ink-500">
                  No hay pagos cobrados en este rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function InventarioTab({ rango }: { rango: RangoFechas }) {
  const { data } = useQuery({
    queryKey: ["reporteInventario", rango],
    queryFn: () => window.api.reportes.inventario(rango),
  });

  return (
    <div className="p-8">
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Entradas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-ink-900">{data?.totalEntradas ?? 0}</p>
            <p className="text-xs text-ink-500">Unidades recibidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Salidas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-ink-900">{data?.totalSalidas ?? 0}</p>
            <p className="text-xs text-ink-500">Unidades salientes (venta, consumo, merma...)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Costo de consumo en servicios</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-ink-900">${(data?.costoConsumo ?? 0).toFixed(2)}</p>
            <p className="text-xs text-ink-500">Valorizado a costo del lote</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex justify-end">
        <ExportarBoton tipo="inventario" rango={rango} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Tipo de salida</th>
              <th className="px-4 py-2">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {(data?.porTipoSalida ?? []).map((f) => (
              <tr key={f.tipo} className="border-t border-beige-200">
                <td className="px-4 py-2 capitalize text-ink-700">{f.tipo.replace(/_/g, " ")}</td>
                <td className="px-4 py-2 font-medium text-ink-900">{f.cantidad}</td>
              </tr>
            ))}
            {(data?.porTipoSalida ?? []).length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-ink-500">
                  No hay salidas registradas en este rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ServiciosTab({ rango }: { rango: RangoFechas }) {
  const { data } = useQuery({
    queryKey: ["reporteServicios", rango],
    queryFn: () => window.api.reportes.servicios(rango),
  });

  return (
    <div className="p-8">
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Servicios cerrados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-ink-900">{data?.totalServicios ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ticket promedio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-ink-900">${(data?.ticketPromedio ?? 0).toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex justify-end">
        <ExportarBoton tipo="servicios" rango={rango} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2">Servicio</th>
              <th className="px-4 py-2">Cantidad</th>
              <th className="px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {(data?.porServicio ?? []).map((f) => (
              <tr key={f.servicioNombre} className="border-t border-beige-200">
                <td className="px-4 py-2 text-ink-700">{f.servicioNombre}</td>
                <td className="px-4 py-2 text-ink-700">{f.cantidad}</td>
                <td className="px-4 py-2 font-medium text-ink-900">${f.total.toFixed(2)}</td>
              </tr>
            ))}
            {(data?.porServicio ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-ink-500">
                  No hay servicios cerrados en este rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ClientesTab({ rango }: { rango: RangoFechas }) {
  const { data } = useQuery({
    queryKey: ["reporteClientes", rango],
    queryFn: () => window.api.reportes.clientes(rango),
  });

  const rangoLegible = useMemo(() => `${formatFecha(rango.fechaDesde)} — ${formatFecha(rango.fechaHasta)}`, [rango]);

  return (
    <div className="p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clientas nuevas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-ink-900">{data?.nuevosClientes ?? 0}</p>
            <p className="text-xs text-ink-500">Alta en {rangoLegible}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mantenimientos sugeridos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-ink-900">{data?.mantenimientosGenerados ?? 0}</p>
            <p className="text-xs text-ink-500">Cierres que generaron una próxima cita sugerida</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
