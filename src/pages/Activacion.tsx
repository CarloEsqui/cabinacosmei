import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Copy, KeyRound, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { EstadoLicencia } from "@shared/types";

interface ActivacionScreenProps {
  estado: EstadoLicencia;
  onActivada: (nuevo: EstadoLicencia) => void;
}

const MENSAJE_POR_ESTADO: Record<string, string> = {
  no_activada: "Es la primera vez que abres el sistema. Activa tu licencia para empezar a usarlo.",
  vencida: "Tu licencia venció. Renueva para seguir usando la aplicación.",
  invalida: "El código de esta licencia no corresponde a este equipo. Solicita uno nuevo.",
};

export function ActivacionScreen({ estado, onActivada }: ActivacionScreenProps) {
  const [matricula, setMatricula] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [copiada, setCopiada] = useState(false);

  useEffect(() => {
    setMatricula(estado.matricula);
  }, [estado.matricula]);

  async function copiarMatricula() {
    await navigator.clipboard.writeText(matricula);
    setCopiada(true);
    setTimeout(() => setCopiada(false), 2000);
  }

  async function handleActivar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token.trim()) {
      setError("Pega el código que te enviaron.");
      return;
    }
    setProcesando(true);
    try {
      const nuevo = await window.api.licencia.instalarToken(token.trim());
      onActivada(nuevo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo activar la licencia.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-beige-100">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jacaranda-600 text-beige-50">
            <Sparkles size={22} />
          </div>
          <h1 className="text-jacaranda-700">Bellora</h1>
          <p className="text-sm text-ink-500">
            {MENSAJE_POR_ESTADO[estado.estado] ?? "Activa tu licencia para continuar."}
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-5">
            <div>
              <label className="text-xs font-medium text-ink-500">Matrícula de este equipo</label>
              <div className="mt-1 flex gap-2">
                <p className="flex-1 rounded-lg bg-beige-200 px-3 py-2 font-mono text-sm tracking-wide text-ink-900">
                  {matricula || "Calculando..."}
                </p>
                <Button type="button" variant="secondary" size="sm" disabled={!matricula} onClick={copiarMatricula}>
                  <Copy size={16} /> {copiada ? "Copiada" : "Copiar"}
                </Button>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                Envía esta matrícula a quien te dio la aplicación junto con tu comprobante de pago; te
                mandará de vuelta un código de activación.
              </p>
            </div>

            <form onSubmit={handleActivar} className="flex flex-col gap-3 border-t border-beige-300 pt-4">
              <label className="text-sm font-medium text-ink-700">Código de activación</label>
              <Input
                autoFocus
                placeholder="Pega aquí el código que te enviaron"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              {error && <p className="text-sm text-danger-500">{error}</p>}
              <Button type="submit" disabled={procesando || !token.trim()} className="mt-1">
                <KeyRound size={16} /> Activar
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
