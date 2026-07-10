import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface ConfirmOpciones {
  titulo: string;
  mensaje: string;
  confirmarLabel?: string;
  cancelarLabel?: string;
  /** Texto de un botón intermedio (ej. "Desactivar en su lugar") cuando la acción principal no es posible. */
  alternativaLabel?: string;
  destructivo?: boolean;
}

export type ConfirmResultado = "confirmado" | "alternativa" | "cancelado";

interface Pendiente {
  opciones: ConfirmOpciones;
  resolver: (resultado: ConfirmResultado) => void;
}

type ConfirmFn = (opciones: ConfirmOpciones) => Promise<ConfirmResultado>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

  const confirm = useCallback<ConfirmFn>((opciones) => {
    return new Promise((resolver) => setPendiente({ opciones, resolver }));
  }, []);

  function resolverCon(resultado: ConfirmResultado) {
    pendiente?.resolver(resultado);
    setPendiente(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pendiente && (
        <Modal open onClose={() => resolverCon("cancelado")} title={pendiente.opciones.titulo}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-700">{pendiente.opciones.mensaje}</p>
            <div className="flex flex-col gap-2">
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => resolverCon("cancelado")}>
                  {pendiente.opciones.cancelarLabel ?? "Cancelar"}
                </Button>
                <Button
                  variant={pendiente.opciones.destructivo ? "danger" : "primary"}
                  size="sm"
                  onClick={() => resolverCon("confirmado")}
                >
                  {pendiente.opciones.confirmarLabel ?? "Confirmar"}
                </Button>
              </div>
              {pendiente.opciones.alternativaLabel && (
                <Button variant="ghost" size="sm" className="self-end" onClick={() => resolverCon("alternativa")}>
                  {pendiente.opciones.alternativaLabel}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
}
