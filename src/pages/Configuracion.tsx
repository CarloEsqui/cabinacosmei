import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { GeneralTab } from "@/pages/configuracion/General";
import { ProveedoresTab } from "@/pages/configuracion/Proveedores";
import { ProductosTab } from "@/pages/configuracion/Productos";
import { CatalogosTab } from "@/pages/configuracion/Catalogos";
import { ServiciosTab } from "@/pages/configuracion/Servicios";
import { RespaldosTab } from "@/pages/configuracion/Respaldos";
import { BitacoraTab } from "@/pages/configuracion/Bitacora";

const TABS = [
  { value: "general", label: "General" },
  { value: "proveedores", label: "Proveedores" },
  { value: "productos", label: "Productos" },
  { value: "catalogos", label: "Catálogos" },
  { value: "servicios", label: "Servicios" },
  { value: "respaldos", label: "Respaldos" },
  { value: "bitacora", label: "Bitácora" },
];

export function ConfiguracionPage() {
  const [tab, setTab] = useState("general");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Configuración" subtitle="Ajustes generales del sistema" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "general" && <GeneralTab />}
      {tab === "proveedores" && <ProveedoresTab />}
      {tab === "productos" && <ProductosTab />}
      {tab === "catalogos" && <CatalogosTab />}
      {tab === "servicios" && <ServiciosTab />}
      {tab === "respaldos" && <RespaldosTab />}
      {tab === "bitacora" && <BitacoraTab />}
    </div>
  );
}
