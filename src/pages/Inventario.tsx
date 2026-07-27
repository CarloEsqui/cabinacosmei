import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/ui/tabs";
import { ResumenTab } from "@/pages/inventario/Resumen";
import { MovimientosTab } from "@/pages/inventario/Movimientos";
import { CaducidadTab } from "@/pages/inventario/Caducidad";
import { HojasSueltas } from "@/components/ui/decoracion";

// Entradas y salidas ya no son pestañas: se registran desde pop-ups en el Resumen.
const TABS = [
  { value: "resumen", label: "Resumen" },
  { value: "movimientos", label: "Movimientos" },
  { value: "caducidad", label: "Caducidad" },
];

const TABS_VALIDOS = new Set(TABS.map((t) => t.value));

export function InventarioPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const inicial = searchParams.get("tab");
    return inicial && TABS_VALIDOS.has(inicial) ? inicial : "resumen";
  });

  // Si se llega desde un enlace (ej. las tarjetas del Dashboard) mientras esta página ya estaba
  // montada, la pestaña debe reaccionar al cambio de la URL.
  useEffect(() => {
    const solicitado = searchParams.get("tab");
    if (solicitado && TABS_VALIDOS.has(solicitado)) setTab(solicitado);
  }, [searchParams]);

  return (
    <div className="relative isolate flex h-full flex-col overflow-y-auto">
      {/* Decoración de sección (§10): sprig de hojas sin flor — la pieza más neutra del sistema,
          apropiada para una sección de trabajo. En la página, no en cada pestaña. */}
      <HojasSueltas
        className="pointer-events-none absolute bottom-3 right-7 -z-10 hidden select-none lg:block"
        width={185}
        opacity={0.42}
      />
      <PageHeader title="Inventario" subtitle="Existencias, lotes, caducidad y movimientos" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "resumen" && <ResumenTab />}
      {tab === "movimientos" && <MovimientosTab />}
      {tab === "caducidad" && <CaducidadTab />}
    </div>
  );
}
