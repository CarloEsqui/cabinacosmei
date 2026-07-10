import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { ResumenTab } from "@/pages/inventario/Resumen";
import { EntradasTab } from "@/pages/inventario/Entradas";
import { SalidasTab } from "@/pages/inventario/Salidas";
import { MovimientosTab } from "@/pages/inventario/Movimientos";
import { CaducidadTab } from "@/pages/inventario/Caducidad";

const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "entradas", label: "Entradas" },
  { value: "salidas", label: "Salidas" },
  { value: "movimientos", label: "Movimientos" },
  { value: "caducidad", label: "Caducidad" },
];

export function InventarioPage() {
  const [tab, setTab] = useState("resumen");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Inventario" subtitle="Lotes, caducidad, entradas, salidas y movimientos" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "resumen" && <ResumenTab />}
      {tab === "entradas" && <EntradasTab />}
      {tab === "salidas" && <SalidasTab />}
      {tab === "movimientos" && <MovimientosTab />}
      {tab === "caducidad" && <CaducidadTab />}
    </div>
  );
}
