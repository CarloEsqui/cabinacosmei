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
import { ManchaOrganica } from "@/components/ui/decoracion";

const TABS = [
  { value: "general", label: "General" },
  { value: "proveedores", label: "Proveedores" },
  { value: "productos", label: "Productos" },
  { value: "catalogos", label: "Categorías" },
  { value: "servicios", label: "Servicios" },
  { value: "respaldos", label: "Respaldos" },
  { value: "bitacora", label: "Bitácora" },
];

export function ConfiguracionPage() {
  const [tab, setTab] = useState("general");

  return (
    <div className="relative isolate flex h-full flex-col overflow-y-auto">
      {/* Decoración de sección (§10): página densa → SOLO la capa de lavado, sin botánica. Da
          profundidad a la esquina sin añadir un solo trazo que compita con los formularios. */}
      <ManchaOrganica
        className="pointer-events-none absolute right-0 top-24 -z-10 hidden select-none lg:block"
        variante={3}
        width={430}
        opacity={0.4}
      />
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
