import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg, EventContentArg, DayHeaderContentArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import { cn } from "@/lib/utils";
import { fechaLocalIso, horaLocal } from "@shared/fechas";
import { CitaDetalleModal, ESTADO_CITA } from "@/pages/agenda/CitaDetalleModal";
import type { ConfigValues } from "@shared/config";
import type { CitaRow } from "@shared/types";

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Defensa extra: si por alguna razón config trae una hora vacía o mal formada, usar un valor
// razonable en vez de pasárselo tal cual a FullCalendar (que crashea con slotMinTime/slotMaxTime
// inválidos en las vistas de semana/día).
function horaOFallback(hora: string, fallback: string): string {
  return HORA_VALIDA.test(hora) ? hora : fallback;
}

const COLOR_POR_ESTADO: Record<string, string> = {
  programada: "#7549b3",
  confirmada: "#603a95",
  asistio: "#6f9767",
  no_asistio: "#b8543f",
  cancelada: "#9a8f81",
  reagendada: "#c98a3a",
};

const VISTAS = [
  { value: "dayGridMonth", label: "Mes" },
  { value: "timeGridWeek", label: "Semana" },
  { value: "timeGridDay", label: "Día" },
] as const;

/** Hora de fin de una cita a partir de su inicio y duración, en la zona horaria local. */
function horaFin(fecha: string, hora: string, duracionMin: number): string {
  const d = new Date(`${fecha}T${hora}`);
  d.setMinutes(d.getMinutes() + duracionMin);
  return `${fechaLocalIso(d)}T${horaLocal(d)}`;
}

/** Suma (o resta) horas a un "HH:MM", acotado a [00:00, 24:00] ("24:00" es válido como tope). */
function horaConMargen(hora: string, deltaHoras: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = Math.min(24 * 60, Math.max(0, (h + deltaHoras) * 60 + m));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Rango de horas visible en semana/día: el override manual del engranito si existe y es
 * coherente (inicio < fin); si no, el horario de atención con 1 h de margen a cada lado.
 */
function rangoVisible(config: ConfigValues): { inicio: string; fin: string; esManual: boolean } {
  const manualInicio = config.agendaHoraInicioManual;
  const manualFin = config.agendaHoraFinManual;
  if (HORA_VALIDA.test(manualInicio) && HORA_VALIDA.test(manualFin) && manualInicio < manualFin) {
    return { inicio: manualInicio, fin: manualFin, esManual: true };
  }
  return {
    inicio: horaConMargen(horaOFallback(config.horarioApertura, "09:00"), -1),
    fin: horaConMargen(horaOFallback(config.horarioCierre, "19:00"), 1),
    esManual: false,
  };
}

/**
 * Evento estilo "chip" para las vistas de semana/día (patrón Fantastical/Notion Calendar):
 * fondo suave del color del estado + barra de acento a la izquierda + texto en tinta, en vez
 * del bloque sólido saturado. Las canceladas se atenúan y tachan.
 */
function ChipEvento({ arg }: { arg: EventContentArg }) {
  const { estado, clienteNombre, servicioNombre, hora } = arg.event.extendedProps as {
    estado: string;
    clienteNombre: string;
    servicioNombre: string | null;
    hora: string;
  };
  const color = COLOR_POR_ESTADO[estado] ?? "#7549b3";
  const atenuada = estado === "cancelada";
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg px-1.5 py-1 text-xs leading-tight",
        atenuada && "opacity-60",
      )}
      style={{ backgroundColor: `${color}24`, borderLeft: `3px solid ${color}` }}
    >
      <span className={cn("truncate font-semibold text-ink-900", atenuada && "line-through")}>
        {hora} · {clienteNombre}
      </span>
      {servicioNombre && <span className="truncate text-ink-500">{servicioNombre}</span>}
    </div>
  );
}

/** Encabezado de día para semana/día: día de la semana chico + número grande, hoy resaltado. */
function EncabezadoDia({ arg }: { arg: DayHeaderContentArg }) {
  const nombreDia = arg.date.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
  return (
    <div className="flex flex-col items-center gap-0.5 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{nombreDia}</span>
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
          arg.isToday ? "bg-jacaranda-600 text-beige-50" : "text-ink-900",
        )}
      >
        {arg.date.getDate()}
      </span>
    </div>
  );
}

type Vista = (typeof VISTAS)[number]["value"];

interface CalendarioTabProps {
  onCerrarCita: (citaId: string) => void;
  onNuevaCita: (fecha: string, hora?: string) => void;
}

