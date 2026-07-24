import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LockScreen } from "@/pages/Lock";
import { ActivacionScreen } from "@/pages/Activacion";
import { AppShell } from "@/components/AppShell";
import type { EstadoLicencia } from "@shared/types";
import { DashboardPage } from "@/pages/Dashboard";
import { ConfiguracionPage } from "@/pages/Configuracion";
import { InventarioPage } from "@/pages/Inventario";
import { ClientesPage } from "@/pages/Clientes";
import { AgendaPage } from "@/pages/Agenda";
import { CitasPage } from "@/pages/Citas";
import { CortePage } from "@/pages/Corte";
import { ReportesPage } from "@/pages/Reportes";
import { MensajeSorpresa } from "@/components/MensajeSorpresa"; // TEMPORAL: quitar en la próxima actualización

const queryClient = new QueryClient();

const ESTADOS_QUE_DEJAN_ENTRAR = new Set<EstadoLicencia["estado"]>(["activa", "por_vencer"]);

export default function App() {
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [estadoLicencia, setEstadoLicencia] = useState<EstadoLicencia | null>(null);

  useEffect(() => {
    window.api.licencia.estado().then(setEstadoLicencia);
  }, []);

  if (!estadoLicencia) {
    return <div className="h-full bg-beige-100" />;
  }

  if (!ESTADOS_QUE_DEJAN_ENTRAR.has(estadoLicencia.estado)) {
    return <ActivacionScreen estado={estadoLicencia} onActivada={setEstadoLicencia} />;
  }

  if (!desbloqueado) {
    return <LockScreen onUnlock={() => setDesbloqueado(true)} />;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <MensajeSorpresa /> {/* TEMPORAL: quitar en la próxima actualización */}
            <HashRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="agenda" element={<AgendaPage />} />
                  <Route path="citas" element={<CitasPage />} />
                  <Route path="clientes" element={<ClientesPage />} />
                  <Route path="inventario" element={<InventarioPage />} />
                  <Route path="corte" element={<CortePage />} />
                  <Route path="reportes" element={<ReportesPage />} />
                  <Route path="configuracion" element={<ConfiguracionPage />} />
                </Route>
              </Routes>
            </HashRouter>
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
