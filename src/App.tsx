import { useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LockScreen } from "@/pages/Lock";
import { AppShell } from "@/components/AppShell";
import { DashboardPage } from "@/pages/Dashboard";
import { ConfiguracionPage } from "@/pages/Configuracion";
import { InventarioPage } from "@/pages/Inventario";
import { ClientesPage } from "@/pages/Clientes";
import { AgendaPage } from "@/pages/Agenda";
import { CitasPage } from "@/pages/Citas";
import { CortePage } from "@/pages/Corte";
import { ReportesPage } from "@/pages/Reportes";

const queryClient = new QueryClient();

export default function App() {
  const [desbloqueado, setDesbloqueado] = useState(false);

  if (!desbloqueado) {
    return <LockScreen onUnlock={() => setDesbloqueado(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
