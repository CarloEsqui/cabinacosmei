import { useEffect, useState } from "react";
import { FolderOpen, FolderCog, Save, Sparkles, RefreshCw, User, ALargeSmall, KeyRound, Copy, CalendarClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { useToast } from "@/components/ui/toast";
import { mensajeDeError } from "@/lib/errores";
import type { ConfigValues } from "@shared/config";
import type { EstadoLicencia } from "@shared/types";

const ETIQUETA_ESTADO_LICENCIA: Record<EstadoLicencia["estado"], string> = {
  activa: "Activa",
  por_vencer: "Por vencer",
  vencida: "Vencida",
  no_activada: "No activada",
  invalida: "Inválida",
};

// Índice = número de día de la semana (0 = domingo … 6 = sábado), como usa Date.getDay().
const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const ESCALAS_TEXTO = [
  { valor: 0.9, etiqueta: "Pequeño" },
  { valor: 1, etiqueta: "Normal" },
  { valor: 1.1, etiqueta: "Grande" },
  { valor: 1.25, etiqueta: "Muy grande" },
] as const;

export function GeneralTab() {
  const toast = useToast();
  const [config, setConfig] = useState<ConfigValues | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [version, setVersion] = useState("");
  const [buscandoUpdate, setBuscandoUpdate] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [matricula, setMatricula] = useState("");
  const [estadoLicencia, setEstadoLicencia] = useState<EstadoLicencia | null>(null);
  const [tokenLicencia, setTokenLicencia] = useState("");
  const [activandoLicencia, setActivandoLicencia] = useState(false);

  useEffect(() => {
    window.api.config.obtener().then(setConfig);
    window.api.app.version().then(setVersion);
    window.api.app.matricula().then(setMatricula);
    window.api.usuarios.obtenerActual().then((perfil) => setNombre(perfil.nombre));
    window.api.licencia.estado().then(setEstadoLicencia);
  }, []);

  async function copiarMatricula() {
    await navigator.clipboard.writeText(matricula);
    toast.success("Matrícula copiada.");
  }

  async function activarLicencia() {
    setActivandoLicencia(true);
    try {
      const nuevo = await window.api.licencia.instalarToken(tokenLicencia.trim());
      setEstadoLicencia(nuevo);
      setTokenLicencia("");
      toast.success("Licencia actualizada.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setActivandoLicencia(false);
    }
  }

  async function guardarNombre() {
    setGuardandoNombre(true);
    try {
      const perfil = await window.api.usuarios.actualizarNombre(nombre);
      setNombre(perfil.nombre);
      toast.success("Nombre actualizado.");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setGuardandoNombre(false);
    }
  }

  async function guardar(cambios: Partial<ConfigValues>) {
    setGuardando(true);
    try {
      const siguiente = await window.api.config.actualizar(cambios);
      setConfig(siguiente);
      toast.success("Configuración guardada.");
    } catch (e) {
      toast.error(mensajeDeError(e));
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User size={16} className="text-jacaranda-500" /> Tu perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-ink-500">¿Cómo te gustaría que te llamemos?</label>
              <Input maxLength={40} placeholder="Ej. Daniela" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <p className="mt-1 text-xs text-ink-500">
                Usaremos este nombre para personalizar tu experiencia dentro de la aplicación.
              </p>
            </div>
            <Button
              size="sm"
              disabled={guardandoNombre || nombre.trim().length < 2}
              onClick={guardarNombre}
            >
              <Save size={16} /> Guardar cambios
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ALargeSmall size={16} className="text-jacaranda-500" /> Tamaño de letra
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-ink-500">
              Ajusta el tamaño del texto, los íconos y los espacios de toda la aplicación. El cambio se
              aplica de inmediato.
            </p>
            <div className="flex flex-wrap gap-2">
              {ESCALAS_TEXTO.map((opcion) => (
                <Button
                  key={opcion.valor}
                  type="button"
                  size="sm"
                  variant={config.escalaTexto === opcion.valor ? "primary" : "secondary"}
                  disabled={guardando}
                  onClick={() => guardar({ escalaTexto: opcion.valor })}
                >
                  {opcion.etiqueta}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock size={16} className="text-jacaranda-500" /> Horario de atención
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-ink-500">
              Se usa para calcular la <b>ocupación</b> de tu agenda en Reportes (qué tan llena está tu
              capacidad).
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Días laborales</label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA.map((d, i) => (
                  <Button
                    key={i}
                    type="button"
                    size="sm"
                    variant={config.diasLaborales.includes(i) ? "primary" : "secondary"}
                    onClick={() =>
                      setConfig({
                        ...config,
                        diasLaborales: config.diasLaborales.includes(i)
                          ? config.diasLaborales.filter((x) => x !== i)
                          : [...config.diasLaborales, i].sort((a, b) => a - b),
                      })
                    }
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Apertura</label>
                <Input
                  type="time"
                  value={config.horarioApertura}
                  onChange={(e) => setConfig({ ...config, horarioApertura: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Cierre</label>
                <Input
                  type="time"
                  value={config.horarioCierre}
                  onChange={(e) => setConfig({ ...config, horarioCierre: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Descanso — inicio</label>
                <Input
                  type="time"
                  value={config.descansoInicio}
                  onChange={(e) => setConfig({ ...config, descansoInicio: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Descanso — fin</label>
                <Input
                  type="time"
                  value={config.descansoFin}
                  onChange={(e) => setConfig({ ...config, descansoFin: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">
                Capacidad simultánea (clientas a la vez)
              </label>
              <NumberInput
                min={1}
                value={config.capacidadSimultanea}
                onValueChange={(v) => setConfig({ ...config, capacidadSimultanea: v && v >= 1 ? Math.round(v) : 1 })}
              />
              <p className="mt-1 text-xs text-ink-500">
                1 si atiendes de una en una; súbelo si tienes varias estaciones o profesionales al mismo tiempo.
              </p>
            </div>
            <Button
              size="sm"
              disabled={guardando}
              onClick={() =>
                guardar({
                  diasLaborales: config.diasLaborales,
                  horarioApertura: config.horarioApertura,
                  horarioCierre: config.horarioCierre,
                  descansoInicio: config.descansoInicio,
                  descansoFin: config.descansoFin,
                  capacidadSimultanea: config.capacidadSimultanea,
                })
              }
            >
              <Save size={16} /> Guardar cambios
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mantenimientos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-ink-500">
                Días de anticipación del aviso de mantenimiento
              </label>
              <NumberInput
                min={0}
                value={config.diasAvisoMantenimiento}
                onValueChange={(v) => setConfig({ ...config, diasAvisoMantenimiento: v && v >= 0 ? Math.round(v) : 0 })}
              />
              <p className="mt-1 text-xs text-ink-500">
                Las clientas aparecen en "Mantenimientos pendientes" estos días ANTES de su fecha
                sugerida, para dar tiempo de contactarlas y agendar. Con 0, solo aparecen cuando la
                fecha ya llegó.
              </p>
            </div>
            <Button
              size="sm"
              disabled={guardando}
              onClick={() => guardar({ diasAvisoMantenimiento: config.diasAvisoMantenimiento })}
            >
              <Save size={16} /> Guardar cambios
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acerca de</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-jacaranda-500 to-jacaranda-700 text-beige-50">
                <Sparkles size={20} />
              </div>
              <div>
                <p className="font-medium text-ink-900">Bellora Dashboard</p>
                <p className="text-xs text-ink-500">
                  {version ? `Versión ${version}` : "Cargando versión..."} · Copyright © 2026 Bellora
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={buscandoUpdate}
              onClick={async () => {
                setBuscandoUpdate(true);
                try {
                  await window.api.actualizaciones.buscar();
                  toast.info("Buscando actualizaciones. Si hay una nueva, se descargará sola.");
                } catch (e) {
                  toast.error(mensajeDeError(e));
                } finally {
                  setBuscandoUpdate(false);
                }
              }}
            >
              <RefreshCw size={16} /> Buscar actualizaciones
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound size={16} className="text-jacaranda-500" /> Licencia
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {estadoLicencia && (
              <p className="text-sm text-ink-700">
                Estado: <span className="font-semibold text-ink-900">{ETIQUETA_ESTADO_LICENCIA[estadoLicencia.estado]}</span>
                {estadoLicencia.expira && <> · vence el {estadoLicencia.expira}</>}
              </p>
            )}

            <div>
              <label className="text-xs font-medium text-ink-500">Matrícula de este equipo</label>
              <p className="mt-1 rounded-lg bg-beige-200 px-3 py-2 font-mono text-sm tracking-wide text-ink-900">
                {matricula || "Calculando..."}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Envíasela a quien te dio la aplicación cuando actives o renueves tu acceso.
              </p>
              <Button size="sm" variant="secondary" disabled={!matricula} onClick={copiarMatricula} className="mt-2">
                <Copy size={16} /> Copiar matrícula
              </Button>
            </div>

            <div className="border-t border-beige-300 pt-3">
              <label className="text-xs font-medium text-ink-500">Código de activación / renovación</label>
              <Input
                placeholder="Pega aquí el código que te enviaron"
                value={tokenLicencia}
                onChange={(e) => setTokenLicencia(e.target.value)}
              />
              <Button
                size="sm"
                disabled={activandoLicencia || !tokenLicencia.trim()}
                onClick={activarLicencia}
                className="mt-2"
              >
                <KeyRound size={16} /> Activar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
