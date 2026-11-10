import fs from "node:fs";
import path from "node:path";
import { ipcMain, dialog, app, shell, type BrowserWindow } from "electron";
import { z } from "zod";
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
import * as comprobantesService from "../services/comprobantes";
import * as fichasService from "../services/fichasClinicas";
import * as corteService from "../services/corte";
import * as cobrosService from "../services/cobros";
import * as ventasService from "../services/ventasMostrador";
import * as bitacoraService from "../services/bitacora";
import * as respaldosService from "../services/respaldos";
import * as reinicioService from "../services/reinicio";
import * as exportarCsvService from "../services/exportarCsv";
import * as reportesResumenService from "../services/reportesResumen";
import * as reportesFinanzasService from "../services/reportesFinanzas";
import * as reportesServiciosDetalleService from "../services/reportesServiciosDetalle";
import * as reportesClientesDetalleService from "../services/reportesClientesDetalle";
import * as reportesAgendaService from "../services/reportesAgenda";
import * as reportesInventarioDetalleService from "../services/reportesInventarioDetalle";
import * as reportesHallazgosService from "../services/reportesHallazgos";
import * as hallazgosEstadoService from "../services/hallazgosEstado";
import * as dashboardService from "../services/dashboard";
import { buscarActualizaciones, instalarYReiniciar, obtenerEstadoActualizacion } from "../services/actualizaciones";
import { usuarioActualId, obtenerUsuarioActual, actualizarNombreUsuario } from "../services/usuarios";
import { obtenerMatricula } from "../services/matricula";
import { estadoLicencia, instalarToken } from "../services/licencia";
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
  cancelacionInventarioSchema,
  citasFiltroSchema,
  cierreCitaInputSchema,
  abonoInputSchema,
  anticipoInputSchema,
  esEfectivo,
  cancelarPagoInputSchema,
  descuentoInputSchema,
  quitarDescuentoInputSchema,
  ventaMostradorInputSchema,
  cancelarVentaInputSchema,
  listarVentasInputSchema,
  guardarFichaInputSchema,
  momentoFotoSchema,
  guardarRecetaInputSchema,
  bitacoraFiltroSchema,
  resumenFiltroSchema,
  loteInputSchema,
  establecerEstadoHallazgoInputSchema,
  exportCsvTipoSchema,
} from "../../shared/schemas";

let ventanaActual: BrowserWindow | null = null;
let ipcRegistrado = false;

/**
 * Actualiza la referencia a la ventana principal vigente. Se llama cada vez que se (re)crea (ej.
 * al reabrir la app en macOS tras cerrar todas las ventanas), a diferencia de `registrarIpc` que
 * solo debe correr una vez por proceso.
 */
export function establecerVentanaPrincipal(ventana: BrowserWindow): void {
  ventanaActual = ventana;
}

function mainWindow(): BrowserWindow {
  if (!ventanaActual || ventanaActual.isDestroyed()) {
    throw new Error("No hay una ventana principal activa.");
  }
  return ventanaActual;
}

/**
 * Registra todos los handlers de IPC. `ipcMain.handle` lanza si se registra dos veces el mismo
 * canal, así que esto debe llamarse UNA sola vez por proceso — nunca por ventana. (Antes se
 * llamaba dentro de `crearVentanaPrincipal`, y en macOS, al cerrar la ventana con el botón rojo y
 * reabrir la app, esa función se ejecutaba de nuevo, lanzaba aquí mismo y la ventana quedaba en
 * blanco porque nunca se llegaba a `loadURL`/`loadFile`.)
 */
