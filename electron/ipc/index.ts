import fs from "node:fs";
import path from "node:path";
import { ipcMain, dialog, app, type BrowserWindow } from "electron";
import * as auth from "../services/auth";
import * as configService from "../services/config";
import * as folders from "../services/folders";
import * as proveedoresService from "../services/proveedores";
import * as tiposProductoService from "../services/tiposProducto";
import * as productosService from "../services/productos";
import * as inventarioService from "../services/inventario";
import * as clientesService from "../services/clientes";
import * as serviciosCatalogoService from "../services/serviciosCatalogo";
import * as citasService from "../services/citas";
import * as serviciosRealizadosService from "../services/serviciosRealizados";
import * as archivosService from "../services/archivos";
import * as corteService from "../services/corte";
import * as bitacoraService from "../services/bitacora";
import * as respaldosService from "../services/respaldos";
import * as reinicioService from "../services/reinicio";
import * as reportesService from "../services/reportes";
import * as dashboardService from "../services/dashboard";
import { buscarActualizaciones, instalarYReiniciar } from "../services/actualizaciones";
import { usuarioActualId } from "../services/usuarios";
import {
  proveedorInputSchema,
  tipoProductoInputSchema,
  productoInputSchema,
  entradaInputSchema,
  salidaInputSchema,
  movimientosFiltroSchema,
  clienteInputSchema,
  servicioCatalogoInputSchema,
  citaInputSchema,
  citasFiltroSchema,
  cierreCitaInputSchema,
  guardarRecetaInputSchema,
  bitacoraFiltroSchema,
  rangoFechasSchema,
  loteInputSchema,
} from "../../shared/schemas";

