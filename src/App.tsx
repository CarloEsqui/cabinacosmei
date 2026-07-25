import { useCallback, useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
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

// Si la app se queda abierta varios días, la licencia puede vencer dentro de la misma sesión: no
// basta con revisarla solo al montar. Se revalida cada hora y, sobre todo, al recuperar el foco
// de la ventana (el caso típico: se dejó minimizada u ocupando otro escritorio varios días).
const INTERVALO_REVALIDACION_LICENCIA_MS = 60 * 60 * 1000;

export default function App() {
  // Envuelve TODAS las ramas (activación, PIN y app autenticada), no solo la autenticada: un
  // error de render en cualquiera de ellas debe mostrar la pantalla de error, no una pantalla en
  // blanco. ErrorBoundary no depende de ningún provider, así que es seguro aquí arriba.
  return (
    <ErrorBoundary>
      <AppContenido />
    </ErrorBoundary>
  );
}

function AppContenido() {
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [estadoLicencia, setEstadoLicencia] = useState<EstadoLicencia | null>(null);
  const [errorLicencia, setErrorLicencia] = useState(false);

  const consultarLicencia = useCallback(() => {
    setErrorLicencia(false);
    window.api.licencia
      .estado()
      .then(setEstadoLicencia)
      .catch(() => setErrorLicencia(true));
  }, []);

  useEffect(() => {
    consultarLicencia();
  }, [consultarLicencia]);

  useEffect(() => {
    const intervalId = setInterval(consultarLicencia, INTERVALO_REVALIDACION_LICENCIA_MS);
    window.addEventListener("focus", consultarLicencia);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", consultarLicencia);
    };
  }, [consultarLicencia]);

  if (errorLicencia) {
    return <ErrorLicenciaScreen onReintentar={consultarLicencia} />;
  }

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
  );
}

function ErrorLicenciaScreen({ onReintentar }: { onReintentar: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-beige-100 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-500/10 text-danger-500">
        <AlertTriangle size={28} />
      </div>
      <div>
        <h1 className="font-display text-xl font-semibold text-ink-900">No se pudo verificar la licencia</h1>
        <p className="mt-1 max-w-sm text-sm text-ink-500">
          Cierra y vuelve a abrir la app. Si el problema sigue, contacta a soporte.
        </p>
      </div>
      <Button onClick={onReintentar}>Reintentar</Button>
    </div>
  );
}
