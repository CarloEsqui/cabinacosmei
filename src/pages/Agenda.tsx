import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { CalendarioTab } from "@/pages/agenda/Calendario";
import { NuevaCitaModal } from "@/pages/agenda/NuevaCitaModal";
import { CierreCitaModal } from "@/pages/agenda/CierreCitaModal";

export function AgendaPage() {
  const [nuevaCitaAbierta, setNuevaCitaAbierta] = useState(false);
  const [clienteNuevaCita, setClienteNuevaCita] = useState<string | undefined>(undefined);
  const [fechaNuevaCita, setFechaNuevaCita] = useState<string | undefined>(undefined);
  const [horaNuevaCita, setHoraNuevaCita] = useState<string | undefined>(undefined);
  const [citaEnCierre, setCitaEnCierre] = useState<string | null>(null);

  function abrirNuevaCita(opciones?: { clienteId?: string; fecha?: string; hora?: string }) {
    setClienteNuevaCita(opciones?.clienteId);
    setFechaNuevaCita(opciones?.fecha);
    setHoraNuevaCita(opciones?.hora);
    setNuevaCitaAbierta(true);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Agenda"
        subtitle="Representación visual de todas tus citas"
        actions={
          <Button size="sm" onClick={() => abrirNuevaCita()}>
            <Plus size={16} /> Nueva cita
          </Button>
        }
      />

      <CalendarioTab
        onCerrarCita={setCitaEnCierre}
        onNuevaCita={(fecha, hora) => abrirNuevaCita({ fecha, hora })}
      />

      <NuevaCitaModal
        open={nuevaCitaAbierta}
        onClose={() => setNuevaCitaAbierta(false)}
        clienteInicial={clienteNuevaCita}
        fechaInicial={fechaNuevaCita}
        horaInicial={horaNuevaCita}
      />

      {citaEnCierre && (
        <CierreCitaModal
          citaId={citaEnCierre}
          onClose={() => setCitaEnCierre(null)}
          onAgendarMantenimiento={(clienteId, fecha) => abrirNuevaCita({ clienteId, fecha })}
        />
      )}
    </div>
  );
}
