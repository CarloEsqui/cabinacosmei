import type { ConfigValues } from "./config";
import type {
  ProveedorInput,
  TipoProductoInput,
  ProductoInput,
  EntradaInput,
  SalidaInput,
  MovimientosFiltro,
  ClienteInput,
  ServicioCatalogoInput,
  CitaInput,
  CitasFiltro,
  CierreCitaInput,
  GuardarRecetaInput,
  RangoFechas,
  BitacoraFiltro,
  LoteInput,
} from "./schemas";
import type {
  Proveedor,
  TipoProducto,
  Producto,
  ProductoConStock,
  Lote,
  MovimientoRow,
  Cliente,
  ServicioCatalogo,
  CitaRow,
  ServicioRealizado,
  DetalleServicioRealizado,
  ArchivoRow,
  MantenimientoPendiente,
  CorteResumenPendiente,
  CorteRow,
  CorteResumenPeriodo,
  RecetaItem,
  BitacoraRow,
  RespaldoRow,
  ReporteCobranza,
  ReporteInventario,
  ReporteServicios,
  ReporteClientes,
  ResumenDashboard,
  ResumenClienteCitas,
  EstadoLicencia,
} from "./types";

export interface IpcApi {
  auth: {
    tienePin(): Promise<boolean>;
    crearPin(pin: string): Promise<void>;
    verificarPin(pin: string): Promise<boolean>;
  };
  licencia: {
    estado(): Promise<EstadoLicencia>;
    instalarToken(token: string): Promise<EstadoLicencia>;
  };
  usuarios: {
    obtenerActual(): Promise<{ id: string; nombre: string }>;
    actualizarNombre(nombre: string): Promise<{ id: string; nombre: string }>;
  };
  config: {
    obtener(): Promise<ConfigValues>;
    actualizar(valores: Partial<ConfigValues>): Promise<ConfigValues>;
  };
  carpetas: {
    elegirCarpetaRaiz(): Promise<string | null>;
    abrirCarpeta(rutaAbsoluta: string): Promise<void>;
  };
  app: {
    version(): Promise<string>;
    matricula(): Promise<string>;
  };
  proveedores: {
    listar(): Promise<Proveedor[]>;
    crear(input: ProveedorInput): Promise<Proveedor>;
    actualizar(id: string, input: ProveedorInput): Promise<Proveedor>;
    eliminar(id: string): Promise<void>;
    setActivo(id: string, activo: boolean): Promise<Proveedor>;
  };
  tiposProducto: {
    listar(): Promise<TipoProducto[]>;
    crear(input: TipoProductoInput): Promise<TipoProducto>;
    actualizar(id: string, input: TipoProductoInput): Promise<TipoProducto>;
    eliminar(id: string): Promise<void>;
    setActivo(id: string, activo: boolean): Promise<TipoProducto>;
  };
  productos: {
    listar(): Promise<Producto[]>;
    crear(input: ProductoInput): Promise<Producto>;
    actualizar(id: string, input: ProductoInput): Promise<Producto>;
    eliminar(id: string): Promise<void>;
    setActivo(id: string, activo: boolean): Promise<Producto>;
  };
  inventario: {
    resumen(): Promise<ProductoConStock[]>;
    lotesPorProducto(productoId: string): Promise<Lote[]>;
    proximosACaducar(): Promise<Lote[]>;
    caducados(): Promise<Lote[]>;
    registrarEntrada(input: EntradaInput): Promise<unknown>;
    registrarSalida(input: SalidaInput): Promise<unknown>;
    movimientos(filtro: MovimientosFiltro): Promise<MovimientoRow[]>;
    actualizarLote(id: string, input: LoteInput): Promise<Lote | undefined>;
    cambiarEstadoLote(id: string, estado: "activo" | "bloqueado"): Promise<Lote | undefined>;
    eliminarLote(id: string): Promise<void>;
  };
  clientes: {
    listar(): Promise<Cliente[]>;
    crear(input: ClienteInput): Promise<Cliente>;
    actualizar(id: string, input: ClienteInput): Promise<Cliente>;
    obtenerExpediente(id: string): Promise<Cliente | null>;
    eliminar(id: string): Promise<void>;
    setActivo(id: string, activo: boolean): Promise<Cliente>;
  };
  serviciosCatalogo: {
    listar(): Promise<ServicioCatalogo[]>;
    crear(input: ServicioCatalogoInput): Promise<ServicioCatalogo>;
    actualizar(id: string, input: ServicioCatalogoInput): Promise<ServicioCatalogo>;
    listarReceta(servicioCatalogoId: string): Promise<RecetaItem[]>;
    guardarReceta(input: GuardarRecetaInput): Promise<RecetaItem[]>;
    eliminar(id: string): Promise<void>;
    setActivo(id: string, activo: boolean): Promise<ServicioCatalogo>;
  };
  citas: {
    listar(filtro: CitasFiltro): Promise<CitaRow[]>;
    crear(input: CitaInput): Promise<CitaRow>;
    actualizar(id: string, input: CitaInput): Promise<CitaRow>;
    cambiarEstado(id: string, estado: string): Promise<CitaRow>;
    mantenimientosNoProgramados(): Promise<MantenimientoPendiente[]>;
    descartarMantenimiento(servicioRealizadoId: string): Promise<void>;
    resumenCliente(clienteId: string): Promise<ResumenClienteCitas>;
  };
  serviciosRealizados: {
    abrirCierre(citaId: string): Promise<ServicioRealizado>;
    cerrarCita(input: CierreCitaInput): Promise<ServicioRealizado>;
    obtenerDetalle(servicioRealizadoId: string): Promise<DetalleServicioRealizado | null>;
  };
  archivos: {
    subirComprobante(entidadTipo: string, entidadId: string, carpetaDestino: string): Promise<ArchivoRow | null>;
    listar(entidadTipo: string, entidadId: string): Promise<ArchivoRow[]>;
  };
  corte: {
    resumenPendiente(): Promise<CorteResumenPendiente>;
    registrar(): Promise<CorteRow>;
    historial(): Promise<CorteRow[]>;
    resumenDesde(fechaIso: string): Promise<CorteResumenPeriodo>;
  };
  dashboard: {
    resumen(): Promise<ResumenDashboard>;
  };
  actualizaciones: {
    buscar(): Promise<void>;
    instalarYReiniciar(): Promise<void>;
    onDisponible(callback: (info: { version: string }) => void): () => void;
    onDescargada(callback: (info: { version: string }) => void): () => void;
  };
  bitacora: {
    listar(filtro: BitacoraFiltro): Promise<BitacoraRow[]>;
  };
  respaldos: {
    crear(): Promise<RespaldoRow>;
    listar(): Promise<RespaldoRow[]>;
    abrirCarpeta(): Promise<void>;
    restaurar(id: string, pin: string): Promise<void>;
    restaurarDesdeArchivo(pin: string): Promise<boolean>;
    exportar(id: string): Promise<boolean>;
  };
  datos: {
    borrarNegocio(pin: string, eliminarArchivos: boolean): Promise<void>;
    restablecerFabrica(pin: string, eliminarArchivos: boolean): Promise<void>;
  };
  reportes: {
    cobranza(rango: RangoFechas): Promise<ReporteCobranza>;
    inventario(rango: RangoFechas): Promise<ReporteInventario>;
    servicios(rango: RangoFechas): Promise<ReporteServicios>;
    clientes(rango: RangoFechas): Promise<ReporteClientes>;
    exportarCsv(tipo: "cobranza" | "inventario" | "servicios", rango: RangoFechas): Promise<boolean>;
  };
}

