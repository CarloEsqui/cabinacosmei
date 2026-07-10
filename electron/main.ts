import { app, BrowserWindow, shell, dialog } from "electron";
import path from "node:path";
import { initDb } from "./db";
import { asegurarConfigInicial, obtenerConfig, actualizarConfig } from "./services/config";
import { asegurarEstructuraRaiz } from "./services/folders";
import { migrarRutasCarpetas } from "./services/migracionCarpetas";
import { asegurarRespaldoAutomaticoDiario } from "./services/respaldos";
import { asegurarUsuarioPorDefecto } from "./services/usuarios";
import { inicializarVentanaStore, leerEstadoVentana, guardarEstadoVentana } from "./services/ventana";
import { inicializarActualizaciones, buscarActualizaciones } from "./services/actualizaciones";
import { registrarIpc } from "./ipc";

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

process.on("uncaughtException", (error) => {
  console.error("Excepción no capturada en el proceso principal:", error);
  dialog.showErrorBox("Ocurrió un error inesperado", error.message);
});

// Evita que la misma base de datos SQLite se abra desde dos ventanas/procesos a la vez.
const obtuvoLock = app.requestSingleInstanceLock();
if (!obtuvoLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const ventana = BrowserWindow.getAllWindows()[0];
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore();
      ventana.focus();
    }
  });

  iniciarApp();
}

function iniciarApp() {
  async function crearVentanaPrincipal() {
    const estadoGuardado = leerEstadoVentana();

    const mainWindow = new BrowserWindow({
      width: estadoGuardado.width,
      height: estadoGuardado.height,
      x: estadoGuardado.x,
      y: estadoGuardado.y,
      minWidth: 1024,
      minHeight: 680,
      backgroundColor: "#F3ECE1", // beige de marca, evita flash blanco al cargar
      title: "Cabina — Dashboard de Operación",
      icon: path.join(__dirname, "..", "build", "icon.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    if (estadoGuardado.maximizada) mainWindow.maximize();

    let guardadoPendiente: NodeJS.Timeout | null = null;
    function programarGuardadoEstado() {
      if (guardadoPendiente) clearTimeout(guardadoPendiente);
      guardadoPendiente = setTimeout(persistirEstadoVentana, 400);
    }
    function persistirEstadoVentana() {
      if (mainWindow.isDestroyed()) return;
      const maximizada = mainWindow.isMaximized();
      const bounds = mainWindow.getBounds();
      guardarEstadoVentana({ width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, maximizada });
    }
    mainWindow.on("resize", programarGuardadoEstado);
    mainWindow.on("move", programarGuardadoEstado);
    mainWindow.on("close", persistirEstadoVentana);

    // Enlaces externos (p. ej. desde notas o futuras vistas con links) abren en el navegador
    // del sistema, nunca dentro de la propia app.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, url) => {
      const esOrigenPermitido =
        (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) || url.startsWith("file://");
      if (!esOrigenPermitido) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    registrarIpc(mainWindow);
    inicializarActualizaciones(mainWindow);
    if (app.isPackaged) {
      buscarActualizaciones().catch((error) => console.error("Error al buscar actualizaciones:", error));
    }

    if (VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(VITE_DEV_SERVER_URL);
      mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
      await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
    }
  }

  app.whenReady().then(async () => {
    initDb(app.getPath("userData"));
    inicializarVentanaStore(app.getPath("userData"));
    await asegurarConfigInicial();
    await asegurarUsuarioPorDefecto();

    const config = await obtenerConfig();
    const carpetaRaizPorDefecto = config.carpetaRaiz || path.join(app.getPath("documents"), "Cabina");
    asegurarEstructuraRaiz(carpetaRaizPorDefecto);
    // Corrige las rutas ya guardadas (carpetaPath, rutaFisica) si asegurarEstructuraRaiz acaba de
    // mover Clientes/Inventario/Comprobantes/Servicios a "Datos/". Es barato repetirlo siempre.
    migrarRutasCarpetas(carpetaRaizPorDefecto);
    if (!config.carpetaRaiz) {
      await actualizarConfig({ carpetaRaiz: carpetaRaizPorDefecto });
    }

    // Respaldo automático de verdad (no solo el de seguridad antes de un borrado): al arrancar y
    // luego cada pocas horas, por si la app se queda abierta varios días seguidos.
    function respaldarSiToca() {
      asegurarRespaldoAutomaticoDiario().catch((error: unknown) => console.error("Error en respaldo automático:", error));
    }
    respaldarSiToca();
    setInterval(respaldarSiToca, 6 * 60 * 60 * 1000);

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
}
