import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ListaTab } from "@/pages/agenda/Lista";
import { MantenimientosTab } from "@/pages/agenda/Mantenimientos";
import { NuevaCitaModal } from "@/pages/agenda/NuevaCitaModal";
import { CierreCitaModal } from "@/pages/agenda/CierreCitaModal";
import { RamitaEnFlor } from "@/components/ui/decoracion";

export function CitasPage() {
  // Mismo query (y queryKey) que usa la pestaña de Mantenimientos: el globito y la lista se
  // mantienen sincronizados solos cuando se agenda o descarta un mantenimiento.
  const { data: mantenimientos = [] } = useQuery({
    queryKey: ["mantenimientosNoProgramados"],
    queryFn: () => window.api.citas.mantenimientosNoProgramados(),
  });
  const tabs = [
    { value: "todas", label: "Todas las citas" },
    { value: "mantenimientos", label: "Mantenimientos pendientes", badge: mantenimientos.length },
  ];

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
    <div className="relative isolate flex h-full flex-col overflow-y-auto">
      {/* Decoración de sección (§10): ramita en flor discreta al pie. Va en la página y no en cada
          pestaña, para que no se duplique al cambiar de tab. */}
      <RamitaEnFlor
        className="pointer-events-none absolute bottom-2 left-8 -z-10 hidden select-none lg:block"
        width={200}
        opacity={0.42}
      />
      <PageHeader
        title="Citas"
        subtitle="Gestión completa: crear, reagendar, cancelar y cerrar"
        actions={
          <Button size="sm" onClick={() => abrirNuevaCita()}>
            <Plus size={16} /> Nueva cita
          </Button>
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

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
