import { contextBridge, ipcRenderer } from "electron";
import type { IpcApi } from "../shared/ipc-contract";

const api: IpcApi = {
  auth: {
    tienePin: () => ipcRenderer.invoke("auth:tienePin"),
    crearPin: (pin) => ipcRenderer.invoke("auth:crearPin", pin),
    verificarPin: (pin) => ipcRenderer.invoke("auth:verificarPin", pin),
  },
  config: {
    obtener: () => ipcRenderer.invoke("config:obtener"),
    actualizar: (valores) => ipcRenderer.invoke("config:actualizar", valores),
  },
  carpetas: {
    elegirCarpetaRaiz: () => ipcRenderer.invoke("carpetas:elegirCarpetaRaiz"),
    abrirCarpeta: (ruta) => ipcRenderer.invoke("carpetas:abrirCarpeta", ruta),
  },
  app: {
    version: () => ipcRenderer.invoke("app:version"),
  },
  proveedores: {
    listar: () => ipcRenderer.invoke("proveedores:listar"),
    crear: (input) => ipcRenderer.invoke("proveedores:crear", input),
    actualizar: (id, input) => ipcRenderer.invoke("proveedores:actualizar", id, input),
  },
  tiposProducto: {
    listar: () => ipcRenderer.invoke("tiposProducto:listar"),
    crear: (input) => ipcRenderer.invoke("tiposProducto:crear", input),
    actualizar: (id, input) => ipcRenderer.invoke("tiposProducto:actualizar", id, input),
  },
  productos: {
    listar: () => ipcRenderer.invoke("productos:listar"),
    crear: (input) => ipcRenderer.invoke("productos:crear", input),
    actualizar: (id, input) => ipcRenderer.invoke("productos:actualizar", id, input),
  },
  inventario: {
    resumen: () => ipcRenderer.invoke("inventario:resumen"),
    lotesPorProducto: (productoId) => ipcRenderer.invoke("inventario:lotesPorProducto", productoId),
    proximosACaducar: () => ipcRenderer.invoke("inventario:proximosACaducar"),
    caducados: () => ipcRenderer.invoke("inventario:caducados"),
    registrarEntrada: (input) => ipcRenderer.invoke("inventario:registrarEntrada", input),
    registrarSalida: (input) => ipcRenderer.invoke("inventario:registrarSalida", input),
    movimientos: (filtro) => ipcRenderer.invoke("inventario:movimientos", filtro),
  },
  clientes: {
    listar: () => ipcRenderer.invoke("clientes:listar"),
    crear: (input) => ipcRenderer.invoke("clientes:crear", input),
    actualizar: (id, input) => ipcRenderer.invoke("clientes:actualizar", id, input),
    obtenerExpediente: (id) => ipcRenderer.invoke("clientes:obtenerExpediente", id),
  },
  serviciosCatalogo: {
    listar: () => ipcRenderer.invoke("serviciosCatalogo:listar"),
    crear: (input) => ipcRenderer.invoke("serviciosCatalogo:crear", input),
    actualizar: (id, input) => ipcRenderer.invoke("serviciosCatalogo:actualizar", id, input),
    listarReceta: (servicioCatalogoId) =>
      ipcRenderer.invoke("serviciosCatalogo:listarReceta", servicioCatalogoId),
    guardarReceta: (input) => ipcRenderer.invoke("serviciosCatalogo:guardarReceta", input),
  },
  citas: {
    listar: (filtro) => ipcRenderer.invoke("citas:listar", filtro),
    crear: (input) => ipcRenderer.invoke("citas:crear", input),
    actualizar: (id, input) => ipcRenderer.invoke("citas:actualizar", id, input),
    cambiarEstado: (id, estado) => ipcRenderer.invoke("citas:cambiarEstado", id, estado),
    mantenimientosNoProgramados: () => ipcRenderer.invoke("citas:mantenimientosNoProgramados"),
  },
  serviciosRealizados: {
    abrirCierre: (citaId) => ipcRenderer.invoke("serviciosRealizados:abrirCierre", citaId),
    cerrarCita: (input) => ipcRenderer.invoke("serviciosRealizados:cerrarCita", input),
  },
  archivos: {
    subirComprobante: (entidadTipo, entidadId, carpetaDestino) =>
      ipcRenderer.invoke("archivos:subirComprobante", entidadTipo, entidadId, carpetaDestino),
    listar: (entidadTipo, entidadId) => ipcRenderer.invoke("archivos:listar", entidadTipo, entidadId),
  },
  corte: {
    resumenPendiente: () => ipcRenderer.invoke("corte:resumenPendiente"),
    registrar: () => ipcRenderer.invoke("corte:registrar"),
    historial: () => ipcRenderer.invoke("corte:historial"),
    resumenDesde: (fechaIso) => ipcRenderer.invoke("corte:resumenDesde", fechaIso),
  },
  bitacora: {
    listar: (filtro) => ipcRenderer.invoke("bitacora:listar", filtro),
  },
  respaldos: {
    crear: () => ipcRenderer.invoke("respaldos:crear"),
    listar: () => ipcRenderer.invoke("respaldos:listar"),
    abrirCarpeta: () => ipcRenderer.invoke("respaldos:abrirCarpeta"),
    restaurar: (id, pin) => ipcRenderer.invoke("respaldos:restaurar", id, pin),
  },
  reportes: {
    cobranza: (rango) => ipcRenderer.invoke("reportes:cobranza", rango),
    inventario: (rango) => ipcRenderer.invoke("reportes:inventario", rango),
    servicios: (rango) => ipcRenderer.invoke("reportes:servicios", rango),
    clientes: (rango) => ipcRenderer.invoke("reportes:clientes", rango),
    exportarCsv: (tipo, rango) => ipcRenderer.invoke("reportes:exportarCsv", tipo, rango),
  },
};

contextBridge.exposeInMainWorld("api", api);