export function registrarIpc(): void {
  if (ipcRegistrado) return;
  ipcRegistrado = true;

  ipcMain.handle("auth:tienePin", () => auth.tienePin());
  ipcMain.handle("auth:crearPin", (_e, pin: string) => auth.crearPin(pin));
  ipcMain.handle("auth:verificarPin", (_e, pin: string) => auth.verificarPin(pin));

  ipcMain.handle("licencia:estado", () => estadoLicencia());
  ipcMain.handle("licencia:instalarToken", (_e, token: string) => instalarToken(token));

  ipcMain.handle("usuarios:obtenerActual", () => obtenerUsuarioActual());
  ipcMain.handle("usuarios:actualizarNombre", (_e, nombre: string) => actualizarNombreUsuario(nombre));

  ipcMain.handle("config:obtener", () => configService.obtenerConfig());
  ipcMain.handle("config:actualizar", async (_e, cambios) => {
    const siguiente = await configService.actualizarConfig(cambios);
    if (cambios.carpetaRaiz) {
      folders.asegurarEstructuraRaiz(cambios.carpetaRaiz);
    }
    if (cambios.escalaTexto !== undefined) {
      mainWindow().webContents.setZoomFactor(siguiente.escalaTexto);
    }
    return siguiente;
  });

  ipcMain.handle("carpetas:elegirCarpetaRaiz", async () => {
    const resultado = await dialog.showOpenDialog(mainWindow(), {
      properties: ["openDirectory", "createDirectory"],
      title: "Elegir carpeta raíz para Bellora",
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    const ruta = resultado.filePaths[0];
    folders.asegurarEstructuraRaiz(ruta);
    return ruta;
  });

  ipcMain.handle("carpetas:abrirCarpeta", (_e, ruta: string) => folders.abrirCarpeta(ruta));

  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("app:matricula", () => obtenerMatricula());

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
  ipcMain.handle("inventario:cancelarEntrada", (_e, id: string, motivo?: string) => {
    const input = cancelacionInventarioSchema.parse({ id, motivo });
    return inventarioService.cancelarEntrada(input.id, input.motivo, usuarioActualId() ?? undefined);
  });
  ipcMain.handle("inventario:cancelarSalida", (_e, id: string, motivo?: string) => {
    const input = cancelacionInventarioSchema.parse({ id, motivo });
    return inventarioService.cancelarSalida(input.id, input.motivo, usuarioActualId() ?? undefined);
  });
  ipcMain.handle("inventario:darDeBajaLote", (_e, id: string, motivo?: string) =>
    inventarioService.darDeBajaLote(id, typeof motivo === "string" ? motivo : undefined, usuarioActualId() ?? undefined),
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
  ipcMain.handle("citas:reactivar", (_e, id: string) =>
    citasService.reactivarCita(id, usuarioActualId() ?? undefined),
  );
  ipcMain.handle("citas:eliminar", (_e, id: string) =>
    citasService.eliminarCita(id, usuarioActualId() ?? undefined),
  );
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
  // Comprobantes: el renderer manda ids; la carpeta destino la resuelve el main (y la crea si falta).
  const idSchema = z.string().min(1);
  async function elegirArchivoComprobante(): Promise<string | null> {
    const resultado = await dialog.showOpenDialog(mainWindow(), {
      properties: ["openFile"],
      title: "Selecciona el comprobante de pago",
      filters: [{ name: "Imágenes y PDF", extensions: comprobantesService.EXTENSIONES_COMPROBANTE }],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    return resultado.filePaths[0];
  }
  ipcMain.handle("archivos:subirComprobante", async (_e, servicioRealizadoId: string) => {
    const id = idSchema.parse(servicioRealizadoId);
    const ruta = await elegirArchivoComprobante();
    if (!ruta) return null;
    return comprobantesService.subirComprobanteServicio(id, ruta, usuarioActualId() ?? undefined);
  });
  ipcMain.handle("archivos:elegirComprobante", async () => {
    const ruta = await elegirArchivoComprobante();
    return ruta ? comprobantesService.guardarSeleccion(ruta) : null;
  });
  ipcMain.handle("archivos:descartarComprobante", (_e, token: string) =>
    comprobantesService.descartarSeleccion(idSchema.parse(token)),
  );
  ipcMain.handle("archivos:comprobantesCita", (_e, citaId: string) =>
    comprobantesService.listarComprobantesCita(idSchema.parse(citaId)),
  );
  ipcMain.handle("archivos:vistaPrevia", (_e, archivoId: string, tamano: string) =>
    comprobantesService.vistaPrevia(idSchema.parse(archivoId), tamano === "grande" ? "grande" : "mini"),
  );
  ipcMain.handle("archivos:abrirComprobante", async (_e, archivoId: string) => {
    const { ruta } = await comprobantesService.rutaComprobante(idSchema.parse(archivoId));
    const error = await shell.openPath(ruta);
    if (error) throw new Error(`No se pudo abrir el comprobante: ${error}`);
  });
  ipcMain.handle("archivos:guardarCopiaComprobante", async (_e, archivoId: string) => {
    const id = idSchema.parse(archivoId);
    const { nombre } = await comprobantesService.rutaComprobante(id);
    const resultado = await dialog.showSaveDialog(mainWindow(), {
      title: "Guardar una copia del comprobante",
      defaultPath: path.join(app.getPath("downloads"), nombre),
    });
    if (resultado.canceled || !resultado.filePath) return false;
    await comprobantesService.guardarCopia(id, resultado.filePath, usuarioActualId() ?? undefined);
    return true;
  });
  // -- Ficha clínica (spec de la ficha §21.4). Ningún canal recibe rutas: el main las resuelve. --
  ipcMain.handle("fichas:obtener", (_e, clienteId: string) => fichasService.obtenerFicha(idSchema.parse(clienteId)));
  ipcMain.handle("fichas:guardar", (_e, input) =>
    fichasService.guardarFicha(guardarFichaInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("fichas:versiones", (_e, clienteId: string) => fichasService.listarVersiones(idSchema.parse(clienteId)));
  ipcMain.handle("fichas:borrar", (_e, clienteId: string) =>
    fichasService.borrarFicha(idSchema.parse(clienteId), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("fichas:aviso", (_e, clienteId: string) => fichasService.avisoFicha(idSchema.parse(clienteId)));
  ipcMain.handle("fichas:tratamientos", (_e, clienteId: string) =>
    fichasService.listarTratamientos(idSchema.parse(clienteId)),
  );
  ipcMain.handle("fichas:fotosServicio", (_e, servicioRealizadoId: string) =>
    fichasService.fotosServicio(idSchema.parse(servicioRealizadoId)),
  );
  ipcMain.handle("fichas:subirFoto", async (_e, servicioRealizadoId: string, momento: string) => {
    const id = idSchema.parse(servicioRealizadoId);
    const cual = momentoFotoSchema.parse(momento);
    const resultado = await dialog.showOpenDialog(mainWindow(), {
      properties: ["openFile"],
      title: cual === "antes" ? "Selecciona la foto de antes" : "Selecciona la foto de después",
      filters: [{ name: "Fotos", extensions: fichasService.EXTENSIONES_FOTO }],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    return fichasService.subirFoto(id, cual, resultado.filePaths[0], usuarioActualId() ?? undefined);
  });
  ipcMain.handle("fichas:miniatura", (_e, archivoId: string) => fichasService.miniatura(idSchema.parse(archivoId)));
  ipcMain.handle("fichas:vista", (_e, archivoId: string) => fichasService.vistaFoto(idSchema.parse(archivoId)));
  ipcMain.handle("fichas:abrirFoto", async (_e, archivoId: string) => {
    const ruta = await fichasService.rutaFoto(idSchema.parse(archivoId));
    const error = await shell.openPath(ruta);
    if (error) throw new Error(`No se pudo abrir la foto: ${error}`);
  });
  ipcMain.handle("fichas:quitarFoto", (_e, archivoId: string) =>
    fichasService.quitarFoto(idSchema.parse(archivoId), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("serviciosRealizados:actualizarObservaciones", (_e, servicioRealizadoId: string, observaciones: unknown) =>
    serviciosRealizadosService.actualizarObservacionesServicio(
      idSchema.parse(servicioRealizadoId),
      z.string().max(4000).parse(observaciones),
      usuarioActualId() ?? undefined,
    ),
  );
  ipcMain.handle("archivos:listar", (_e, entidadTipo: string, entidadId: string) =>
    archivosService.listarArchivos(entidadTipo, entidadId),
  );

  // -- Corte de caja ------------------------------------------------------------
  ipcMain.handle("cobros:registrarAbono", (_e, input) =>
    cobrosService.registrarAbono(abonoInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  // COB-A2: el anticipo ya quedó registrado cuando se adjunta el comprobante. Si el adjunto falla, NO
  // se lanza (el renderer creería que no se registró y permitiría repetirlo): se devuelve un aviso y
  // la bitácora deja "sin comprobante".
  ipcMain.handle("cobros:registrarAnticipo", async (_e, input) => {
    const datos = anticipoInputSchema.parse(input);
    const usuarioId = usuarioActualId() ?? undefined;
    const ids = await cobrosService.registrarAnticipo(datos, usuarioId);
    if (!datos.comprobanteToken) return { comprobanteGuardado: false };
    try {
      // Solo los pagos que no son en efectivo llevan el comprobante.
      const conEvidencia = ids.filter((_, i) => !esEfectivo(datos.lineas[i].metodoPago));
      await comprobantesService.adjuntarComprobanteAnticipo(datos.comprobanteToken, datos.citaId, conEvidencia, usuarioId);
      return { comprobanteGuardado: true };
    } catch (e) {
      const motivo = (e as Error).message;
      cobrosService.registrarAnticipoSinComprobanteGuardado(datos.citaId, motivo, usuarioId);
      return {
        comprobanteGuardado: false,
        aviso: `El anticipo quedó registrado, pero el comprobante no se pudo guardar (${motivo}). Puedes agregarlo después desde la cita.`,
      };
    }
  });
  // -- Venta de mostrador (0008) -------------------------------------------------
  // Condición 10 del Gate de la venta: la venta se confirma primero; si el comprobante elegido no se
  // puede guardar, NO se lanza (el renderer creería que no se vendió y la repetiría): aviso + bitácora.
  ipcMain.handle("ventas:registrar", async (_e, input) => {
    const datos = ventaMostradorInputSchema.parse(input);
    const usuarioId = usuarioActualId() ?? undefined;
    const r = await ventasService.registrarVenta(datos, usuarioId);
    if (!datos.comprobanteToken) return { id: r.id, folio: r.folio, comprobanteGuardado: false };
    try {
      const conEvidencia = r.pagoIds.filter((_, i) => !esEfectivo(datos.pagos[i].metodoPago));
      await comprobantesService.adjuntarComprobanteVenta(datos.comprobanteToken, r.id, conEvidencia, usuarioId);
      return { id: r.id, folio: r.folio, comprobanteGuardado: true };
    } catch (e) {
      const motivo = (e as Error).message;
      ventasService.registrarVentaSinComprobanteGuardado(r.id, motivo, usuarioId);
      return {
        id: r.id,
        folio: r.folio,
        comprobanteGuardado: false,
        aviso: `La venta ${r.folio} quedó registrada, pero el comprobante no se pudo guardar (${motivo}). Puedes agregarlo desde la venta.`,
      };
    }
  });
  ipcMain.handle("ventas:listar", (_e, pagina: unknown) =>
    ventasService.listarVentas(listarVentasInputSchema.parse({ pagina }).pagina),
  );
  ipcMain.handle("ventas:detalle", (_e, ventaId: string) => ventasService.detalleVenta(idSchema.parse(ventaId)));
  ipcMain.handle("ventas:porCliente", (_e, clienteId: string) => ventasService.ventasPorCliente(idSchema.parse(clienteId)));
  ipcMain.handle("ventas:porCobrar", () => ventasService.ventasPorCobrar());
  ipcMain.handle("ventas:frecuentes", () => ventasService.productosFrecuentes());
  ipcMain.handle("ventas:cancelar", (_e, input) =>
    ventasService.cancelarVenta(cancelarVentaInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("ventas:subirComprobante", async (_e, ventaId: string) => {
    const id = idSchema.parse(ventaId);
    const ruta = await elegirArchivoComprobante();
    if (!ruta) return null;
    return comprobantesService.subirComprobanteVenta(id, ruta, usuarioActualId() ?? undefined);
  });
  ipcMain.handle("cobros:cancelarPago", (_e, input) =>
    cobrosService.cancelarPago(cancelarPagoInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("cobros:estadoCuentaCita", (_e, citaId: string) =>
    cobrosService.estadoCuentaCita(idSchema.parse(citaId)),
  );
  // Descuentos (spec de descuentos, FR-005 y FR-006). Sin PIN: decisión de Carlos del 2026-11-06 (BR-008).
  ipcMain.handle("cobros:aplicarDescuento", (_e, input) =>
    cobrosService.aplicarDescuento(descuentoInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("cobros:quitarDescuento", (_e, input) =>
    cobrosService.quitarDescuento(quitarDescuentoInputSchema.parse(input), usuarioActualId() ?? undefined),
  );
  ipcMain.handle("corte:resumenPendiente", () => corteService.resumenPendiente());
  ipcMain.handle("corte:registrar", () => corteService.registrarCorte(usuarioActualId() ?? undefined));
  ipcMain.handle("corte:historial", () => corteService.listarHistorial());
  ipcMain.handle("corte:resumenDesde", (_e, fechaIso: string) => corteService.resumenDesde(fechaIso));

  // -- Dashboard ----------------------------------------------------------------
  ipcMain.handle("dashboard:resumen", () => dashboardService.resumenDashboard());

  // -- Actualizaciones automáticas ------------------------------------------------
  ipcMain.handle("actualizaciones:buscar", () => buscarActualizaciones());
  ipcMain.handle("actualizaciones:instalarYReiniciar", () => instalarYReiniciar());
  ipcMain.handle("actualizaciones:estado", () => obtenerEstadoActualizacion());

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
  // Tras restaurar, la base de datos y los archivos ya se reemplazaron en el sitio; recargar la
  // ventana para que el renderer vuelva a leer los datos restaurados (queda en la pantalla de PIN).
  // Se recarga en el siguiente tick para no cortar la respuesta IPC antes de que llegue al renderer.
  function recargarTrasRestaurar() {
    setTimeout(() => {
      if (ventanaActual && !ventanaActual.isDestroyed()) ventanaActual.webContents.reload();
    }, 50);
  }
  ipcMain.handle("respaldos:restaurar", async (_e, id: string, pin: string) => {
    await respaldosService.restaurarRespaldo(id, pin, usuarioActualId() ?? undefined);
    recargarTrasRestaurar();
  });
  ipcMain.handle("respaldos:restaurarDesdeArchivo", async (_e, pin: string) => {
    const resultado = await dialog.showOpenDialog(mainWindow(), {
      title: "Selecciona un respaldo de Bellora",
      filters: [{ name: "Respaldo de Bellora", extensions: ["zip", "sqlite3"] }],
      properties: ["openFile"],
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return false;
    await respaldosService.restaurarDesdeArchivo(resultado.filePaths[0], pin, usuarioActualId() ?? undefined);
    recargarTrasRestaurar();
    return true;
  });
  ipcMain.handle("respaldos:exportar", async (_e, id: string) => {
    const ruta = await respaldosService.obtenerRutaRespaldo(id);
    const resultado = await dialog.showSaveDialog(mainWindow(), {
      title: "Exportar respaldo",
      defaultPath: path.basename(ruta),
      filters: [{ name: "Respaldo de Bellora", extensions: ["zip"] }],
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
  ipcMain.handle("reportes:resumen", (_e, filtro) =>
    reportesResumenService.reporteResumen(resumenFiltroSchema.parse(filtro)),
  );
  ipcMain.handle("reportes:finanzas", (_e, filtro) =>
    reportesFinanzasService.reporteFinanzas(resumenFiltroSchema.parse(filtro)),
  );
  ipcMain.handle("reportes:carteraDetalle", () => reportesFinanzasService.carteraDetallePorCliente());
  ipcMain.handle("reportes:serviciosDetalle", (_e, filtro) =>
    reportesServiciosDetalleService.reporteServiciosDetalle(resumenFiltroSchema.parse(filtro)),
  );
  ipcMain.handle("reportes:clientesDetalle", (_e, filtro) =>
    reportesClientesDetalleService.reporteClientesDetalle(resumenFiltroSchema.parse(filtro)),
  );
  ipcMain.handle("reportes:agenda", (_e, filtro) =>
    reportesAgendaService.reporteAgenda(resumenFiltroSchema.parse(filtro)),
  );
  ipcMain.handle("reportes:inventarioDetalle", (_e, filtro) =>
    reportesInventarioDetalleService.reporteInventarioDetalle(resumenFiltroSchema.parse(filtro)),
  );
  ipcMain.handle("reportes:hallazgos", (_e, filtro) =>
    reportesHallazgosService.reporteHallazgos(resumenFiltroSchema.parse(filtro)),
  );
  ipcMain.handle("reportes:establecerEstadoHallazgo", (_e, input) => {
    const { hallazgoId, fechaDesde, fechaHasta, estado } = establecerEstadoHallazgoInputSchema.parse(input);
    hallazgosEstadoService.establecerEstadoHallazgo(hallazgoId, fechaDesde, fechaHasta, estado, usuarioActualId() ?? undefined);
  });
  ipcMain.handle("reportes:exportarCsv", async (_e, tipoRaw, filtroRaw) => {
    const tipo = exportCsvTipoSchema.parse(tipoRaw);
    // "movimientos" usa el filtro de inventario; el resto, el filtro de reportes con rango de fechas.
    const filtro =
      tipo === "movimientos"
        ? movimientosFiltroSchema.parse(filtroRaw ?? {})
        : resumenFiltroSchema.parse(filtroRaw);
    const { nombreArchivo, contenido } = await exportarCsvService.construirCsvExport(tipo, filtro);
    const resultado = await dialog.showSaveDialog(mainWindow(), {
      title: "Exportar CSV",
      defaultPath: nombreArchivo,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (resultado.canceled || !resultado.filePath) return false;
    fs.writeFileSync(resultado.filePath, contenido, "utf-8");
    return true;
  });
}
