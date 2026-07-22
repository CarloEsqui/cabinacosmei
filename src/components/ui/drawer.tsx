import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * Panel deslizante desde la derecha para el detalle de una métrica o un centro de contenido más
 * largo (Centro de atención, drill-down de una cifra) — sin sacar al usuario de Reportes, tal como
 * pide INSTRUCCIONES §15: "no sacar al usuario de Reportes salvo que elija 'Abrir expediente'".
 */
export function Drawer({ open, onClose, title, subtitle, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-ink-900/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col border-l border-beige-300 bg-beige-50 shadow-lg"
          >
            <div className="flex items-start justify-between border-b border-beige-300 px-5 py-4">
              <div>
                <h2 className="font-semibold text-jacaranda-700">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-ink-500 hover:bg-beige-200 hover:text-ink-900"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
