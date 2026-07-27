import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  Bell,
  PackageX,
  Timer,
  Lock,
  CalendarDays,
  CalendarPlus,
  Wallet,
  Receipt,
  Sparkles,
  Users,
  UserPlus,
  Package,
} from "lucide-react";
import { motion } from "framer-motion";
import { WelcomeGreeting } from "@/components/WelcomeGreeting";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { IlustracionCalendario, IlustracionPaquete } from "@/components/ui/ilustraciones";
import { RamaJacaranda } from "@/components/ui/decoracion";
import { formatFecha, formatMoneda, formatearStock } from "@/lib/format";
import { fechaLocalIso, sumarDiasIso } from "@shared/fechas";

const HOY = fechaLocalIso();
const EN_7_DIAS = sumarDiasIso(HOY, 7);

// Entrada escalonada: el contenedor reparte la aparición de sus hijos; cada tarjeta aparece con un
// fade + leve subida. Da un arranque más "premium" sin distraer.
const contenedorVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const tarjetaVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};

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
  const { data: kpis } = useQuery({
    queryKey: ["dashboardResumen"],
    queryFn: () => window.api.dashboard.resumen(),
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
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
  const siguienteCita = citasActivas[0];

  const ALERTAS = [
    {
      icon: CalendarClock,
      label: "Citas próximas",
      hint: "Hoy, mañana y próximos días",
      valor: citasActivas.length,
      to: `/citas?desde=${HOY}&hasta=${EN_7_DIAS}`,
      ilustracion: IlustracionCalendario,
      vacio: "Sin citas en los próximos días.",
      items: citasActivas
        .slice(0, 4)
        .map((c) => `${c.clienteNombre} · ${formatFecha(c.fecha)} ${c.hora} · ${c.servicioNombre ?? ""}`),
    },
    {
      icon: Bell,
      label: "Mantenimientos no programados",
      hint: "Clientas que ya deberían agendar",
      valor: mantenimientos.length,
      to: "/citas?vista=mantenimientos",
      ilustracion: IlustracionCalendario,
      vacio: "Nadie pendiente de reagendar.",
      items: mantenimientos
        .slice(0, 4)
        .map((m) => `${m.clienteNombre} · sugerida ${formatFecha(m.fechaSugerida)}`),
    },
    {
      icon: PackageX,
      label: "Stock bajo",
      hint: "Productos por debajo del umbral",
      valor: stockBajoLista.length,
      to: "/inventario?tab=resumen&semaforo=critico,bajo",
      ilustracion: IlustracionPaquete,
      vacio: "Inventario con buen nivel.",
      items: stockBajoLista
        .slice(0, 4)
        .map(
          (p) =>
            `${p.nombre} · ${formatearStock(p.stockTotal, p.presentacion, p.contenidoCantidad, p.contenidoUnidad)}`,
        ),
    },
    {
      icon: Timer,
      label: "Caducidad",
      hint: "Lotes vencidos o próximos a vencer",
      valor: caducidadLista.length,
      to: "/inventario?tab=caducidad",
      ilustracion: IlustracionPaquete,
      vacio: "Sin lotes por vencer.",
      items: caducidadLista
        .slice(0, 4)
        .map(
          (l) =>
            `${l.productoNombre} · Lote ${l.numeroLote || l.id.slice(0, 8)} · ${formatFecha(l.fechaCaducidad)}`,
        ),
    },
  ];

  const mostrarOnboarding = clientes.length === 0 && resumen.length === 0;

  const enteroFmt = (n: number) => String(Math.round(n));
  const KPIS = kpis
    ? [
        { icon: Wallet, label: "Cobrado hoy", valor: kpis.cobradoHoy, fmt: formatMoneda },
        { icon: Lock, label: "Pendiente de cortar", valor: kpis.pendienteDeCortar, fmt: formatMoneda },
        { icon: Sparkles, label: "Servicios del mes", valor: kpis.serviciosDelMes, fmt: enteroFmt },
        { icon: Receipt, label: "Ticket promedio", valor: kpis.ticketPromedioMes, fmt: formatMoneda },
        { icon: Users, label: "Clientas activas", valor: kpis.clientasActivas, fmt: enteroFmt },
      ]
    : [];

  return (
    <div className="relative flex h-full flex-col overflow-y-auto">
      {/* Hero de bienvenida: superficie de marca (gradiente beige→jacaranda, patrón del hero de
          Reportes) que da peso al saludo y coloca la siguiente cita + acción rápida a la derecha.
          La rama de jacaranda se asoma por el borde, detrás del contenido. */}
      {/* shrink-0 es OBLIGATORIO: como hijo de la columna flex scrolleable, el overflow-hidden
          pone su mínimo en 0 y con escala de texto grande el flex lo colapsaba por completo. */}
      <section className="relative mx-8 mt-6 shrink-0 overflow-hidden rounded-2xl border border-beige-300 bg-gradient-to-br from-beige-50 via-beige-50 to-jacaranda-50/70 shadow-sm shadow-ink-900/[0.03]">
        {/* Anclada a la esquina superior derecha: al cambiar la escala de texto el hero crece hacia
            abajo y la rama sigue abrazando su esquina sin descomponerse. El tronco pasa por detrás
            de la tarjeta translúcida y la masa florida cae en el aire libre del centro. */}
        {/* El ancho es RELATIVO al hero (46%, tope 560px): con escalaTexto 1.25 el hero se estrecha
            y la rama encoge con él, así nunca invade el saludo. */}
        <div className="pointer-events-none absolute -top-1 right-0 hidden w-[46%] max-w-[560px] select-none md:block">
          <RamaJacaranda className="h-auto w-full" />
        </div>
        <div className="relative flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">
            <WelcomeGreeting
              citasProximas={citasActivas.length}
              mantenimientosPendientes={mantenimientos.length}
              stockBajo={stockBajoLista.length}
              proximosACaducar={caducidadLista.length}
            />
          </div>

          {/* Siguiente cita destacada + acción rápida (solo datos ya cargados: citasActivas). */}
          <aside className="flex shrink-0 flex-col gap-2.5 px-8 pb-7 lg:w-[288px] lg:px-0 lg:py-6 lg:pr-7">
            {siguienteCita ? (
              <div className="rounded-2xl border border-jacaranda-200/70 bg-beige-50/85 p-4 shadow-sm shadow-ink-900/[0.04] backdrop-blur-[2px]">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-jacaranda-600">
                  <CalendarClock size={13} className="shrink-0" />
                  Tu siguiente cita
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="metric-value text-2xl leading-none text-ink-900">{siguienteCita.hora}</span>
                  <span className="text-xs text-ink-500">
                    {siguienteCita.fecha === HOY ? "Hoy" : formatFecha(siguienteCita.fecha)}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm font-medium text-ink-900">{siguienteCita.clienteNombre}</p>
                <p className="truncate text-xs text-ink-500">{siguienteCita.servicioNombre ?? "Sin servicio"}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-beige-300 bg-beige-50/85 p-4 shadow-sm shadow-ink-900/[0.03] backdrop-blur-[2px]">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-jacaranda-600">
                  <CalendarClock size={13} className="shrink-0" />
                  Próximas citas
                </p>
                <p className="mt-2 text-sm font-medium text-ink-900">Sin citas próximas</p>
                <p className="text-xs text-ink-500">Un buen momento para agendar.</p>
              </div>
            )}
            <Link to="/agenda">
              <Button className="w-full">
                <CalendarPlus size={16} /> Nueva cita
              </Button>
            </Link>
          </aside>
        </div>
      </section>

      {esHoraDelCorte && (
        <div className="mx-8 mt-6 flex items-center justify-between rounded-2xl border border-jacaranda-300 bg-jacaranda-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <Lock size={20} className="text-jacaranda-600" />
            <div>
              <p className="font-medium text-jacaranda-800">Es hora del corte de caja</p>
              <p className="text-sm text-jacaranda-700">
                {formatMoneda(corteResumen!.total)} pendientes de cortar ({corteResumen!.cantidadPagos} pagos).
              </p>
            </div>
          </div>
          <Link to="/corte">
            <Button size="sm">Hacer corte</Button>
          </Link>
        </div>
      )}

      {mostrarOnboarding && (
        <div className="mx-8 mt-6 rounded-2xl border border-jacaranda-300 bg-jacaranda-50 p-5">
          <p className="font-medium text-jacaranda-800">Primeros pasos</p>
          <p className="mt-1 text-sm text-jacaranda-700">
            Empieza registrando tus productos y a tus clientas para aprovechar el resto de la app.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/configuracion">
              <Button size="sm" variant="secondary">
                <Package size={16} /> Agregar productos
              </Button>
            </Link>
            <Link to="/clientes">
              <Button size="sm" variant="secondary">
                <UserPlus size={16} /> Agregar clienta
              </Button>
            </Link>
            <Link to="/agenda">
              <Button size="sm" variant="secondary">
                <CalendarDays size={16} /> Agendar cita
              </Button>
            </Link>
          </div>
        </div>
      )}

      {kpis && !mostrarOnboarding && (
        <motion.div
          variants={contenedorVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-4 px-8 pt-6 md:grid-cols-3 xl:grid-cols-5"
        >
          {KPIS.map(({ icon: Icon, label, valor, fmt }) => (
            <motion.div key={label} variants={tarjetaVariants}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-3 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-jacaranda-100 text-jacaranda-600">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="metric-value truncate text-2xl leading-none text-ink-900">
                      <AnimatedNumber value={valor} format={fmt} />
                    </p>
                    <p className="mt-1.5 truncate text-xs text-ink-500">{label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <motion.div
        variants={contenedorVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-4 p-8 lg:grid-cols-3"
      >
        {/* Alertas operativas: bloque 2×2 que sostiene el peso de la izquierda. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          {ALERTAS.map(({ icon: Icon, label, hint, valor, to, items, ilustracion: Ilustracion, vacio }) => (
            <motion.div key={label} variants={tarjetaVariants} whileHover={{ y: -3 }}>
              <Link to={to} className="block h-full">
                <Card className="flex h-full flex-col transition-shadow hover:shadow-lg">
                  <CardHeader className="pb-1">
                    <CardTitle icon={Icon}>{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    {valor === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-1 py-3 text-center">
                        <Ilustracion size={72} />
                        <p className="text-sm font-medium text-ink-700">Todo en orden</p>
                        <p className="text-xs text-ink-400">{vacio}</p>
                      </div>
                    ) : (
                      <>
                        <p className="metric-value text-2xl text-ink-900">
                          <AnimatedNumber value={valor} format={(n) => String(Math.round(n))} />
                        </p>
                        <p className="text-xs text-ink-500">{hint}</p>
                        <ul className="mt-3 flex flex-col gap-1.5 border-t border-beige-200 pt-3">
                          {items.map((item, i) => (
                            <li key={i} className="truncate text-xs text-ink-700">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Citas de hoy: columna alta a la derecha que cierra la composición. */}
        <motion.div variants={tarjetaVariants} className="lg:col-span-1">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle icon={CalendarDays}>Citas de hoy</CardTitle>
              <Link to="/citas" className="text-xs font-medium text-jacaranda-600 hover:text-jacaranda-700">
                Ver todas
              </Link>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              {citasHoy.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
                  <IlustracionCalendario size={96} />
                  <p className="text-sm font-medium text-ink-700">Día despejado</p>
                  <p className="max-w-[16rem] text-xs text-ink-400">
                    No tienes citas hoy. Buen momento para ponerte al día.
                  </p>
                </div>
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
        </motion.div>
      </motion.div>

      {/* La decoración de hojas al pie ahora es GLOBAL (AppShell): aparece en todas las páginas
          anclada al viewport, sin duplicarse aquí. */}
    </div>
  );
}
