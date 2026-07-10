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
} from "./schemas";
import type {
  Proveedor,
  TipoProducto,
  Producto,
  ProductoConStock,
  Lote,
  MovimientoRow,
  Cliente,
  ClienteExpediente,
  ServicioCatalogo,
  CitaRow,
  ServicioRealizado,
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
} from "./types";

export interface IpcApi {
  auth: {
    tienePin(): Promise<boolean>;
    crearPin(pin: string): Promise<void>;
    verificarPin(pin: string): Promise<boolean>;
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
  };
  proveedores: {
    listar(): Promise<Proveedor[]>;
    crear(input: ProveedorInput): Promise<Proveedor>;
    actualizar(id: string, input: ProveedorInput): Promise<Proveedor>;
  };
  tiposProducto: {
    listar(): Promise<TipoProducto[]>;
    crear(input: TipoProductoInput): Promise<TipoProducto>;
    actualizar(id: string, input: TipoProductoInput): Promise<TipoProducto>;
  };
  productos: {
    listar(): Promise<Producto[]>;
    crear(input: ProductoInput): Promise<Producto>;
    actualizar(id: string, input: ProductoInput): Promise<Producto>;
  };
  inventario: {
    resumen(): Promise<ProductoConStock[]>;
    lotesPorProducto(productoId: string): Promise<Lote[]>;
    proximosACaducar(): Promise<Lote[]>;
    caducados(): Promise<Lote[]>;
    registrarEntrada(input: EntradaInput): Promise<unknown>;
    registrarSalida(input: SalidaInput): Promise<unknown>;
    movimientos(filtro: MovimientosFiltro): Promise<MovimientoRow[]>;
  };
  clientes: {
    listar(): Promise<Cliente[]>;
    crear(input: ClienteInput): Promise<Cliente>;
    actualizar(id: string, input: ClienteInput): Promise<Cliente>;
    obtenerExpediente(id: string): Promise<ClienteExpediente | null>;
  };
  serviciosCatalogo: {
    listar(): Promise<ServicioCatalogo[]>;
    crear(input: ServicioCatalogoInput): Promise<ServicioCatalogo>;
    actualizar(id: string, input: ServicioCatalogoInput): Promise<ServicioCatalogo>;
    listarReceta(servicioCatalogoId: string): Promise<RecetaItem[]>;
    guardarReceta(input: GuardarRecetaInput): Promise<RecetaItem[]>;
  };
  citas: {
    listar(filtro: CitasFiltro): Promise<CitaRow[]>;
    crear(input: CitaInput): Promise<CitaRow>;
    actualizar(id: string, input: CitaInput): Promise<CitaRow>;
    cambiarEstado(id: string, estado: string): Promise<CitaRow>;
    mantenimientosNoProgramados(): Promise<MantenimientoPendiente[]>;
  };
  serviciosRealizados: {
    abrirCierre(citaId: string): Promise<ServicioRealizado>;
    cerrarCita(input: CierreCitaInput): Promise<ServicioRealizado>;
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
  bitacora: {
    listar(filtro: BitacoraFiltro): Promise<BitacoraRow[]>;
  };
  respaldos: {
    crear(): Promise<RespaldoRow>;
    listar(): Promise<RespaldoRow[]>;
    abrirCarpeta(): Promise<void>;
    restaurar(id: string, pin: string): Promise<void>;
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
  | "config:obtener"
  | "config:actualizar"
  | "carpetas:elegirCarpetaRaiz"
  | "carpetas:abrirCarpeta"
  | "app:version"
  | "proveedores:listar"
  | "proveedores:crear"
  | "proveedores:actualizar"
  | "tiposProducto:listar"
  | "tiposProducto:crear"
  | "tiposProducto:actualizar"
  | "productos:listar"
  | "productos:crear"
  | "productos:actualizar"
  | "inventario:resumen"
  | "inventario:lotesPorProducto"
  | "inventario:proximosACaducar"
  | "inventario:caducados"
  | "inventario:registrarEntrada"
  | "inventario:registrarSalida"
  | "inventario:movimientos"
  | "clientes:listar"
  | "clientes:crear"
  | "clientes:actualizar"
  | "clientes:obtenerExpediente"
  | "serviciosCatalogo:listar"
  | "serviciosCatalogo:crear"
  | "serviciosCatalogo:actualizar"
  | "serviciosCatalogo:listarReceta"
  | "serviciosCatalogo:guardarReceta"
  | "citas:listar"
  | "citas:crear"
  | "citas:actualizar"
  | "citas:cambiarEstado"
  | "citas:mantenimientosNoProgramados"
  | "serviciosRealizados:abrirCierre"
  | "serviciosRealizados:cerrarCita"
  | "archivos:subirComprobante"
  | "archivos:listar"
  | "corte:resumenPendiente"
  | "corte:registrar"
  | "corte:historial"
  | "corte:resumenDesde"
  | "bitacora:listar"
  | "respaldos:crear"
  | "respaldos:listar"
  | "respaldos:abrirCarpeta"
  | "respaldos:restaurar"
  | "reportes:cobranza"
  | "reportes:inventario"
  | "reportes:servicios"
  | "reportes:clientes"
  | "reportes:exportarCsv";
