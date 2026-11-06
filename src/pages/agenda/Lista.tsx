import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlarmClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  IdCard,
  Repeat,
  Search,
  SearchX,
  Wallet,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { StatChip } from "@/components/ui/stat-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Paginador, usePaginacion } from "@/components/ui/paginador";
import { IlustracionCalendario } from "@/components/ui/ilustraciones";
import { formatMoneda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NuevaCitaModal } from "@/pages/agenda/NuevaCitaModal";
import { CitaDetalleModal, ESTADO_CITA, ESTADOS_VIGENTES, colorEstadoCita } from "@/pages/agenda/CitaDetalleModal";
import { fechaLocalIso, horaLocal } from "@shared/fechas";
import type { CitasFiltro } from "@shared/schemas";
import type { Cliente, CitaRow } from "@shared/types";

/** "no_aplica" = la cita aún no se cierra, así que no tiene un estatus de pago que mostrar o filtrar. */
function estatusPagoCita(c: CitaRow): "pagado" | "pendiente" | "no_aplica" {
  if (!c.servicioRealizadoId) return "no_aplica";
  return c.saldoPendiente > 0.005 ? "pendiente" : "pagado";
}

/** Franja de color a la izquierda de cada cita: mismos tonos que los eventos del Calendario. */
type Periodo = "proximas" | "anteriores" | "todas";

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "proximas", label: "Hoy y próximas" },
  { value: "anteriores", label: "Anteriores" },
  { value: "todas", label: "Todas" },
];

/**
 * Pestaña con la que abre la lista. Por defecto "Hoy y próximas" (patrón de agendas: lo de hoy
 * primero). Si se llega desde un enlace de cobranza o de una clienta, "Todas", porque los saldos
 * suelen ser de citas pasadas.
 */
