import { Inbox } from "lucide-react";

interface EmptyStateProps {
  /** Ícono de lucide-react (componente). Por defecto, una bandeja. */
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  mensaje: string;
  submensaje?: string;
}

/** Estado vacío con ícono suave y mensaje centrado, para tablas o listas sin datos. */
export function EmptyState({ icon: Icon = Inbox, mensaje, submensaje }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-beige-200 text-ink-300">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-ink-700">{mensaje}</p>
      {submensaje && <p className="max-w-xs text-xs text-ink-400">{submensaje}</p>}
    </div>
  );
}