export type IpcChannel =
  | "auth:tienePin"
  | "auth:crearPin"
  | "auth:verificarPin"
  | "licencia:estado"
  | "licencia:instalarToken"
  | "usuarios:obtenerActual"
  | "usuarios:actualizarNombre"
  | "config:obtener"
  | "config:actualizar"
  | "carpetas:elegirCarpetaRaiz"
  | "carpetas:abrirCarpeta"
  | "app:version"
  | "app:matricula"
  | "proveedores:listar"
  | "proveedores:crear"
  | "proveedores:actualizar"
  | "proveedores:eliminar"
  | "proveedores:setActivo"
  | "tiposProducto:listar"
  | "tiposProducto:crear"
  | "tiposProducto:actualizar"
  | "tiposProducto:eliminar"
  | "tiposProducto:setActivo"
  | "productos:listar"
  | "productos:crear"
  | "productos:actualizar"
  | "productos:eliminar"
  | "productos:setActivo"
  | "inventario:resumen"
  | "inventario:lotesPorProducto"
  | "inventario:proximosACaducar"
  | "inventario:caducados"
  | "inventario:actualizarLote"
  | "inventario:cambiarEstadoLote"
  | "inventario:eliminarLote"
  | "inventario:registrarEntrada"
  | "inventario:registrarSalida"
  | "inventario:movimientos"
  | "clientes:listar"
  | "clientes:crear"
  | "clientes:actualizar"
  | "clientes:obtenerExpediente"
  | "clientes:eliminar"
  | "clientes:setActivo"
  | "serviciosCatalogo:listar"
  | "serviciosCatalogo:crear"
  | "serviciosCatalogo:actualizar"
  | "serviciosCatalogo:listarReceta"
  | "serviciosCatalogo:guardarReceta"
  | "serviciosCatalogo:eliminar"
  | "serviciosCatalogo:setActivo"
  | "citas:listar"
  | "citas:crear"
  | "citas:actualizar"
  | "citas:cambiarEstado"
  | "citas:mantenimientosNoProgramados"
  | "citas:descartarMantenimiento"
  | "citas:resumenCliente"
  | "serviciosRealizados:abrirCierre"
  | "serviciosRealizados:cerrarCita"
  | "serviciosRealizados:obtenerDetalle"
  | "archivos:subirComprobante"
  | "archivos:listar"
  | "corte:resumenPendiente"
  | "corte:registrar"
  | "corte:historial"
  | "corte:resumenDesde"
  | "dashboard:resumen"
  | "bitacora:listar"
  | "respaldos:crear"
  | "respaldos:listar"
  | "respaldos:abrirCarpeta"
  | "respaldos:restaurar"
  | "respaldos:restaurarDesdeArchivo"
  | "respaldos:exportar"
  | "datos:borrarNegocio"
  | "datos:restablecerFabrica"
  | "reportes:cobranza"
  | "reportes:inventario"
  | "reportes:servicios"
  | "reportes:clientes"
  | "reportes:exportarCsv";