function periodoInicial(params: URLSearchParams, hoy: string): Periodo {
  if (params.get("pago") || params.get("clienteId")) return "todas";
  const hasta = params.get("hasta");
  if (hasta && hasta < hoy) return "anteriores";
  return "proximas";
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Encabezado de cada día: "Hoy", "Mañana", "Ayer" o el día de la semana, con la fecha larga. */
function etiquetaDia(fecha: string, hoy: string): { titulo: string; detalle: string } {
  const d = parseISO(fecha);
  const mismoAnio = fecha.slice(0, 4) === hoy.slice(0, 4);
  const largo = format(d, mismoAnio ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  const base = parseISO(hoy);
  if (fecha === hoy) return { titulo: "Hoy", detalle: largo };
  if (fecha === fechaLocalIso(addDays(base, 1))) return { titulo: "Mañana", detalle: largo };
  if (fecha === fechaLocalIso(addDays(base, -1))) return { titulo: "Ayer", detalle: largo };
  return { titulo: capitalizar(largo), detalle: "" };
}

interface ListaTabProps {
  onCerrarCita: (citaId: string) => void;
}

/**
 * Todas las citas, agrupadas por día. Cada cita es una tarjeta con una sola acción a la vista
 * (Cerrar o Cobrar, según lo que toque); el clic en la tarjeta abre el mismo detalle que el
 * Calendario, desde donde se hace todo lo demás: abonos, anticipos, cancelar pagos, confirmar,
 * reagendar, cancelar, reactivar y eliminar.
 */
export function ListaTab({ onCerrarCita }: ListaTabProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filtro, setFiltro] = useState<CitasFiltro>(() => ({
    fechaDesde: searchParams.get("desde") ?? undefined,
    fechaHasta: searchParams.get("hasta") ?? undefined,
  }));

  const [filtrosPago, setFiltrosPago] = useState<string[]>(
    () => searchParams.get("pago")?.split(",").filter(Boolean) ?? [],
  );
  const [detalle, setDetalle] = useState<{ cita: CitaRow; cobrar: boolean } | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoInicial(searchParams, fechaLocalIso()));
  const [citaReagendar, setCitaReagendar] = useState<CitaRow | null>(null);

  // Si se llega desde un enlace (ej. la tarjeta "Citas próximas" del Dashboard, o el flag de
  // "Pago pendiente" de una clienta) mientras esta pestaña ya estaba montada, el filtro debe
  // reaccionar al cambio de la URL.
  useEffect(() => {
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    if (desde || hasta) {
      setFiltro((f) => ({ ...f, fechaDesde: desde ?? f.fechaDesde, fechaHasta: hasta ?? f.fechaHasta }));
    }
    const pago = searchParams.get("pago");
    if (pago) setFiltrosPago(pago.split(",").filter(Boolean));
  }, [searchParams]);

  const { data: citas = [] } = useQuery({
    queryKey: ["citas", filtro],
    queryFn: () => window.api.citas.listar(filtro),
  });

  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  // Si se llega desde un enlace con "clienteId" (ej. el flag "Pago pendiente" de una clienta en
  // el listado de Clientes), se precarga esa clienta como si se hubiera buscado a mano.
  useEffect(() => {
    const clienteId = searchParams.get("clienteId");
    if (!clienteId || clienteSeleccionado?.id === clienteId) return;
    window.api.clientes.obtenerExpediente(clienteId).then((cliente) => {
      if (cliente) {
        setClienteSeleccionado(cliente);
        setFiltro((f) => ({ ...f, clienteId: cliente.id }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data: resumenCliente } = useQuery({
    queryKey: ["resumenCliente", clienteSeleccionado?.id],
    queryFn: () => window.api.citas.resumenCliente(clienteSeleccionado!.id),
    enabled: !!clienteSeleccionado,
  });

  function seleccionarCliente(c: Cliente | null) {
    setClienteSeleccionado(c);
    setFiltro((f) => ({ ...f, clienteId: c?.id }));
  }

  const hoy = fechaLocalIso();
  const ahora = `${hoy} ${horaLocal()}`;

  // Filtros de pago sobre todo lo cargado; la pestaña (periodo) se aplica después, así los
  // contadores de pendientes ven también los días que la pestaña oculta.
  const filtradas = useMemo(
    () => (filtrosPago.length > 0 ? citas.filter((c) => filtrosPago.includes(estatusPagoCita(c))) : citas),
    [citas, filtrosPago],
  );

  const ordenadas = useMemo(() => {
    if (periodo === "proximas") {
      // Hoy primero y luego hacia adelante, en el orden en que se van a vivir.
      return filtradas
        .filter((c) => c.fecha >= hoy)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
    }
    // Anteriores / Todas: el día más reciente primero; dentro del día, en orden de hora.
    return filtradas
      .filter((c) => periodo === "todas" || c.fecha < hoy)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.hora.localeCompare(b.hora));
  }, [filtradas, periodo, hoy]);

  // Citas de días anteriores que siguen sin cerrar: en "Hoy y próximas" no se ven, así que se
  // avisan arriba con un atajo.
  const pendientesAnteriores = useMemo(
    () => filtradas.filter((c) => c.fecha < hoy && (c.estado === "programada" || c.estado === "confirmada")).length,
    [filtradas, hoy],
  );

  const claveFiltros = `${periodo}|${filtro.fechaDesde}|${filtro.fechaHasta}|${(filtro.estados ?? []).join()}|${filtrosPago.join()}|${clienteSeleccionado?.id ?? ""}`;
  const paginacion = usePaginacion(ordenadas, claveFiltros);

  // Citas por día en toda la vista (no solo en la página), para el contador de cada día.
  const totalPorDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of ordenadas) m.set(c.fecha, (m.get(c.fecha) ?? 0) + 1);
    return m;
  }, [ordenadas]);

  const grupos = useMemo(() => {
    const porDia = new Map<string, CitaRow[]>();
    for (const c of paginacion.visibles) {
      const lista = porDia.get(c.fecha);
      if (lista) lista.push(c);
      else porDia.set(c.fecha, [c]);
    }
    return [...porDia.entries()].map(([fecha, lista]) => ({ fecha, citas: lista }));
  }, [paginacion.visibles]);

  // Franja de stats: se calcula de lo ya cargado, cero queries nuevas.
  const sinCerrar = filtradas.filter(
    (c) => (c.estado === "programada" || c.estado === "confirmada") && `${c.fecha} ${c.hora}` <= ahora,
  ).length;
  const conSaldo = filtradas.filter((c) => estatusPagoCita(c) === "pendiente");
  const totalSaldo = conSaldo.reduce((s, c) => s + c.saldoPendiente, 0);

  // Distingue "aún no hay citas" (vacío real) de "ninguna coincide" (vacío por filtros) para el
  // EmptyState §2 — sin disparar queries nuevas, solo mirando los filtros ya en estado.
  const hayFiltrosActivos = !!(
    filtro.fechaDesde ||
    filtro.fechaHasta ||
    (filtro.estados && filtro.estados.length > 0) ||
    filtrosPago.length > 0 ||
    clienteSeleccionado
  );

  // El detalle siempre muestra la versión más reciente de la cita (tras confirmar, cobrar, etc.).
  const citaDetalle = detalle ? (citas.find((c) => c.id === detalle.cita.id) ?? detalle.cita) : null;

  return (
    <div className="p-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-beige-300 bg-beige-50 p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriodo(p.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                periodo === p.value ? "bg-jacaranda-600 text-beige-50 shadow-sm" : "text-ink-600 hover:bg-beige-200",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <BuscadorCliente seleccionado={clienteSeleccionado} onSeleccionar={seleccionarCliente} />
        <MultiSelect
          options={ESTADOS_VIGENTES.map(([valor, { label }]) => ({ value: valor, label }))}
          selected={filtro.estados ?? []}
          onChange={(estados) => setFiltro({ ...filtro, estados: estados.length > 0 ? estados : undefined })}
          placeholder="Todos los estados"
          className="min-w-[170px]"
        />
        <MultiSelect
          options={[
            { value: "pendiente", label: "Pago pendiente" },
            { value: "pagado", label: "Pagado" },
          ]}
          selected={filtrosPago}
          onChange={setFiltrosPago}
          placeholder="Todos los pagos"
          className="min-w-[160px]"
        />
        <RangoFechas
          desde={filtro.fechaDesde}
          hasta={filtro.fechaHasta}
          onDesde={(v) => setFiltro({ ...filtro, fechaDesde: v })}
          onHasta={(v) => setFiltro({ ...filtro, fechaHasta: v })}
        />
      </div>

      {clienteSeleccionado ? (
        <Card className="aparecer-suave mb-5 flex flex-wrap items-center gap-4 p-4">
          <Avatar nombre={clienteSeleccionado.nombreCompleto} size="lg" apagado={!clienteSeleccionado.activo} />
          <div className="min-w-[160px] flex-1">
            <p className="text-lg font-semibold text-ink-900">{clienteSeleccionado.nombreCompleto}</p>
            <p className="text-sm text-ink-500">{clienteSeleccionado.codigoCliente}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <DatoResumen label="Servicios" valor={String(resumenCliente?.serviciosCerrados ?? "—")} />
            <DatoResumen label="Cobrado" valor={formatMoneda(resumenCliente?.totalCobrado)} />
            <DatoResumen
              label="Saldo"
              valor={formatMoneda(resumenCliente?.saldoPendiente)}
              tono={resumenCliente && resumenCliente.saldoPendiente > 0.005 ? "danger" : "success"}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/clientes?expediente=${clienteSeleccionado.id}`)}
          >
            <IdCard size={14} /> Ver ficha
          </Button>
        </Card>
      ) : (
        citas.length > 0 && (
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatChip
              icon={CalendarDays}
              valor={ordenadas.length}
              label={ordenadas.length === 1 ? "Cita en esta pestaña" : "Citas en esta pestaña"}
            />
            <StatChip
              icon={AlarmClock}
              valor={sinCerrar}
              label="Ya pasó la hora y siguen sin cerrar"
              tono={sinCerrar > 0 ? "warning" : "neutral"}
            />
            <StatChip
              icon={Wallet}
              valor={formatMoneda(totalSaldo)}
              label={`Por cobrar en ${conSaldo.length} ${conSaldo.length === 1 ? "cita" : "citas"}`}
              tono={totalSaldo > 0.005 ? "danger" : "neutral"}
            />
          </div>
        )
      )}

      {periodo === "proximas" && pendientesAnteriores > 0 && (
        <button
          type="button"
          onClick={() => {
            setPeriodo("anteriores");
            setFiltro((f) => ({ ...f, estados: ["programada", "confirmada"] }));
          }}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-left text-sm text-ink-900 transition-colors hover:bg-warning-500/15"
        >
          <AlarmClock size={18} className="shrink-0 text-warning-500" />
          <span className="flex-1">
            {pendientesAnteriores === 1
              ? "Hay 1 cita de días anteriores sin cerrar."
              : `Hay ${pendientesAnteriores} citas de días anteriores sin cerrar.`}
          </span>
          <span className="flex items-center gap-1 font-medium text-warning-500">
            Ver <ChevronRight size={16} />
          </span>
        </button>
      )}

      <div key={`${claveFiltros}|${paginacion.pagina}`} className="aparecer-suave flex flex-col gap-6">
        {grupos.map(({ fecha, citas: delDia }) => {
          const { titulo, detalle: fechaLarga } = etiquetaDia(fecha, hoy);
          return (
            <section key={fecha}>
              <div className="mb-2 flex items-baseline gap-2 px-1">
                <h3 className={cn("font-semibold", fecha === hoy ? "text-jacaranda-700" : "text-ink-900")}>
                  {titulo}
                </h3>
                {fechaLarga && <span className="text-sm text-ink-500">{fechaLarga}</span>}
                <span className="ml-auto text-xs text-ink-400">
                  {totalPorDia.get(fecha)} {totalPorDia.get(fecha) === 1 ? "cita" : "citas"}
                </span>
              </div>
              <Card className="divide-y divide-beige-200 overflow-hidden">
                {delDia.map((c) => (
                  <TarjetaCita
                    key={c.id}
                    cita={c}
                    ahora={ahora}
                    onAbrir={() => setDetalle({ cita: c, cobrar: false })}
                    onCobrar={() => setDetalle({ cita: c, cobrar: true })}
                    onCerrar={() => onCerrarCita(c.id)}
                  />
                ))}
              </Card>
            </section>
          );
        })}

        {grupos.length === 0 && (
          <Card className="px-4 py-6">
            {hayFiltrosActivos ? (
              <EmptyState
                icon={SearchX}
                mensaje="Ninguna cita coincide con los filtros."
                submensaje="Ajusta las fechas, el estado, el pago o la clienta, o cambia de pestaña."
              />
            ) : citas.length > 0 ? (
              <EmptyState
                ilustracion={IlustracionCalendario}
                mensaje={periodo === "proximas" ? "No hay citas de hoy en adelante." : "No hay citas anteriores."}
                submensaje={
                  periodo === "proximas"
                    ? "Agenda una con el botón “Nueva cita” de arriba."
                    : "Aquí aparecerán las citas de días pasados."
                }
              />
            ) : (
              <EmptyState
                ilustracion={IlustracionCalendario}
                mensaje="Aún no hay citas registradas."
                submensaje="Agenda tu primera cita con el botón “Nueva cita” de arriba."
              />
            )}
          </Card>
        )}

        {ordenadas.length > 0 && (
          <Paginador {...paginacion} sustantivo={["cita", "citas"]} onCambiar={paginacion.irA} />
        )}
      </div>

      {citaDetalle && (
        <CitaDetalleModal
          key={citaDetalle.id}
          cita={citaDetalle}
          cobrarAlAbrir={detalle!.cobrar}
          onClose={() => setDetalle(null)}
          onCerrarCita={onCerrarCita}
          onReagendar={setCitaReagendar}
        />
      )}

      <NuevaCitaModal open={!!citaReagendar} citaEditar={citaReagendar} onClose={() => setCitaReagendar(null)} />
    </div>
  );
}

/**
 * Una cita en la lista. Toda la tarjeta abre el detalle; a la vista solo queda la acción que toca
 * ahora: "Cerrar cita" si sigue activa (resaltada si ya pasó la hora) o "Cobrar" si quedó saldo.
 */
function TarjetaCita({
  cita,
  ahora,
  onAbrir,
  onCobrar,
  onCerrar,
}: {
  cita: CitaRow;
  ahora: string;
  onAbrir: () => void;
  onCobrar: () => void;
  onCerrar: () => void;
}) {
  const estado = ESTADO_CITA[cita.estado] ?? { label: cita.estado, variant: "neutral" as const };
  const activa = cita.estado === "programada" || cita.estado === "confirmada";
  const sinCerrar = activa && `${cita.fecha} ${cita.hora}` <= ahora;
  const pago = estatusPagoCita(cita);
  const apagada = cita.estado === "cancelada" || cita.estado === "no_asistio";

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onAbrir();
    }
  }

  function accion(fn: () => void) {
    return (e: ReactMouseEvent) => {
      e.stopPropagation();
      fn();
    };
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={alTeclear}
      title="Ver detalle de la cita"
      className="group relative flex cursor-pointer items-center gap-4 py-3 pl-5 pr-4 transition-colors hover:bg-beige-100 focus-visible:bg-beige-100 focus-visible:outline-none"
    >
      <span
        className="absolute inset-y-2 left-0 w-1 rounded-r-full"
        style={{ backgroundColor: colorEstadoCita(cita.estado) }}
      />

      <div className="w-14 shrink-0">
        <p className={cn("text-base font-semibold tabular-nums", apagada ? "text-ink-400" : "text-ink-900")}>
          {cita.hora}
        </p>
        {cita.duracionMin ? <p className="text-xs text-ink-400">{cita.duracionMin} min</p> : null}
      </div>

      <Avatar nombre={cita.clienteNombre} apagado={apagada} />

      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", apagada ? "text-ink-500" : "text-ink-900")}>{cita.clienteNombre}</p>
        <p className="flex items-center gap-2 truncate text-sm text-ink-500">
          <span className="truncate">{cita.servicioNombre || "Sin servicio asignado"}</span>
          {cita.esMantenimiento && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-jacaranda-600">
              <Repeat size={12} /> Mantenimiento
            </span>
          )}
        </p>
      </div>

      <div className="hidden shrink-0 items-center justify-end gap-1.5 md:flex">
        <Badge variant={estado.variant}>{estado.label}</Badge>
        {sinCerrar && <Badge variant="warning">Sin cerrar</Badge>}
        {pago === "pendiente" && <Badge variant="danger">Debe {formatMoneda(cita.saldoPendiente)}</Badge>}
        {pago === "pagado" && <Badge variant="success">Pagado</Badge>}
      </div>

      <div className="flex w-[124px] shrink-0 justify-end">
        {activa && (
          <Button size="sm" variant={sinCerrar ? "primary" : "secondary"} onClick={accion(onCerrar)}>
            <CheckCircle2 size={14} /> Cerrar cita
          </Button>
        )}
        {pago === "pendiente" && (
          <Button size="sm" onClick={accion(onCobrar)}>
            <Wallet size={14} /> Cobrar
          </Button>
        )}
      </div>

      <ChevronRight
        size={18}
        className="shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-jacaranda-600"
      />
    </div>
  );
}

function DatoResumen({ label, valor, tono }: { label: string; valor: string; tono?: "danger" | "success" }) {
  return (
    <div className="min-w-[96px] rounded-xl bg-beige-100 px-3 py-2">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          tono === "danger" ? "text-danger-500" : tono === "success" ? "text-success-500" : "text-ink-900",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

function BuscadorCliente({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado: Cliente | null;
  onSeleccionar: (cliente: Cliente | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });

  useEffect(() => {
    function alClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, []);

  if (seleccionado) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-lg border border-beige-300 bg-beige-50 px-3 text-sm">
        <span className="font-medium text-ink-900">{seleccionado.nombreCompleto}</span>
        <span className="text-xs text-ink-500">{seleccionado.codigoCliente}</span>
        <button
          type="button"
          onClick={() => onSeleccionar(null)}
          className="text-ink-500 hover:text-danger-500"
          title="Quitar filtro de clienta"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const coincidencias =
    texto.trim().length > 0
      ? clientes
          .filter(
            (c) =>
              c.nombreCompleto.toLowerCase().includes(texto.toLowerCase()) ||
              c.codigoCliente.toLowerCase().includes(texto.toLowerCase()),
          )
          .slice(0, 8)
      : [];

  return (
    <div className="relative" ref={contenedorRef}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300" />
        <Input
          placeholder="Buscar por nombre o código..."
          value={texto}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          className="max-w-xs min-w-[220px] pl-8"
        />
      </div>
      {abierto && coincidencias.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full min-w-[220px] overflow-y-auto rounded-lg border border-beige-300 bg-beige-50 shadow-lg">
          {coincidencias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSeleccionar(c);
                setTexto("");
                setAbierto(false);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-beige-200"
            >
              <span className="font-medium text-ink-900">{c.nombreCompleto}</span>
              <span className="text-xs text-ink-500">{c.codigoCliente}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Rango Desde–Hasta agrupado en un solo control visual (§1): dos inputs de fecha nativos unidos
 * por un guion, dentro de un contenedor con borde común — en vez de dos <Input> sueltos con label.
 */
function RangoFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde?: string;
  hasta?: string;
  onDesde: (valor?: string) => void;
  onHasta: (valor?: string) => void;
}) {
  return (
    <div className="flex h-10 items-center gap-1.5 rounded-xl border border-beige-300 bg-beige-50 px-3">
      <input
        type="date"
        value={desde ?? ""}
        onChange={(e) => onDesde(e.target.value || undefined)}
        aria-label="Desde"
        className="w-[118px] border-0 bg-transparent p-0 text-sm text-ink-900 focus:outline-none focus:ring-0"
      />
      <span className="text-ink-400">–</span>
      <input
        type="date"
        value={hasta ?? ""}
        onChange={(e) => onHasta(e.target.value || undefined)}
        aria-label="Hasta"
        className="w-[118px] border-0 bg-transparent p-0 text-sm text-ink-900 focus:outline-none focus:ring-0"
      />
    </div>
  );
}
