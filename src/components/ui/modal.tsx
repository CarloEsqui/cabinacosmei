import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Pila global de modales abiertos. Permite que modales apilados (ej. Nueva entrada → Nuevo
// producto → Nueva categoría) coexistan sin que una sola tecla Escape los cierre todos: solo el
// de más arriba (el último en la pila) reacciona al Escape.
const pilaModales: symbol[] = [];

export function Modal({ open, onClose, title, children }: ModalProps) {
  const contenidoRef = useRef<HTMLDivElement>(null);
  // Guardamos el onClose más reciente en un ref para que el listener de Escape no dependa de él
  // (se recrea en cada tecleo del padre); así el efecto solo corre al abrir/cerrar y no re-suscribe
  // ni roba el foco en cada tecla.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
    // Este modal se registra en la cima de la pila mientras está abierto.
    const idModal = Symbol("modal");
    pilaModales.push(idModal);

    function alPresionarTecla(e: KeyboardEvent) {
      // Solo el modal de la cima responde al Escape, para no cerrar toda la cadena de una vez.
      if (e.key === "Escape" && pilaModales[pilaModales.length - 1] === idModal) {
        e.stopPropagation();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", alPresionarTecla);
    return () => {
      window.removeEventListener("keydown", alPresionarTecla);
      const i = pilaModales.indexOf(idModal);
      if (i >= 0) pilaModales.splice(i, 1);
    };
  }, [open]);

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