export function registrarIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle("auth:tienePin", () => auth.tienePin());
  ipcMain.handle("auth:crearPin", (_e, pin: string) => auth.crearPin(pin));
  ipcMain.handle("auth:verificarPin", (_e, pin: string) => auth.verificarPin(pin));

  ipcMain.handle("config:obtener", () => configService.obtenerConfig());
  ipcMain.handle("config:actualizar", async (_e, cambios) => {
    const siguiente = await configService.actualizarConfig(cambios);
    if (cambios.carpetaRaiz) {
      folders.asegurarEstructuraRaiz(cambios.carpetaRaiz);
    }
    return siguiente;
  });

  ipcMain.handle("carpetas:elegirCarpetaRaiz", async () => {
    const resultado = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Elegir carpeta raíz para Cabina",
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    const ruta = resultado.filePaths[0];
    folders.asegurarEstructuraRaiz(ruta);
    return ruta;
  });

  ipcMain.handle("carpetas:abrirCarpeta", (_e, ruta: string) => folders.abrirCarpeta(ruta));

  ipcMain.handle("app:version", () => app.getVersion());

  // -- Proveedores --------------------------------------------------------
  ipcMain.handle("proveedores:listar", () => proveedoresService.listarProveedores());
  ipcMain.handle("proveedores:crear", (_e, input) =>
    proveedoresService.crearProveedor(proveedorInputSchema.parse(input)),
  );
  ipcMain.handle("proveedores:actualizar", (_e, id: string, input) =>
    proveedoresService.actualizarProveedor(id, proveedorInputSchema.parse(input)),
  );
  ipcMain.handle("proveedores:eliminar", (_e, id: string) =>
    proveedoresService.eliminarProveedor(id, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("proveedores:setActivo", (_e, id: string, activo: boolean) =>
    proveedoresService.setActivoProveedor(id, activo, usuarioActualId() ?? undefined),
  );

  // -- Tipos de producto ----------------------------------------------------
  ipcMain.handle("tiposProducto:listar", () => tiposProductoService.listarTiposProducto());
  ipcMain.handle("tiposProducto:crear", (_e, input) =>
    tiposProductoService.crearTipoProducto(tipoProductoInputSchema.parse(input)),
  );
  ipcMain.handle("tiposProducto:actualizar", (_e, id: string, input) =>
    tiposProductoService.actualizarTipoProducto(id, tipoProductoInputSchema.parse(input)),
  );
  ipcMain.handle("tiposProducto:eliminar", (_e, id: string) =>
    tiposProductoService.eliminarTipoProducto(id, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("tiposProducto:setActivo", (_e, id: string, activo: boolean) =>
    tiposProductoService.setActivoTipoProducto(id, activo, usuarioActualId() ?? undefined),
  );

  // -- Productos ------------------------------------------------------------
  ipcMain.handle("productos:listar", () => productosService.listarProductos());
  ipcMain.handle("productos:crear", (_e, input) =>
    productosService.crearProducto(productoInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("productos:actualizar", (_e, id: string, input) =>
    productosService.actualizarProducto(id, productoInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("productos:eliminar", (_e, id: string) =>
    productosService.eliminarProducto(id, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("productos:setActivo", (_e, id: string, activo: boolean) =>
    productosService.setActivoProducto(id, activo, usuarioActualId() ?? undefined),
  );

  // -- Inventario -------------------------------------------------------------
  ipcMain.handle("inventario:resumen", () => inventarioService.resumenInventario());
  ipcMain.handle("inventario:lotesPorProducto", (_e, productoId: string) =>
    inventarioService.lotesPorProducto(productoId),
  );
  ipcMain.handle("inventario:proximosACaducar", () => inventarioService.lotesProximosACaducar());
  ipcMain.handle("inventario:caducados", () => inventarioService.lotesCaducados());
  ipcMain.handle("inventario:actualizarLote", (_e, id: string, input) =>
    inventarioService.actualizarLote(id, loteInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("inventario:cambiarEstadoLote", (_e, id: string, estado: "activo" | "bloqueado") =>
    inventarioService.cambiarEstadoLote(id, estado, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("inventario:eliminarLote", (_e, id: string) =>
    inventarioService.eliminarLote(id, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("inventario:registrarEntrada", (_e, input) =>
    inventarioService.registrarEntrada(entradaInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("inventario:registrarSalida", (_e, input) =>
    inventarioService.registrarSalida(salidaInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("inventario:movimientos", (_e, filtro) =>
    inventarioService.listarMovimientos(movimientosFiltroSchema.parse(filtro ?? {})),
  );

  // -- Clientes ---------------------------------------------------------------
  ipcMain.handle("clientes:listar", () => clientesService.listarClientes());
  ipcMain.handle("clientes:crear", (_e, input) =>
    clientesService.crearCliente(clienteInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("clientes:actualizar", (_e, id: string, input) =>
    clientesService.actualizarCliente(id, clienteInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("clientes:obtenerExpediente", (_e, id: string) => clientesService.obtenerExpediente(id));
  ipcMain.handle("clientes:eliminar", (_e, id: string) =>
    clientesService.eliminarCliente(id, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("clientes:setActivo", (_e, id: string, activo: boolean) =>
    clientesService.setActivoCliente(id, activo, usuarioActualId() ?? undefined),
  );

  // -- Catálogo de servicios ----------------------------------------------------
  ipcMain.handle("serviciosCatalogo:listar", () => serviciosCatalogoService.listarServiciosCatalogo());
  ipcMain.handle("serviciosCatalogo:crear", (_e, input) =>
    serviciosCatalogoService.crearServicioCatalogo(servicioCatalogoInputSchema.parse(input)),
  );
  ipcMain.handle("serviciosCatalogo:actualizar", (_e, id: string, input) =>
    serviciosCatalogoService.actualizarServicioCatalogo(id, servicioCatalogoInputSchema.parse(input)),
  );
  ipcMain.handle("serviciosCatalogo:listarReceta", (_e, servicioCatalogoId: string) =>
    serviciosCatalogoService.listarReceta(servicioCatalogoId),
  );
  ipcMain.handle("serviciosCatalogo:guardarReceta", (_e, input) => {
    const parsed = guardarRecetaInputSchema.parse(input);
    return serviciosCatalogoService.guardarReceta(parsed.servicioCatalogoId, parsed.items);
  });
  ipcMain.handle("serviciosCatalogo:eliminar", (_e, id: string) =>
    serviciosCatalogoService.eliminarServicioCatalogo(id, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("serviciosCatalogo:setActivo", (_e, id: string, activo: boolean) =>
    serviciosCatalogoService.setActivoServicioCatalogo(id, activo, usuarioActualId() ?? undefined),
  );

  // -- Citas ------------------------------------------------------------------
  ipcMain.handle("citas:listar", (_e, filtro) => citasService.listarCitas(citasFiltroSchema.parse(filtro ?? {})));
  ipcMain.handle("citas:crear", (_e, input) =>
    citasService.crearCita(citaInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("citas:actualizar", (_e, id: string, input) =>
    citasService.actualizarCita(id, citaInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("citas:cambiarEstado", (_e, id: string, estado: string) =>
    citasService.cambiarEstadoCita(id, estado, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("citas:mantenimientosNoProgramados", () => citasService.listarMantenimientosNoProgramados());
  ipcMain.handle("citas:descartarMantenimiento", (_e, servicioRealizadoId: string) =>
    citasService.descartarMantenimiento(servicioRealizadoId, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("citas:resumenCliente", (_e, clienteId: string) => citasService.resumenCliente(clienteId));

  // -- Cierre de cita / servicios realizados -----------------------------------
  ipcMain.handle("serviciosRealizados:abrirCierre", (_e, citaId: string) =>
    serviciosRealizadosService.abrirCierre(citaId),
  );
  ipcMain.handle("serviciosRealizados:cerrarCita", (_e, input) =>
    serviciosRealizadosService.cerrarCita(cierreCitaInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("serviciosRealizados:obtenerDetalle", (_e, servicioRealizadoId: string) =>
    serviciosRealizadosService.obtenerDetalle(servicioRealizadoId),
  );

  // -- Archivos -----------------------------------------------------------------
  ipcMain.handle(
    "archivos:subirComprobante",
    async (_e, entidadTipo: string, entidadId: string, carpetaDestino: string) => {
      const resultado = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        title: "Selecciona el comprobante de pago",
        filters: [{ name: "Imágenes y PDF", extensions: ["jpg", "jpeg", "png", "pdf", "webp"] }],
      });
      if (resultado.canceled || resultado.filePaths.length === 0) return null;
      return archivosService.guardarArchivoDesdeRuta({
        entidadTipo,
        entidadId,
        rutaOrigen: resultado.filePaths[0],
        carpetaDestino,
        categoria: "comprobante",
        usuarioId: usuarioActualId() ?? undefined,
      });
    },
  );
  ipcMain.handle("archivos:listar", (_e, entidadTipo: string, entidadId: string) =>
    archivosService.listarArchivos(entidadTipo, entidadId),
  );

  // -- Corte de caja ------------------------------------------------------------
  ipcMain.handle("corte:resumenPendiente", () => corteService.resumenPendiente());
  ipcMain.handle("corte:registrar", () => corteService.registrarCorte(usuarioActualId() ?? undefined));
  ipcMain.handle("corte:historial", () => corteService.listarHistorial());
  ipcMain.handle("corte:resumenDesde", (_e, fechaIso: string) => corteService.resumenDesde(fechaIso));

  // -- Dashboard ----------------------------------------------------------------
  ipcMain.handle("dashboard:resumen", () => dashboardService.resumenDashboard());

  // -- Actualizaciones automáticas ------------------------------------------------
  ipcMain.handle("actualizaciones:buscar", () => buscarActualizaciones());
  ipcMain.handle("actualizaciones:instalarYReiniciar", () => instalarYReiniciar());

  // -- Bitácora de auditoría -----------------------------------------------------
  ipcMain.handle("bitacora:listar", (_e, filtro) =>
    bitacoraService.listarBitacora(bitacoraFiltroSchema.parse(filtro ?? {})),
  );

  // -- Respaldos locales ----------------------------------------------------------
  ipcMain.handle("respaldos:crear", () => respaldosService.crearRespaldo(usuarioActualId() ?? undefined));
  ipcMain.handle("respaldos:listar", () => respaldosService.listarRespaldos());
  ipcMain.handle("respaldos:abrirCarpeta", async () => {
    const dir = await respaldosService.carpetaRespaldosActual();
    return folders.abrirCarpeta(dir);
  });
  ipcMain.handle("respaldos:restaurar", (_e, id: string, pin: string) =>
    respaldosService.restaurarRespaldo(id, pin, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("respaldos:restaurarDesdeArchivo", async (_e, pin: string) => {
    const resultado = await dialog.showOpenDialog(mainWindow, {
      title: "Selecciona un respaldo de Cabina",
      filters: [{ name: "Respaldo de Cabina", extensions: ["zip", "sqlite3"] }],
      properties: ["openFile"],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return false;
    await respaldosService.restaurarDesdeArchivo(resultado.filePaths[0], pin, usuarioActualId() ?? undefined);
    return true;
  });
  ipcMain.handle("respaldos:exportar", async (_e, id: string) => {
    const ruta = await respaldosService.obtenerRutaRespaldo(id);
    const resultado = await dialog.showSaveDialog(mainWindow, {
      title: "Exportar respaldo",
      defaultPath: path.basename(ruta),
      filters: [{ name: "Respaldo de Cabina", extensions: ["zip"] }],
    });
    if (resultado.canceled || !resultado.filePath) return false;
    fs.copyFileSync(ruta, resultado.filePath);
    return true;
  });

  // -- Borrado / reinicio de datos ------------------------------------------------
  ipcMain.handle("datos:borrarNegocio", (_e, pin: string, eliminarArchivos: boolean) =>
    reinicioService.borrarDatosNegocio(pin, { eliminarArchivos }, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("datos:restablecerFabrica", (_e, pin: string, eliminarArchivos: boolean) =>
    reinicioService.restablecerDeFabrica(pin, { eliminarArchivos }, usuarioActualId() ?? undefined),
  );

  // -- Reportes ---------------------------------------------------------------
  ipcMain.handle("reportes:cobranza", (_e, rango) =>
    reportesService.reporteCobranza(rangoFechasSchema.parse(rango)),
  );
  ipcMain.handle("reportes:inventario", (_e, rango) =>
    reportesService.reporteInventario(rangoFechasSchema.parse(rango)),
  );
  ipcMain.handle("reportes:servicios", (_e, rango) =>
    reportesService.reporteServicios(rangoFechasSchema.parse(rango)),
  );
  ipcMain.handle("reportes:clientes", (_e, rango) =>
    reportesService.reporteClientes(rangoFechasSchema.parse(rango)),
  );
  ipcMain.handle("reportes:exportarCsv", async (_e, tipo: reportesService.TipoReporte, rango) => {
    const rangoValido = rangoFechasSchema.parse(rango);
    const { nombreArchivo, contenido } = await reportesService.construirCsv(tipo, rangoValido);
    const resultado = await dialog.showSaveDialog(mainWindow, {
      title: "Exportar reporte",
      defaultPath: nombreArchivo,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (resultado.canceled || !resultado.filePath) return false;
    fs.writeFileSync(resultado.filePath, contenido, "utf-8");
    return true;
  });
}
