import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariante = "success" | "error" | "info";

interface ToastItem {
  id: string;
  mensaje: string;
  variante: ToastVariante;
}

interface ToastContextValue {
  success: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONOS: Record<ToastVariante, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const ESTILOS: Record<ToastVariante, string> = {
  success: "border-success-500/30 bg-success-500/10 text-success-500",
  error: "border-danger-500/30 bg-danger-500/10 text-danger-500",
  info: "border-jacaranda-300 bg-jacaranda-50 text-jacaranda-700",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const quitar = useCallback((id: string) => {
    setToasts((actuales) => actuales.filter((t) => t.id !== id));
  }, []);

  const mostrar = useCallback(
    (mensaje: string, variante: ToastVariante) => {
      const id = crypto.randomUUID();
      setToasts((actuales) => [...actuales, { id, mensaje, variante }]);
      setTimeout(() => quitar(id), 4500);
    },
    [quitar],
  );

  const value: ToastContextValue = {
    success: (mensaje) => mostrar(mensaje, "success"),
    error: (mensaje) => mostrar(mensaje, "error"),
    info: (mensaje) => mostrar(mensaje, "info"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icono = ICONOS[t.variante];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg",
                  ESTILOS[t.variante],
                )}
              >
                <Icono size={18} className="mt-0.5 shrink-0" />
                <p className="text-ink-900">{t.mensaje}</p>
                <button
                  onClick={() => quitar(t.id)}
                  className="ml-auto shrink-0 text-ink-500 hover:text-ink-900"
                  aria-label="Cerrar aviso"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
