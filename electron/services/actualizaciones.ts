import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";

let ventanaPrincipal: BrowserWindow | null = null;
let listenersRegistrados = false;

/**
 * Registra los listeners que avisan al renderer cuando hay una actualización. Se llama cada vez
 * que se (re)crea la ventana principal (ej. al reabrir la app en macOS tras cerrar todas las
 * ventanas), así que los listeners de `autoUpdater` solo se agregan la primera vez — si no, cada
 * reapertura sumaría un listener más y los eventos llegarían duplicados al renderer.
 */
export function inicializarActualizaciones(mainWindow: BrowserWindow): void {
  ventanaPrincipal = mainWindow;
  if (listenersRegistrados) return;
  listenersRegistrados = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    ventanaPrincipal?.webContents.send("actualizaciones:disponible", { version: info.version });
  });
  autoUpdater.on("update-downloaded", (info) => {
    ventanaPrincipal?.webContents.send("actualizaciones:descargada", { version: info.version });
  });
  autoUpdater.on("error", (error) => {
    ventanaPrincipal?.webContents.send("actualizaciones:error", error.message);
  });
}

export async function buscarActualizaciones(): Promise<void> {
  await autoUpdater.checkForUpdates();
}

export function instalarYReiniciar(): void {
  autoUpdater.quitAndInstall();
}
