import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fechaLocalIso, horaLocal } from "@shared/fechas";
import type { ConfigValues } from "@shared/config";

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

type Vista = (typeof VISTAS)[number]["value"];

interface CalendarioTabProps {
  onCerrarCita: (citaId: string) => void;
  onNuevaCita: (fecha: string, hora?: string) => void;
}

export function CalendarioTab({ onCerrarCita, onNuevaCita }: CalendarioTabProps) {
  const queryClient = useQueryClient();
  const calendarRef = useRef<FullCalendar>(null);
  const [vista, setVista] = useState<Vista>("dayGridMonth");
  const [titulo, setTitulo] = useState("");
  const [configAbierta, setConfigAbierta] = useState(false);

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
  });

  const eventos = useMemo(
    () =>
      citas.map((c) => ({
        id: c.id,
        title: `${c.hora} · ${c.clienteNombre}${c.servicioNombre ? ` — ${c.servicioNombre}` : ""}`,
        start: `${c.fecha}T${c.hora}`,
        backgroundColor: COLOR_POR_ESTADO[c.estado] ?? "#7549b3",
        borderColor: COLOR_POR_ESTADO[c.estado] ?? "#7549b3",
      })),
    [citas],
  );

  function alHacerClicEnEvento(info: EventClickArg) {
    const cita = citas.find((c) => c.id === info.event.id);
    if (cita && (cita.estado === "programada" || cita.estado === "confirmada")) {
      onCerrarCita(cita.id);
    }
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
          slotMinTime={`${horaOFallback(config.agendaHoraInicio, "06:00")}:00`}
          slotMaxTime={`${horaOFallback(config.agendaHoraFin, "22:00")}:00`}
          events={eventos}
          eventClick={alHacerClicEnEvento}
          dateClick={alHacerClicEnFecha}
          datesSet={(arg: DatesSetArg) => setTitulo(arg.view.title)}
        />
      </div>
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Inicio</label>
              <Input
                type="time"
                value={config.agendaHoraInicio}
                onChange={(e) => {
                  // Un campo "time" se vacía momentáneamente mientras se edita (ej. al borrar
                  // para escribir una hora nueva); guardar ese valor vacío rompe las vistas de
                  // semana/día de FullCalendar, así que solo se guarda cuando queda completo.
                  if (e.target.value) onCambiar({ agendaHoraInicio: e.target.value });
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Fin</label>
              <Input
                type="time"
                value={config.agendaHoraFin}
                onChange={(e) => {
                  if (e.target.value) onCambiar({ agendaHoraFin: e.target.value });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
