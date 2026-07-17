import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Users,
  Boxes,
  Lock,
  FileBarChart,
  Settings,
  Sparkles,
  Pin,
  PinOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActualizacionBanner } from "@/components/ActualizacionBanner";
import { LicenciaBanner } from "@/components/LicenciaBanner";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/citas", label: "Citas", icon: ClipboardList },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/inventario", label: "Inventario", icon: Boxes },
  { to: "/corte", label: "Corte / Caja", icon: Lock },
  { to: "/reportes", label: "Reportes", icon: FileBarChart },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

const CLAVE_FIJADO = "bellora-sidebar-fijado";

export function AppShell() {
  const [fijado, setFijado] = useState(() => localStorage.getItem(CLAVE_FIJADO) === "1");
  const [conHover, setConHover] = useState(false);
  const salidaPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem(CLAVE_FIJADO, fijado ? "1" : "0");
  }, [fijado]);

  // Limpia el timeout de salida si el componente se desmonta con el mouse todavía encima.
  useEffect(() => () => {
    if (salidaPendiente.current) clearTimeout(salidaPendiente.current);
  }, []);

  const expandido = fijado || conHover;

  function alEntrar() {
    if (salidaPendiente.current) clearTimeout(salidaPendiente.current);
    setConHover(true);
  }

  function alSalir() {
    // Pequeña gracia: si el mouse solo pasó de refilón por el borde, no colapsa de inmediato.
    salidaPendiente.current = setTimeout(() => setConHover(false), 150);
  }

  return (
    <div className={cn("app-shell h-full bg-beige-100", fijado && "pinned")}>
      <aside
        className={cn(
          "sidebar flex flex-col border-r border-beige-300 bg-beige-50/90 px-3 py-4 backdrop-blur-sm",
          expandido ? "expanded" : "rail",
          fijado && "pinned",
        )}
        onMouseEnter={alEntrar}
        onMouseLeave={alSalir}
      >
        <div className="sidebar-brand mb-8">
          <div className="sidebar-icon-slot">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-jacaranda-500 to-jacaranda-700 text-beige-50 shadow-sm shadow-jacaranda-700/30">
              <Sparkles size={18} />
            </div>
          </div>
          <div className="sidebar-text">
            <p className="font-display truncate text-base font-semibold text-jacaranda-700 leading-tight">
              Bellora
            </p>
            <p className="truncate text-xs text-ink-500 leading-tight">Operación diaria</p>
          </div>
          <button
            type="button"
            onClick={() => setFijado((v) => !v)}
            className="pin-btn flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg text-ink-500 hover:bg-beige-200 hover:text-jacaranda-700"
            title={fijado ? "Dejar de fijar el sidebar" : "Fijar sidebar abierto"}
          >
            {fijado ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={!expandido ? label : undefined}
              className={({ isActive }) =>
                cn(
                  "nav-item rounded-xl py-2 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-jacaranda-600 text-beige-50 shadow-sm shadow-jacaranda-700/20"
                    : "text-ink-700 hover:bg-beige-200",
                )
              }
            >
              <span className="sidebar-icon-slot">
                <Icon size={18} />
              </span>
              <span className="sidebar-text truncate pr-3">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-beige-300 pt-3">
          <p className="sidebar-text truncate px-1 text-xs text-ink-300">Bellora Dashboard</p>
        </div>
      </aside>

      <main className="shell-main flex flex-col overflow-hidden">
        <ActualizacionBanner />
        <LicenciaBanner />
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
