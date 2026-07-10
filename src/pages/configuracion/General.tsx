import { useEffect, useState } from "react";
import { FolderOpen, FolderCog, Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import type { ConfigValues } from "@shared/config";

export function GeneralTab() {
  const [config, setConfig] = useState<ConfigValues | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    window.api.config.obtener().then(setConfig);
  }, []);

  async function guardar(cambios: Partial<ConfigValues>) {
    setGuardando(true);
    setGuardado(false);
    try {
      const siguiente = await window.api.config.actualizar(cambios);
      setConfig(siguiente);
      setGuardado(true);
    } finally {
      setGuardando(false);
    }
  }

  async function elegirCarpeta() {
    const ruta = await window.api.carpetas.elegirCarpetaRaiz();
    if (ruta) await guardar({ carpetaRaiz: ruta });
  }

  if (!config) return null;

  return (
    <div className="p-8">
      {guardado && <p className="mb-3 text-sm text-success-500">Guardado</p>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Carpeta local</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="break-all text-sm text-ink-700">{config.carpetaRaiz}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={elegirCarpeta}>
                <FolderCog size={16} /> Cambiar carpeta
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.api.carpetas.abrirCarpeta(config.carpetaRaiz)}
              >
                <FolderOpen size={16} /> Abrir carpeta
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventario</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-ink-500">Umbral crítico de stock</label>
              <NumberInput
                value={config.umbralStockCritico}
                onValueChange={(v) => setConfig({ ...config, umbralStockCritico: v ?? 0 })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Umbral bajo de stock</label>
              <NumberInput
                value={config.umbralStockBajo}
                onValueChange={(v) => setConfig({ ...config, umbralStockBajo: v ?? 0 })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Días previos para alerta de caducidad</label>
              <NumberInput
                value={config.diasAlertaCaducidad}
                onValueChange={(v) => setConfig({ ...config, diasAlertaCaducidad: v ?? 0 })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Criterio de salida de lotes</label>
              <div className="mt-1 flex gap-2">
                {(["FEFO", "FIFO"] as const).map((opcion) => (
                  <Button
                    key={opcion}
                    type="button"
                    size="sm"
                    variant={config.criterioSalidaLotes === opcion ? "primary" : "secondary"}
                    onClick={() => setConfig({ ...config, criterioSalidaLotes: opcion })}
                  >
                    {opcion}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              disabled={guardando}
              onClick={() =>
                guardar({
                  umbralStockCritico: config.umbralStockCritico,
                  umbralStockBajo: config.umbralStockBajo,
                  diasAlertaCaducidad: config.diasAlertaCaducidad,
                  criterioSalidaLotes: config.criterioSalidaLotes,
                })
              }
            >
              <Save size={16} /> Guardar cambios
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Moneda y métodos de pago</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-ink-500">Moneda</label>
              <Input value={config.moneda} onChange={(e) => setConfig({ ...config, moneda: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-500">Métodos de pago (separados por coma)</label>
              <Input
                value={config.metodosPago.join(", ")}
                onChange={(e) =>
                  setConfig({ ...config, metodosPago: e.target.value.split(",").map((s) => s.trim()) })
                }
              />
            </div>
            <Button
              size="sm"
              disabled={guardando}
              onClick={() => guardar({ moneda: config.moneda, metodosPago: config.metodosPago })}
            >
              <Save size={16} /> Guardar cambios
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Corte de caja</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-ink-500">Hora del recordatorio de corte</label>
              <Input
                type="time"
                value={config.horaCorte}
                onChange={(e) => setConfig({ ...config, horaCorte: e.target.value })}
              />
              <p className="mt-1 text-xs text-ink-500">
                A partir de esta hora, el Dashboard mostrará un recordatorio para hacer el corte del día.
                El corte solo se ejecuta cuando tú lo confirmas manualmente.
              </p>
            </div>
            <Button size="sm" disabled={guardando} onClick={() => guardar({ horaCorte: config.horaCorte })}>
              <Save size={16} /> Guardar cambios
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
