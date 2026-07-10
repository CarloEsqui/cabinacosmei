import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, Bell, PackageX, Timer, Lock, CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFecha } from "@/lib/format";

const HOY = new Date().toISOString().slice(0, 10);
const EN_7_DIAS = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function DashboardPage() {
  const { data: resumen = [] } = useQuery({
    queryKey: ["inventarioResumen"],
    queryFn: () => window.api.inventario.resumen(),
  });
  const { data: proximosACaducar = [] } = useQuery({
    queryKey: ["lotesProximosACaducar"],
    queryFn: () => window.api.inventario.proximosACaducar(),
  });
  const { data: caducados = [] } = useQuery({
    queryKey: ["lotesCaducados"],
    queryFn: () => window.api.inventario.caducados(),
  });
  const { data: citasProximas = [] } = useQuery({
    queryKey: ["citas", { fechaDesde: HOY, fechaHasta: EN_7_DIAS }],
    queryFn: () => window.api.citas.listar({ fechaDesde: HOY, fechaHasta: EN_7_DIAS }),
  });
  const { data: mantenimientos = [] } = useQuery({
    queryKey: ["mantenimientosNoProgramados"],
    queryFn: () => window.api.citas.mantenimientosNoProgramados(),
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => window.api.config.obtener(),
  });
  const { data: corteResumen } = useQuery({
    queryKey: ["corteResumenPendiente"],
    queryFn: () => window.api.corte.resumenPendiente(),
  });

  const horaActual = new Date().toTimeString().slice(0, 5);
  const esHoraDelCorte =
    !!config && horaActual >= config.horaCorte && !!corteResumen && corteResumen.cantidadPagos > 0;

  const stockBajoLista = resumen
    .filter((p) => p.semaforo === "critico" || p.semaforo === "bajo")
    .sort((a, b) => a.stockTotal - b.stockTotal);

  const caducidadLista = [...caducados, ...proximosACaducar];

  const citasActivas = citasProximas
    .filter((c) => c.estado === "programada" || c.estado === "confirmada")
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  const citasHoy = citasActivas.filter((c) => c.fecha === HOY);

  const ALERTAS = [
    {
      icon: CalendarClock,
      label: "Citas próximas",
      hint: "Hoy, mañana y próximos días",
      valor: citasActivas.length,
      to: "/citas",
      items: citasActivas
        .slice(0, 4)
        .map((c) => `${c.clienteNombre} · ${formatFecha(c.fecha)} ${c.hora} · ${c.servicioNombre ?? ""}`),
    },
    {
      icon: Bell,
      label: "Mantenimientos no programados",
      hint: "Clientas que ya deberían agendar",
      valor: mantenimientos.length,
      to: "/citas",
      items: mantenimientos
        .slice(0, 4)
        .map((m) => `${m.clienteNombre} · sugerida ${formatFecha(m.fechaSugerida)}`),
    },
    {
      icon: PackageX,
      label: "Stock bajo",
      hint: "Productos por debajo del umbral",
      valor: stockBajoLista.length,
      to: "/inventario",
      items: stockBajoLista.slice(0, 4).map((p) => `${p.nombre} · ${p.stockTotal} disponibles`),
    },
    {
      icon: Timer,
      label: "Caducidad",
      hint: "Lotes vencidos o próximos a vencer",
      valor: caducidadLista.length,
      to: "/inventario",
      items: caducidadLista
        .slice(0, 4)
        .map(
          (l) =>
            `${l.productoNombre} · Lote ${l.numeroLote || l.id.slice(0, 8)} · ${formatFecha(l.fechaCaducidad)}`,
        ),
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Dashboard" subtitle="Lo que necesitas saber hoy para operar la cabina" />

      {esHoraDelCorte && (
        <div className="mx-8 mt-6 flex items-center justify-between rounded-2xl border border-jacaranda-300 bg-jacaranda-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <Lock size={20} className="text-jacaranda-600" />
            <div>
              <p className="font-medium text-jacaranda-800">Es hora del corte de caja</p>
              <p className="text-sm text-jacaranda-700">
                ${corteResumen!.total.toFixed(2)} pendientes de cortar ({corteResumen!.cantidadPagos} pagos).
              </p>
            </div>
          </div>
          <Link to="/corte">
            <Button size="sm">Hacer corte</Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-8 md:grid-cols-2 xl:grid-cols-4">
        {ALERTAS.map(({ icon: Icon, label, hint, valor, to, items }) => (
          <Link key={label} to={to}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">{label}</CardTitle>
                <Icon size={18} className="text-jacaranda-500" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-ink-900">{valor}</p>
                <p className="text-xs text-ink-500">{hint}</p>
                {items.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5 border-t border-beige-200 pt-3">
                    {items.map((item, i) => (
                      <li key={i} className="truncate text-xs text-ink-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="px-8 pb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays size={18} className="text-jacaranda-500" /> Citas de hoy
            </CardTitle>
            <Link to="/citas" className="text-xs font-medium text-jacaranda-600 hover:text-jacaranda-700">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent>
            {citasHoy.length === 0 ? (
              <p className="text-sm text-ink-500">No tienes citas el día de hoy.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-beige-200">
                {citasHoy.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{c.clienteNombre}</p>
                      <p className="truncate text-xs text-ink-500">{c.servicioNombre ?? "Sin servicio"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-medium text-ink-700">{c.hora}</span>
                      <Badge variant={c.estado === "confirmada" ? "success" : "jacaranda"}>
                        {c.estado === "confirmada" ? "Confirmada" : "Programada"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
