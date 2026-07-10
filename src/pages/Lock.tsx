import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lock as LockIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [cargando, setCargando] = useState(true);
  const [tienePin, setTienePin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmarPin, setConfirmarPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    window.api.auth.tienePin().then((valor) => {
      setTienePin(valor);
      setCargando(false);
    });
  }, []);

  async function handleCrearPin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos.");
      return;
    }
    if (pin !== confirmarPin) {
      setError("Los PIN no coinciden.");
      return;
    }
    setProcesando(true);
    try {
      await window.api.auth.crearPin(pin);
      onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el PIN.");
    } finally {
      setProcesando(false);
    }
  }

  async function handleVerificarPin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setProcesando(true);
    try {
      const ok = await window.api.auth.verificarPin(pin);
      if (ok) {
        onUnlock();
      } else {
        setError("PIN incorrecto.");
        setPin("");
      }
    } finally {
      setProcesando(false);
    }
  }

  if (cargando) {
    return <div className="flex h-full items-center justify-center bg-beige-100" />;
  }

  return (
    <div className="flex h-full items-center justify-center bg-beige-100">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jacaranda-600 text-beige-50">
            <Sparkles size={22} />
          </div>
          <h1 className="text-xl font-semibold text-jacaranda-700">Cabina</h1>
          <p className="text-sm text-ink-500">Dashboard de operación diaria</p>
        </div>

        <Card>
          <CardContent className="pt-5">
            {tienePin ? (
              <form onSubmit={handleVerificarPin} className="flex flex-col gap-3">
                <label className="text-sm font-medium text-ink-700">Ingresa tu PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                />
                {error && <p className="text-sm text-danger-500">{error}</p>}
                <Button type="submit" disabled={procesando || pin.length < 4} className="mt-1">
                  <LockIcon size={16} /> Entrar
                </Button>
              </form>
            ) : (
              <form onSubmit={handleCrearPin} className="flex flex-col gap-3">
                <p className="text-sm text-ink-700">
                  Es la primera vez que abres el sistema. Crea un PIN para proteger el acceso.
                </p>
                <label className="text-sm font-medium text-ink-700">Nuevo PIN (4-8 dígitos)</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
                <label className="text-sm font-medium text-ink-700">Confirmar PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmarPin}
                  onChange={(e) => setConfirmarPin(e.target.value.replace(/\D/g, ""))}
                />
                {error && <p className="text-sm text-danger-500">{error}</p>}
                <Button type="submit" disabled={procesando} className="mt-1">
                  Crear PIN y continuar
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
