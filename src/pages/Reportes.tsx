import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { FiltrosReportes } from "@/components/reportes/FiltrosReportes";
import { ResumenReportes } from "@/components/reportes/ResumenReportes";
import { FinanzasReportes } from "@/components/reportes/FinanzasReportes";
import { ServiciosReportes } from "@/components/reportes/ServiciosReportes";
import { ClientesReportes } from "@/components/reportes/ClientesReportes";
import { AgendaReportes } from "@/components/reportes/AgendaReportes";
import { InventarioReportes } from "@/components/reportes/InventarioReportes";
import { fechaLocalIso, inicioDeMesIso } from "@shared/fechas";
import type { RangoFechas, ResumenFiltro } from "@shared/schemas";

const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "finanzas", label: "Finanzas" },
  { value: "servicios", label: "Servicios" },
  { value: "clientes", label: "Clientes" },
  { value: "agenda", label: "Agenda" },
  { value: "inventario", label: "Inventario" },
];

export function ReportesPage() {
  const [tab, setTab] = useState("resumen");
  const [rango, setRango] = useState<RangoFechas>({ fechaDesde: inicioDeMesIso(), fechaHasta: fechaLocalIso() });
  const [comparacion, setComparacion] = useState<ResumenFiltro["comparacion"]>("anterior");

  const filtroResumen: ResumenFiltro = { ...rango, comparacion };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Reportes" subtitle="Inteligencia del negocio: ventas, margen, clientas e inventario" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <FiltrosReportes rango={rango} comparacion={comparacion} onRango={setRango} onComparacion={setComparacion} />

      {tab === "resumen" && <ResumenReportes filtro={filtroResumen} onNavegarTab={setTab} />}
      {tab === "finanzas" && <FinanzasReportes filtro={filtroResumen} onNavegarTab={setTab} />}
      {tab === "servicios" && <ServiciosReportes filtro={filtroResumen} />}
      {tab === "clientes" && <ClientesReportes filtro={filtroResumen} />}
      {tab === "agenda" && <AgendaReportes filtro={filtroResumen} />}
      {tab === "inventario" && <InventarioReportes filtro={filtroResumen} />}
    </div>
  );
}
