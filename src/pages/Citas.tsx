import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ListaTab } from "@/pages/agenda/Lista";
import { NuevaCitaModal } from "@/pages/agenda/NuevaCitaModal";
import { CierreCitaModal } from "@/pages/agenda/CierreCitaModal";

export function CitasPage() {
  const [nuevaCitaAbierta, setNuevaCitaAbierta] = useState(false);
  const [citaEnCierre, setCitaEnCierre] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title="Citas"
        subtitle="Gestión completa: crear, reagendar, cancelar y cerrar"
        actions={
          <Button size="sm" onClick={() => setNuevaCitaAbierta(true)}>
            <Plus size={16} /> Nueva cita
          </Button>
        }
      />

      <ListaTab onCerrarCita={setCitaEnCierre} />

      <NuevaCitaModal open={nuevaCitaAbierta} onClose={() => setNuevaCitaAbierta(false)} />

      {citaEnCierre && <CierreCitaModal citaId={citaEnCierre} onClose={() => setCitaEnCierre(null)} />}
    </div>
  );
}