export function CalendarioTab({ onCerrarCita, onNuevaCita }: CalendarioTabProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const calendarRef = useRef<FullCalendar>(null);
  const [vista, setVista] = useState<Vista>("dayGridMonth");
  const [titulo, setTitulo] = useState("");
  const [configAbierta, setConfigAbierta] = useState(false);
  const [citaDetalle, setCitaDetalle] = useState<CitaRow | null>(null);

  const { data: citas = [] } = useQuery({
    queryKey: ["citas", {}],
    queryFn: () => window.api.citas.listar({}),
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => window.api.config.obtener(),
  });

  const guardarConfig = useMutation({
    mutationFn: (cambios: Partial<ConfigValues>) => window.api.config.actualizar(cambios),
    onSuccess: (nuevo) => queryClient.setQueryData(["config"], nuevo),
    onError: (e) => toast.error(mensajeDeError(e)),
  });

  const eventos = useMemo(
    () =>
      citas.map((c) => ({
        id: c.id,
        title: `${c.hora} · ${c.clienteNombre}${c.servicioNombre ? ` — ${c.servicioNombre}` : ""}`,
        start: `${c.fecha}T${c.hora}`,
        // Con hora de fin real, el bloque en semana/día mide lo que dura la cita.
        end: horaFin(c.fecha, c.hora, c.duracionMin ?? 60),
        backgroundColor: COLOR_POR_ESTADO[c.estado] ?? "#7549b3",
        borderColor: COLOR_POR_ESTADO[c.estado] ?? "#7549b3",
        extendedProps: {
          estado: c.estado,
          clienteNombre: c.clienteNombre,
          servicioNombre: c.servicioNombre,
          hora: c.hora,
        },
      })),
    [citas],
  );

  // Cualquier cita abre su detalle (antes las canceladas o pasadas no reaccionaban al clic);
  // desde ahí se puede cerrar una pendiente o consultar el expediente de una ya cerrada.
  function alHacerClicEnEvento(info: EventClickArg) {
    const cita = citas.find((c) => c.id === info.event.id);
    if (cita) setCitaDetalle(cita);
  }

  function alHacerClicEnFecha(info: DateClickArg) {
    const fecha = fechaLocalIso(info.date);
    const hora = info.allDay ? undefined : horaLocal(info.date);
    onNuevaCita(fecha, hora);
  }

  function irA(accion: "prev" | "next" | "today") {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (accion === "prev") api.prev();
    else if (accion === "next") api.next();
    else api.today();
  }

  function cambiarVista(nueva: Vista) {
    setVista(nueva);
    calendarRef.current?.getApi().changeView(nueva);
  }

  if (!config) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col p-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => irA("prev")}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => irA("today")}>
            Hoy
          </Button>
          <Button variant="ghost" size="sm" onClick={() => irA("next")}>
            <ChevronRight size={16} />
          </Button>
          <span className="ml-2 text-sm font-semibold capitalize text-ink-900">{titulo}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-beige-300 bg-beige-50 p-0.5">
            {VISTAS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => cambiarVista(v.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  vista === v.value ? "bg-jacaranda-600 text-beige-50" : "text-ink-600 hover:bg-beige-200",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <AgendaConfigMenu
            config={config}
            abierta={configAbierta}
            onAbrirCambiar={setConfigAbierta}
            onCambiar={(cambios) => guardarConfig.mutate(cambios)}
          />
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col rounded-2xl border border-beige-300 bg-beige-50 p-4",
          config.agendaMostrarFraccionesHora && "fc-mostrar-fracciones",
        )}
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          locale="es"
          selectable
          height="100%"
          // Rango visible: horario de atención ± 1 h por defecto, u override manual del engranito.
          slotMinTime={`${rangoVisible(config).inicio}:00`}
          slotMaxTime={`${rangoVisible(config).fin}:00`}
          // Si el horario es corto y sobra espacio vertical, las filas crecen para llenarlo
          // (la altura del CSS actúa como mínimo); con horarios largos se conserva el scroll.
          expandRows
          events={eventos}
          eventClick={alHacerClicEnEvento}
          dateClick={alHacerClicEnFecha}
          datesSet={(arg: DatesSetArg) => setTitulo(arg.view.title)}
          dayMaxEvents={3}
          moreLinkText={(n) => `${n} más`}
          nowIndicator
          allDaySlot={false}
          slotDuration="00:30:00"
          slotLabelInterval="01:00"
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          scrollTime={`${horaOFallback(config.horarioApertura, "09:00")}:00`}
          scrollTimeReset={false}
          businessHours={{
            daysOfWeek: config.diasLaborales,
            startTime: horaOFallback(config.horarioApertura, "09:00"),
            endTime: horaOFallback(config.horarioCierre, "19:00"),
          }}
          // Solo semana/día llevan el rediseño (chips + encabezados); la vista mensual queda igual.
          views={{
            timeGridWeek: {
              eventContent: (arg: EventContentArg) => <ChipEvento arg={arg} />,
              dayHeaderContent: (arg: DayHeaderContentArg) => <EncabezadoDia arg={arg} />,
            },
            timeGridDay: {
              eventContent: (arg: EventContentArg) => <ChipEvento arg={arg} />,
              dayHeaderContent: (arg: DayHeaderContentArg) => <EncabezadoDia arg={arg} />,
            },
          }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {Object.entries(ESTADO_CITA).map(([estado, { label }]) => (
          <span key={estado} className="flex items-center gap-1.5 text-xs text-ink-500">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: COLOR_POR_ESTADO[estado] ?? "#7549b3" }}
            />
            {label}
          </span>
        ))}
      </div>

      {citaDetalle && (
        <CitaDetalleModal
          cita={citaDetalle}
          onClose={() => setCitaDetalle(null)}
          onCerrarCita={onCerrarCita}
        />
      )}
    </div>
  );
}

