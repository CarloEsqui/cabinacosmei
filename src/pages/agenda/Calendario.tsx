import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DateSelectArg } from "@fullcalendar/core";

const COLOR_POR_ESTADO: Record<string, string> = {
  programada: "#7549b3",
  confirmada: "#603a95",
  asistio: "#6f9767",
  no_asistio: "#b8543f",
  cancelada: "#9a8f81",
  reagendada: "#c98a3a",
};

interface CalendarioTabProps {
  onCerrarCita: (citaId: string) => void;
  onNuevaCita: (fecha: string) => void;
}

export function CalendarioTab({ onCerrarCita, onNuevaCita }: CalendarioTabProps) {
  const { data: citas = [] } = useQuery({
    queryKey: ["citas", {}],
    queryFn: () => window.api.citas.listar({}),
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

  function alSeleccionarFecha(info: DateSelectArg) {
    onNuevaCita(info.startStr.slice(0, 10));
  }

  return (
    <div className="p-8">
      <div className="rounded-2xl border border-beige-300 bg-beige-50 p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          locale="es"
          selectable
          height="auto"
          events={eventos}
          eventClick={alHacerClicEnEvento}
          select={alSeleccionarFecha}
        />
      </div>
    </div>
  );
}
