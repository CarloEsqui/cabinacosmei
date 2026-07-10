import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ListaTab } from "@/pages/agenda/Lista";
import { MantenimientosTab } from "@/pages/agenda/Mantenimientos";
import { NuevaCitaModal } from "@/pages/agenda/NuevaCitaModal";
import { CierreCitaModal } from "@/pages/agenda/CierreCitaModal";

const TABS = [
  { value: "todas", label: "Todas las citas" },
  { value: "mantenimientos", label: "Mantenimientos pendientes" },
];

export function CitasPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => (searchParams.get("vista") === "mantenimientos" ? "mantenimientos" : "todas"));
  const [nuevaCitaAbierta, setNuevaCitaAbierta] = useState(false);
  const [clienteParaAgendar, setClienteParaAgendar] = useState<string | undefined>(undefined);
  const [fechaParaAgendar, setFechaParaAgendar] = useState<string | undefined>(undefined);
  const [citaEnCierre, setCitaEnCierre] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("vista") === "mantenimientos") setTab("mantenimientos");
  }, [searchParams]);

  function abrirNuevaCita(opciones?: { clienteId?: string; fecha?: string }) {
    setClienteParaAgendar(opciones?.clienteId);
    setFechaParaAgendar(opciones?.fecha);
    setNuevaCitaAbierta(true);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title="Citas"
        subtitle="Gestión completa: crear, reagendar, cancelar y cerrar"
        actions={
          <Button size="sm" onClick={() => abrirNuevaCita()}>
            <Plus size={16} /> Nueva cita
          </Button>
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "todas" && <ListaTab onCerrarCita={setCitaEnCierre} />}
      {tab === "mantenimientos" && (
        <MantenimientosTab onAgendar={(clienteId) => abrirNuevaCita({ clienteId })} />
      )}

      <NuevaCitaModal
        open={nuevaCitaAbierta}
        onClose={() => setNuevaCitaAbierta(false)}
        clienteInicial={clienteParaAgendar}
        fechaInicial={fechaParaAgendar}
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