function AgendaConfigMenu({
  config,
  abierta,
  onAbrirCambiar,
  onCambiar,
}: {
  config: ConfigValues;
  abierta: boolean;
  onAbrirCambiar: (abierta: boolean) => void;
  onCambiar: (cambios: Partial<ConfigValues>) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    function alClickFuera(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onAbrirCambiar(false);
    }
    document.addEventListener("mousedown", alClickFuera);
    return () => document.removeEventListener("mousedown", alClickFuera);
  }, [abierta, onAbrirCambiar]);

  return (
    <div className="relative" ref={menuRef}>
      <Button variant="ghost" size="sm" onClick={() => onAbrirCambiar(!abierta)} title="Configurar vista">
        <Settings size={16} />
      </Button>
      {abierta && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-beige-300 bg-beige-50 p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Vista semana / día</p>
          <label className="mb-3 flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={config.agendaMostrarFraccionesHora}
              onChange={(e) => onCambiar({ agendaMostrarFraccionesHora: e.target.checked })}
            />
            Mostrar líneas de fracción de hora
          </label>
          <HorasVisiblesEditor config={config} onCambiar={onCambiar} />
        </div>
      )}
    </div>
  );
}

/**
 * Editor del rango de horas visible. El predeterminado sigue el horario de atención (± 1 h);
 * editar cualquiera de los dos campos lo convierte en override manual. Los cambios se guardan
 * al SALIR del campo (no en cada tecla — un input "time" controlado que persiste por tecleo se
 * pelea con lo que estás escribiendo).
 */
function HorasVisiblesEditor({
  config,
  onCambiar,
}: {
  config: ConfigValues;
  onCambiar: (cambios: Partial<ConfigValues>) => void;
}) {
  const rango = rangoVisible(config);
  const [inicio, setInicio] = useState(rango.inicio);
  const [fin, setFin] = useState(rango.fin);

  // Si el rango efectivo cambia desde fuera (ej. se restablece al automático o cambia el
  // horario de atención), los campos se resincronizan.
  useEffect(() => {
    setInicio(rango.inicio);
    setFin(rango.fin);
  }, [rango.inicio, rango.fin]);

  const invalido = HORA_VALIDA.test(inicio) && HORA_VALIDA.test(fin) && inicio >= fin;

  // Aplica en vivo: en cuanto el par de horas queda completo y coherente, el calendario cambia
  // al instante (el estado local sigue mandando en el input, así que el tecleo no se interrumpe).
  function guardarSiCompleto(nuevoInicio: string, nuevoFin: string) {
    if (!HORA_VALIDA.test(nuevoInicio) || !HORA_VALIDA.test(nuevoFin) || nuevoInicio >= nuevoFin) return;
    if (nuevoInicio === rango.inicio && nuevoFin === rango.fin) return; // sin cambios reales
    onCambiar({ agendaHoraInicioManual: nuevoInicio, agendaHoraFinManual: nuevoFin });
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-500">Horas visibles</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-ink-500">Desde</label>
          <Input
            type="time"
            value={inicio}
            onChange={(e) => {
              setInicio(e.target.value);
              guardarSiCompleto(e.target.value, fin);
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-500">Hasta</label>
          <Input
            type="time"
            value={fin}
            onChange={(e) => {
              setFin(e.target.value);
              guardarSiCompleto(inicio, e.target.value);
            }}
          />
        </div>
      </div>
      {invalido && <p className="mt-1 text-xs text-danger-500">El inicio debe ser antes que el fin.</p>}
      <p className="mt-2 text-xs text-ink-500">
        {rango.esManual ? (
          <>
            Rango personalizado.{" "}
            <button
              type="button"
              className="font-medium text-jacaranda-700 hover:underline"
              onClick={() => onCambiar({ agendaHoraInicioManual: "", agendaHoraFinManual: "" })}
            >
              Volver al automático
            </button>{" "}
            (horario de atención ± 1 h).
          </>
        ) : (
          <>Automático: tu horario de atención ({config.horarioApertura}–{config.horarioCierre}) ± 1 h.</>
        )}
      </p>
    </div>
  );
}
