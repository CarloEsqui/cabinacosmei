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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActualizacionBanner } from "@/components/ActualizacionBanner";

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

export function AppShell() {
  return (
    <div className="flex h-full bg-beige-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-beige-300 bg-beige-50/60 px-3 py-4 backdrop-blur-sm">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-jacaranda-500 to-jacaranda-700 text-beige-50 shadow-sm shadow-jacaranda-700/30">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-jacaranda-700 leading-tight">Cabina</p>
            <p className="text-xs text-ink-500 leading-tight">Operación diaria</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-jacaranda-600 text-beige-50 shadow-sm shadow-jacaranda-700/20"
                    : "text-ink-700 hover:bg-beige-200",
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-beige-300 px-2 pt-3">
          <p className="text-xs text-ink-300">Cabina Dashboard</p>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <ActualizacionBanner />
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
