import { app, BrowserWindow } from "electron";
import path from "node:path";
import { initDb } from "./db";
import { asegurarConfigInicial, obtenerConfig, actualizarConfig } from "./services/config";
import { asegurarEstructuraRaiz } from "./services/folders";
import { asegurarUsuarioPorDefecto } from "./services/usuarios";
import { registrarIpc } from "./ipc";

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

async function crearVentanaPrincipal() {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#F3ECE1", // beige de marca, evita flash blanco al cargar
    title: "Cabina — Dashboard de Operación",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  registrarIpc(mainWindow);

  if (VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(async () => {
  initDb(app.getPath("userData"));
  await asegurarConfigInicial();
  await asegurarUsuarioPorDefecto();

  const config = await obtenerConfig();
  const carpetaRaizPorDefecto = config.carpetaRaiz || path.join(app.getPath("documents"), "Cabina");
  asegurarEstructuraRaiz(carpetaRaizPorDefecto);
  if (!config.carpetaRaiz) {
    await actualizarConfig({ carpetaRaiz: carpetaRaizPorDefecto });
  }

  await crearVentanaPrincipal();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      crearVentanaPrincipal();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
