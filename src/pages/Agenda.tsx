import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { CalendarioTab } from "@/pages/agenda/Calendario";
import { NuevaCitaModal } from "@/pages/agenda/NuevaCitaModal";
import { CierreCitaModal } from "@/pages/agenda/CierreCitaModal";

export function AgendaPage() {
  const [nuevaCitaAbierta, setNuevaCitaAbierta] = useState(false);
  const [fechaNuevaCita, setFechaNuevaCita] = useState<string | undefined>(undefined);
  const [citaEnCierre, setCitaEnCierre] = useState<string | null>(null);

  function abrirNuevaCita(fecha?: string) {
    setFechaNuevaCita(fecha);
    setNuevaCitaAbierta(true);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title="Agenda"
        subtitle="Representación visual de todas tus citas"
        actions={
          <Button size="sm" onClick={() => abrirNuevaCita()}>
            <Plus size={16} /> Nueva cita
          </Button>
        }
      />

      <CalendarioTab onCerrarCita={setCitaEnCierre} onNuevaCita={(fecha) => abrirNuevaCita(fecha)} />

      <NuevaCitaModal
        open={nuevaCitaAbierta}
        onClose={() => setNuevaCitaAbierta(false)}
        fechaInicial={fechaNuevaCita}
      />

      {citaEnCierre && <CierreCitaModal citaId={citaEnCierre} onClose={() => setCitaEnCierre(null)} />}
    </div>
  );
}
