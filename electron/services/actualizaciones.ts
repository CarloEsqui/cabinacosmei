import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";
import type { EstadoActualizacion } from "../../shared/types";

let ventanaPrincipal: BrowserWindow | null = null;
let listenersRegistrados = false;

/**
 * Último estado conocido de la actualización. Vive aquí y no en el renderer porque la búsqueda
 * arranca antes de que se cargue la ventana, y el aviso solo se monta después de la licencia y el
 * PIN: los eventos que salen mientras tanto se perderían (ACT-M1). El aviso lo consulta al montarse
 * con `actualizaciones:estado` y después escucha los cambios.
 */
let estado: EstadoActualizacion | null = null;

function cambiar(nuevo: EstadoActualizacion): void {
  estado = nuevo;
  // Con la ventana destruida (Windows: cerrar = salir) `webContents` lanza, y el listener de
  // progreso corre dentro del stream de descarga (ACT-B1).
  if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) return;
  ventanaPrincipal.webContents.send("actualizaciones:cambio", nuevo);
}

export function obtenerEstadoActualizacion(): EstadoActualizacion | null {
  return estado;
}

/**
 * Registra los listeners que avisan al renderer cuando hay una actualización. Se llama cada vez
 * que se (re)crea la ventana principal (ej. al reabrir la app en macOS tras cerrar todas las
 * ventanas), así que los listeners de `autoUpdater` solo se agregan la primera vez — si no, cada
 * reapertura sumaría un listener más y los eventos llegarían duplicados al renderer.
 */
export function inicializarActualizaciones(mainWindow: BrowserWindow): void {
  ventanaPrincipal = mainWindow;
  mainWindow.on("closed", () => {
    if (ventanaPrincipal === mainWindow) ventanaPrincipal = null;
  });
  if (listenersRegistrados) return;
  listenersRegistrados = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    // Una búsqueda manual con la misma descarga en curso no debe reiniciar la barra (ACT-B3).
    if (estado?.tipo === "descargando" && estado.version === info.version) return;
    cambiar({ tipo: "descargando", version: info.version, progreso: null });
  });
  // electron-updater solo calcula el progreso si ya hay un listener cuando arranca la descarga, y lo
  // emite a lo más una vez por segundo.
  autoUpdater.on("download-progress", (p) => {
    if (estado?.tipo !== "descargando") return;
    cambiar({
      ...estado,
      progreso: { porcentaje: p.percent, transferido: p.transferred, total: p.total, bytesPorSegundo: p.bytesPerSecond },
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    cambiar({ tipo: "descargada", version: info.version });
  });
  autoUpdater.on("error", (error, mensaje) => {
    // Un fallo al *buscar* (sin internet al abrir, o una búsqueda manual) no cambia nada: si había
    // una descarga en curso, sigue (ACT-B3). electron-updater marca así esos errores.
    if (mensaje?.startsWith("Cannot check for updates")) return;
    // Solo el código, nunca `error.message`: puede traer rutas locales (ACT-B4).
    const codigo = (error as Error & { code?: string }).code ?? null;
    if (estado?.tipo === "descargando") {
      cambiar({ tipo: "error", fase: "descarga", version: estado.version, codigo });
    } else if (estado?.tipo === "descargada") {
      cambiar({ tipo: "error", fase: "instalacion", version: estado.version, codigo });
    }
  });
}

export async function buscarActualizaciones(): Promise<void> {
  await autoUpdater.checkForUpdates();
}

export function instalarYReiniciar(): void {
  autoUpdater.quitAndInstall();
}
