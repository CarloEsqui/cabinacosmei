import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";

let ventanaPrincipal: BrowserWindow | null = null;

/** Registra los listeners que avisan al renderer cuando hay una actualización. */
export function inicializarActualizaciones(mainWindow: BrowserWindow): void {
  ventanaPrincipal = mainWindow;
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
