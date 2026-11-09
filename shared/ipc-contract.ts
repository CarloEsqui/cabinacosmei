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
  AbonoInput,
  AnticipoInput,
  CancelarPagoInput,
  DescuentoInput,
  QuitarDescuentoInput,
  VentaMostradorInput,
  CancelarVentaInput,
  GuardarFichaInput,
  GuardarRecetaInput,
  ResumenFiltro,
  BitacoraFiltro,
  LoteInput,
  EstablecerEstadoHallazgoInput,
  ExportCsvTipo,
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
  EstadoCuentaCita,
  ArchivoRow,
  ComprobanteRow,
  FichaClinica,
  VersionFicha,
  AvisoFicha,
  TratamientoFicha,
  FotoTratamiento,
  MantenimientoPendiente,
  CorteResumenPendiente,
  CorteRow,
  CorteResumenPeriodo,
  RecetaItem,
  BitacoraRow,
  RespaldoRow,
  ResumenDashboard,
  ResumenClienteCitas,
  ResumenReporte,
  ReporteFinanzas,
  CarteraClienteFila,
  ReporteServiciosDetalle,
  ReporteClientesDetalle,
  ReporteAgenda,
  ReporteInventarioDetalle,
  Hallazgo,
  EstadoLicencia,
  DetalleVentaMostrador,
  PaginaVentasMostrador,
  VentaMostradorRow,
  ProductoFrecuente,
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
    darDeBajaLote(id: string, motivo?: string): Promise<unknown>;
    cancelarEntrada(id: string, motivo?: string): Promise<void>;
    cancelarSalida(id: string, motivo?: string): Promise<void>;
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
    reactivar(id: string): Promise<CitaRow>;
    eliminar(id: string): Promise<void>;
    descartarMantenimiento(servicioRealizadoId: string): Promise<void>;
    resumenCliente(clienteId: string): Promise<ResumenClienteCitas>;
  };
  serviciosRealizados: {
    abrirCierre(citaId: string): Promise<ServicioRealizado>;
    cerrarCita(input: CierreCitaInput): Promise<ServicioRealizado>;
    obtenerDetalle(servicioRealizadoId: string): Promise<DetalleServicioRealizado | null>;
    /** Notas del tratamiento, también con la cita cerrada. No se versionan (ficha, condición 9). */
    actualizarObservaciones(servicioRealizadoId: string, observaciones: string): Promise<void>;
  };
  /**
   * Ficha clínica facial (spec de la ficha §21.4). DATOS DE SALUD: ninguna firma recibe rutas;
   * fuera de la ficha solo se usa `aviso`.
   */
  fichas: {
    obtener(clienteId: string): Promise<FichaClinica | null>;
    /** Rechaza si `updatedAtEsperado` no coincide (otra ventana guardó antes). Sin cambios = sin versión. */
    guardar(input: GuardarFichaInput): Promise<FichaClinica>;
    versiones(clienteId: string): Promise<VersionFicha[]>;
    /** FR-011: borra ficha, versiones y fotos. Sin PIN; la UI confirma. */
    borrar(clienteId: string): Promise<{ archivosNoBorrados: number }>;
    aviso(clienteId: string): Promise<AvisoFicha>;
    tratamientos(clienteId: string): Promise<TratamientoFicha[]>;
    fotosServicio(servicioRealizadoId: string): Promise<FotoTratamiento[]>;
    /** El main abre el diálogo y valida; null si se canceló. */
    subirFoto(servicioRealizadoId: string, momento: "antes" | "despues"): Promise<FotoTratamiento | null>;
    miniatura(archivoId: string): Promise<{ dataUrl: string } | { faltante: true }>;
    /** Foto reducida a ≤ 1600 px para el carrusel; una por llamada. */
    vista(archivoId: string): Promise<{ dataUrl: string } | { faltante: true }>;
    abrirFoto(archivoId: string): Promise<void>;
    quitarFoto(archivoId: string): Promise<void>;
  };
  // Cobro v2 (spec §22.2). El PIN se verifica en el main, nunca en el renderer.
  cobros: {
    registrarAbono(input: AbonoInput): Promise<void>;
    registrarAnticipo(input: AnticipoInput): Promise<{ comprobanteGuardado: boolean; aviso?: string }>;
    cancelarPago(input: CancelarPagoInput): Promise<void>;
    estadoCuentaCita(citaId: string): Promise<EstadoCuentaCita>;
    /** FR-005: aplica o cambia el descuento de un servicio YA CERRADO. Sin PIN (BR-008). */
    aplicarDescuento(input: DescuentoInput): Promise<void>;
    /** FR-006: quita (cancela) un descuento; nunca se borra. */
    quitarDescuento(input: QuitarDescuentoInput): Promise<void>;
  };
  /**
   * Venta de productos en mostrador (migración 0008; spec de la venta §22.4). El renderer nunca manda
   * totales, estatus ni rutas. Abono, descuento y cancelar un pago usan `cobros:*` con `ventaMostradorId`.
   */
  ventas: {
    /** Si el comprobante elegido no se pudo guardar, la venta igual queda registrada (condición 10). */
    registrar(input: VentaMostradorInput): Promise<{ id: string; folio: string; comprobanteGuardado: boolean; aviso?: string }>;
    /** 30 por página, la más reciente primero. */
    listar(pagina: number): Promise<PaginaVentasMostrador>;
    detalle(ventaId: string): Promise<DetalleVentaMostrador>;
    porCliente(clienteId: string): Promise<VentaMostradorRow[]>;
    /** Ventas de clientas con saldo, la más antigua primero (§23). */
    porCobrar(): Promise<VentaMostradorRow[]>;
    /** Los productos más vendidos en mostrador en los últimos 90 días (§23). */
    frecuentes(): Promise<ProductoFrecuente[]>;
    /** Con PIN (motivo opcional): regresa el stock y cancela los pagos. */
    cancelar(input: CancelarVentaInput): Promise<void>;
    /** Comprobante después de la venta; el main abre el diálogo y decide la carpeta. */
    subirComprobante(ventaId: string): Promise<ArchivoRow | null>;
  };
  archivos: {
    /** Comprobante del servicio cerrado; el main resuelve (y crea si falta) la carpeta. */
    subirComprobante(servicioRealizadoId: string): Promise<ArchivoRow | null>;
    /** Elige un archivo para un anticipo aún no registrado; devuelve un token, nunca la ruta. */
    elegirComprobante(): Promise<{ token: string; nombre: string } | null>;
    /** Libera un comprobante elegido que ya no se usará (se quitó o se cerró el panel). */
    descartarComprobante(token: string): Promise<void>;
    comprobantesCita(citaId: string): Promise<ComprobanteRow[]>;
    vistaPrevia(archivoId: string, tamano: "mini" | "grande"): Promise<string | null>;
    abrirComprobante(archivoId: string): Promise<void>;
    guardarCopiaComprobante(archivoId: string): Promise<boolean>;
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
    resumen(filtro: ResumenFiltro): Promise<ResumenReporte>;
    finanzas(filtro: ResumenFiltro): Promise<ReporteFinanzas>;
    carteraDetalle(): Promise<CarteraClienteFila[]>;
    serviciosDetalle(filtro: ResumenFiltro): Promise<ReporteServiciosDetalle>;
    clientesDetalle(filtro: ResumenFiltro): Promise<ReporteClientesDetalle>;
    agenda(filtro: ResumenFiltro): Promise<ReporteAgenda>;
    inventarioDetalle(filtro: ResumenFiltro): Promise<ReporteInventarioDetalle>;
    hallazgos(filtro: ResumenFiltro): Promise<Hallazgo[]>;
    establecerEstadoHallazgo(input: EstablecerEstadoHallazgoInput): Promise<void>;
    /**
     * Exporta a un archivo CSV el detalle del tipo indicado. Para "movimientos" el filtro es un
     * `MovimientosFiltro`; para el resto es un `ResumenFiltro`. Devuelve false si se canceló el diálogo.
     */
    exportarCsv(tipo: ExportCsvTipo, filtro: ResumenFiltro | MovimientosFiltro): Promise<boolean>;
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
  | "inventario:darDeBajaLote"
  | "inventario:cancelarEntrada"
  | "inventario:cancelarSalida"
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
  | "citas:reactivar"
  | "citas:eliminar"
  | "citas:descartarMantenimiento"
  | "citas:resumenCliente"
  | "serviciosRealizados:abrirCierre"
  | "serviciosRealizados:cerrarCita"
  | "serviciosRealizados:obtenerDetalle"
  | "cobros:registrarAbono"
  | "cobros:registrarAnticipo"
  | "cobros:cancelarPago"
  | "cobros:estadoCuentaCita"
  | "ventas:registrar"
  | "ventas:listar"
  | "ventas:detalle"
  | "ventas:porCliente"
  | "ventas:porCobrar"
  | "ventas:frecuentes"
  | "ventas:cancelar"
  | "ventas:subirComprobante"
  | "archivos:subirComprobante"
  | "archivos:elegirComprobante"
  | "archivos:descartarComprobante"
  | "archivos:comprobantesCita"
  | "archivos:vistaPrevia"
  | "archivos:abrirComprobante"
  | "archivos:guardarCopiaComprobante"
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
  | "reportes:resumen"
  | "reportes:finanzas"
  | "reportes:carteraDetalle"
  | "reportes:serviciosDetalle"
  | "reportes:clientesDetalle"
  | "reportes:agenda"
  | "reportes:inventarioDetalle"
  | "reportes:hallazgos"
  | "reportes:establecerEstadoHallazgo"
  | "reportes:exportarCsv";
