import type { ComponentType, ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  /** Ícono de lucide-react (componente). Por defecto, una bandeja. Se ignora si hay `ilustracion`. */
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  /**
   * Ilustración de marca (SVG inline de `ilustraciones.tsx`) para vacíos más cálidos §4. Tiene
   * prioridad sobre `icon`. Ej: `<EmptyState ilustracion={IlustracionPaquete} … />`.
   */
  ilustracion?: ComponentType<{ size?: number; className?: string }>;
  mensaje: string;
  submensaje?: string;
  /** Acción opcional (botón/enlace) bajo el mensaje. */
  accion?: ReactNode;
}

/** Estado vacío con ícono/ilustración suave y mensaje centrado, para tablas o listas sin datos. */
export function EmptyState({
  icon: Icon = Inbox,
  ilustracion: Ilustracion,
  mensaje,
  submensaje,
  accion,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {Ilustracion ? (
        <Ilustracion size={110} className="mb-1" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-beige-200 text-ink-300">
          <Icon size={24} strokeWidth={1.5} />
        </div>
      )}
      <p className="text-sm font-medium text-ink-700">{mensaje}</p>
      {submensaje && <p className="max-w-xs text-xs text-ink-400">{submensaje}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}
