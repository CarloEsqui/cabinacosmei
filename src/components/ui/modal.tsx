import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const contenidoRef = useRef<HTMLDivElement>(null);

  // Separado del listener de Escape a propósito: si dependiera de `onClose` (que se recrea en
  // cada render del padre, p. ej. por cada tecla escrita en el form) volvería a robar el foco al
  // primer campo en cada tecleo. Este efecto solo debe correr cuando el modal realmente se abre.
  useEffect(() => {
    if (!open) return;
    const primerCampo = contenidoRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
    );
    primerCampo?.focus();
  }, [open]);

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-beige-300 bg-beige-50 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-beige-300 px-5 py-4">
              <h2 className="font-semibold text-jacaranda-700">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-ink-500 hover:bg-beige-200 hover:text-ink-900"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5" ref={contenidoRef}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
