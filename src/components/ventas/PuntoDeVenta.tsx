import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Minus, PackageSearch, Plus, Search, ShoppingBag, Trash2, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectBuscable } from "@/components/ui/select-buscable";
import { NumberInput } from "@/components/ui/number-input";
import { MoneyInput } from "@/components/ui/money-input";
import { AlertaError } from "@/components/ui/alerta-error";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ManchaOrganica } from "@/components/ui/decoracion";
import { cn } from "@/lib/utils";
import { formatMoneda, formatearStock } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import {
  LINEA_INICIAL,
  LineasPago,
  evaluarCobro,
  lineasParaEnviar,
  redondear,
  type LineaPagoCaptura,
} from "@/components/cobros/LineasPago";
import {
  DESCUENTO_VACIO,
  DescuentoCampo,
  descuentoParaEnviar,
  errorDescuento,
  montoDescuento,
  type DescuentoBorrador,
} from "@/components/cobros/DescuentoCampo";
import { requiereEvidencia } from "@shared/schemas";
import { invalidarVentas } from "@/components/ventas/invalidar";
import { VentaDetalleModal } from "@/components/ventas/VentaDetalleModal";
import type { ProductoConStock } from "@shared/types";

export interface LineaCarrito {
  productoId: string;
  cantidad: number | null;
  precioUnitario: number | null;
  /**
   * Solo de la pantalla: sube cuando la cantidad cambia por un botón (+, −, tocar el producto), para
   * que el NumberInput (que guarda su propio texto) se resincronice. Teclear no la cambia.
   */
  rev?: number;
}

/** Con qué arranca el carrito: vacío, con una clienta (desde su ficha) o igual a otra venta. */
export interface InicioVenta {
  clienteId?: string;
  nombreReferencia?: string;
  lineas?: LineaCarrito[];
}

/** Búsqueda sin acentos ni mayúsculas ("serum" encuentra "Sérum"). */
function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Vender descuenta piezas enteras (VEN-B5): de 3.7 botes se venden 3. */
function piezasVendibles(p: ProductoConStock): number {
  return Math.max(0, Math.floor(p.stockTotal + 1e-9));
}

/**
 * Punto de venta del módulo Ventas (spec de la venta, §23): catálogo a la izquierda y la venta a la
 * derecha, los dos a lo alto de la ventana con su propio scroll, así la página se ve completa con 5
 * productos o con 1000. Los totales son una vista previa con el mismo cálculo del main; el main los
 * vuelve a calcular y validar.
 */
export function PuntoDeVenta({ inicio, inicioId }: { inicio?: InicioVenta; inicioId: string | null }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const { data: productos = [] } = useQuery({
    queryKey: ["inventarioResumen"],
    queryFn: () => window.api.inventario.resumen(),
  });
  const { data: frecuentes = [] } = useQuery({
    queryKey: ["ventasFrecuentes"],
    queryFn: () => window.api.ventas.frecuentes(),
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => window.api.config.obtener(),
  });

  const [clienteId, setClienteId] = useState("");
  const [nombreReferencia, setNombreReferencia] = useState("");
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [descuento, setDescuento] = useState<DescuentoBorrador>(DESCUENTO_VACIO);
  const [pagos, setPagos] = useState<LineaPagoCaptura[]>(LINEA_INICIAL);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ultima, setUltima] = useState<{ id: string; folio: string } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const pagoRef = useRef<HTMLDivElement>(null);

  // Comprobante elegido antes de registrar: el main lo guarda al terminar (token; nunca la ruta).
  const [seleccion, setSeleccion] = useState<{ token: string; nombre: string } | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = seleccion?.token ?? null;
  useEffect(
    () => () => {
      if (tokenRef.current) void window.api.archivos.descartarComprobante(tokenRef.current);
    },
    [],
  );

  // Un atajo (clienta o "Repetir venta") llega como un `inicio` con su id de navegación. Se aplica
  // una sola vez; si el carrito ya tiene productos, primero se pregunta (VMD-B2).
  const aplicado = useRef<string | null>(null);
  const hayCarrito = useRef(false);
  hayCarrito.current = lineas.length > 0;
  useEffect(() => {
    if (!inicioId || !inicio || aplicado.current === inicioId) return;
    aplicado.current = inicioId;
    const aplicar = () => {
      setClienteId(inicio.clienteId ?? "");
      setNombreReferencia(inicio.nombreReferencia ?? "");
      setLineas(inicio.lineas ?? []);
      setDescuento(DESCUENTO_VACIO);
      setPagos(LINEA_INICIAL);
      setError(null);
      setUltima(null);
    };
    if (!hayCarrito.current) {
      aplicar();
      return;
    }
    void confirm({
      titulo: "¿Reemplazar la venta en curso?",
      mensaje: "Ya hay productos en el carrito. Si continúas, se reemplazan por la nueva venta.",
      confirmarLabel: "Reemplazar",
      cancelarLabel: "Conservar la venta en curso",
    }).then((r) => {
      if (r === "confirmado") aplicar();
    });
  }, [inicioId, inicio, confirm]);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // --- Cálculo en vivo (mismo redondeo que el main) ---
  const validas = lineas.filter((l) => l.productoId && (l.cantidad ?? 0) > 0);
  const totalProductos = redondear(validas.reduce((acc, l) => acc + redondear((l.cantidad ?? 0) * (l.precioUnitario ?? 0)), 0));
  const montoDesc = totalProductos > 0 ? montoDescuento(descuento, totalProductos) : 0;
  const errorDesc = totalProductos > 0 ? errorDescuento(descuento, totalProductos) : null;
  const total = redondear(totalProductos - montoDesc);
  const cobro = evaluarCobro(pagos, total);
  const pagosEnviar = lineasParaEnviar(pagos, total);
  const sinClienta = !clienteId;
  const quedaDebiendo = !sinClienta ? redondear(total - cobro.suma) : 0;
  const piezas = validas.reduce((acc, l) => acc + (l.cantidad ?? 0), 0);

  // Piezas en el carrito por producto, contra las piezas enteras vendibles.
  const enCarrito = new Map<string, number>();
  for (const l of lineas) if (l.productoId) enCarrito.set(l.productoId, (enCarrito.get(l.productoId) ?? 0) + (l.cantidad ?? 0));

  const motivoBloqueo = (() => {
    if (validas.length === 0) return "Agrega un producto del catálogo.";
    if (validas.some((l) => !((l.precioUnitario ?? 0) > 0))) return "Cada producto necesita un precio mayor a $0. Para regalar, usa un descuento de cortesía.";
    if (validas.some((l) => !Number.isInteger(l.cantidad))) return "La cantidad es en piezas enteras.";
    for (const [id, cant] of enCarrito) {
      const p = porId.get(id);
      if (p && cant > piezasVendibles(p)) return `No alcanza ${p.nombre}: hay ${piezasVendibles(p)}.`;
    }
    if (errorDesc) return errorDesc;
    if (cobro.error) return cobro.error;
    if (sinClienta && Math.abs(cobro.suma - total) > 0.005) return "Sin clienta la venta se paga completa: no se vende a crédito.";
    return null;
  })();

  function agregar(p: ProductoConStock) {
    setUltima(null);
    const i = lineas.findIndex((l) => l.productoId === p.id);
    if (i >= 0) {
      if ((lineas[i].cantidad ?? 0) + 1 > piezasVendibles(p)) return;
      setLineas(lineas.map((l, j) => (j === i ? { ...l, cantidad: (l.cantidad ?? 0) + 1, rev: (l.rev ?? 0) + 1 } : l)));
    } else {
      if (piezasVendibles(p) < 1) return;
      setLineas([...lineas, { productoId: p.id, cantidad: 1, precioUnitario: p.precioVenta || null }]);
    }
  }
  /** Una pieza menos; en 1 quita la línea. */
  function restar(productoId: string) {
    const i = lineas.findIndex((l) => l.productoId === productoId);
    if (i < 0) return;
    if ((lineas[i].cantidad ?? 0) <= 1) quitar(i);
    else actualizar(i, { cantidad: (lineas[i].cantidad ?? 1) - 1, rev: (lineas[i].rev ?? 0) + 1 });
  }
  function actualizar(i: number, cambios: Partial<LineaCarrito>) {
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  }
  function quitar(i: number) {
    setLineas((prev) => prev.filter((_, j) => j !== i));
  }

  function vaciar() {
    if (seleccion) void window.api.archivos.descartarComprobante(seleccion.token);
    setSeleccion(null);
    setClienteId("");
    setNombreReferencia("");
    setLineas([]);
    setDescuento(DESCUENTO_VACIO);
    setPagos(LINEA_INICIAL);
    setObservaciones("");
    setError(null);
  }

  async function elegirComprobante() {
    try {
      const elegido = await window.api.archivos.elegirComprobante();
      if (elegido) setSeleccion(elegido);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo elegir el comprobante."));
    }
  }
  function quitarComprobante() {
    if (seleccion) void window.api.archivos.descartarComprobante(seleccion.token);
    setSeleccion(null);
  }

  const registrar = useMutation({
    mutationFn: (sinComprobanteAceptado: boolean) =>
      window.api.ventas.registrar({
        clienteId: clienteId || null,
        nombreReferencia: sinClienta ? nombreReferencia.trim() || null : null,
        lineas: validas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad!, precioUnitario: l.precioUnitario! })),
        descuento: totalProductos > 0 ? (descuentoParaEnviar(descuento, "productos") ?? undefined) : undefined,
        pagos: pagosEnviar,
        observaciones: observaciones.trim() || undefined,
        sinComprobanteAceptado,
        // VEN-B6: si al final todo es efectivo, no se guarda un comprobante que no liga a ningún pago.
        comprobanteToken: requiereEvidencia(pagosEnviar) ? seleccion?.token : undefined,
      }),
    // Registrada = el carrito se vacía siempre (aunque el comprobante haya fallado): así no se registra dos veces.
    onSuccess: (r) => {
      tokenRef.current = null;
      setSeleccion(null);
      invalidarVentas(queryClient);
      toast.success(`Venta ${r.folio} registrada.`);
      if (r.aviso) toast.info(r.aviso);
      vaciar();
      setUltima({ id: r.id, folio: r.folio });
    },
    onError: (e) => setError(mensajeDeError(e, "No se pudo registrar la venta.")),
  });

  async function alCobrar() {
    setError(null);
    const sinEvidencia = requiereEvidencia(pagosEnviar) && !seleccion;
    if (sinEvidencia) {
      const r = await confirm({
        titulo: "¿Continuar sin comprobante?",
        mensaje: "Este cobro no es en efectivo y no tiene comprobante. Si continúas, no tendrás evidencia de este pago.",
        confirmarLabel: "Continuar sin comprobante",
        cancelarLabel: "Volver",
      });
      if (r !== "confirmado") return;
    }
    registrar.mutate(sinEvidencia);
  }

  // El comprobante se pide hasta que hay un método elegido que no es efectivo (antes de elegir, no).
  const hayPagoSinEfectivo = requiereEvidencia(pagosEnviar.filter((p) => p.metodoPago.trim()));
  const textoBoton =
    quedaDebiendo > 0.005 ? `Registrar · queda debiendo ${formatMoneda(quedaDebiendo)}` : total > 0.005 ? `Cobrar ${formatMoneda(total)}` : "Registrar venta";

  return (
    <div className="grid min-h-[600px] flex-1 grid-rows-[minmax(0,1fr)] gap-6 p-8 lg:grid-cols-[minmax(0,1fr)_440px]">
      {/* ---------- Catálogo ---------- */}
      <Catalogo productos={productos} frecuentes={frecuentes} enCarrito={enCarrito} onAgregar={agregar} onRestar={restar} />

      {/* ---------- La venta: encabezado, cuerpo con scroll y total fijo abajo ---------- */}
      <Card className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-beige-200 px-5 py-4">
          {ultima && (
            <div className="aparecer-suave flex items-center gap-2 rounded-xl bg-success-500/10 px-3 py-2 text-sm text-success-500">
              <CheckCircle2 size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">Venta {ultima.folio} registrada.</span>
              <button type="button" className="shrink-0 text-xs font-medium underline" onClick={() => setAbierta(ultima.id)}>
                Ver venta
              </button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
              <ShoppingBag size={18} className="text-jacaranda-600" /> Venta
              {piezas > 0 && (
                <span className="rounded-full bg-jacaranda-100 px-2 py-0.5 font-[family-name:var(--font-ui)] text-xs font-semibold text-jacaranda-700">
                  {piezas} {piezas === 1 ? "pieza" : "piezas"}
                </span>
              )}
            </h2>
            {lineas.length > 0 && (
              <button type="button" className="text-xs text-ink-400 underline transition-colors hover:text-danger-500" onClick={vaciar}>
                Vaciar
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {/* 1. ¿A quién? */}
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Clienta</label>
            <SelectBuscable
              value={clienteId}
              onChange={(v) => setClienteId(v)}
              placeholder="Público general (sin clienta)"
              aria-label="Clienta de la venta"
              opciones={clientes
                .filter((c) => c.activo || c.id === clienteId)
                .map((c) => ({ value: c.id, label: c.nombreCompleto, detalle: c.codigoCliente }))}
            />
            {clienteId ? (
              <button type="button" className="mt-1 text-xs text-ink-500 underline hover:text-ink-700" onClick={() => setClienteId("")}>
                Vender a público general
              </button>
            ) : (
              <div className="mt-2">
                <Input
                  value={nombreReferencia}
                  maxLength={80}
                  onChange={(e) => setNombreReferencia(e.target.value)}
                  placeholder="Nombre de referencia (opcional)"
                  aria-label="Nombre de referencia"
                />
                <p className="mt-1 text-xs text-ink-500">
                  Sin clienta la venta se paga completa. El nombre solo la identifica; no da de alta a nadie.
                </p>
              </div>
            )}
          </div>

          {/* 2. Carrito */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Productos</h3>
            {lineas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-beige-300 p-4 text-center text-xs text-ink-500">
                Agrega productos desde el catálogo de la izquierda.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-beige-200 rounded-xl border border-beige-200">
                {lineas.map((l, i) => {
                  const p = porId.get(l.productoId);
                  const maximo = p ? piezasVendibles(p) : Infinity;
                  const excede = (enCarrito.get(l.productoId) ?? 0) > maximo;
                  const importe = redondear((l.cantidad ?? 0) * (l.precioUnitario ?? 0));
                  return (
                    <li key={l.productoId} className="flex flex-col gap-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{p?.nombre ?? "Producto"}</p>
                          {excede && <p className="text-xs text-danger-500">No alcanza: hay {maximo}.</p>}
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg p-1 text-ink-400 transition-colors hover:bg-beige-100 hover:text-danger-500"
                          onClick={() => quitar(i)}
                          title="Quitar"
                          aria-label={`Quitar ${p?.nombre ?? "producto"}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-xl border border-beige-300 bg-beige-50">
                          <button
                            type="button"
                            className="flex h-9 w-8 items-center justify-center text-ink-500 transition-colors hover:text-jacaranda-700 disabled:opacity-40"
                            disabled={(l.cantidad ?? 0) <= 1}
                            onClick={() => actualizar(i, { cantidad: Math.max(1, (l.cantidad ?? 1) - 1), rev: (l.rev ?? 0) + 1 })}
                            aria-label="Una pieza menos"
                          >
                            <Minus size={14} />
                          </button>
                          <NumberInput
                            key={l.rev ?? 0}
                            className="h-9 w-12 border-0 bg-transparent px-0 text-center"
                            allowNull
                            min={0}
                            value={l.cantidad}
                            onValueChange={(v) => actualizar(i, { cantidad: v })}
                            aria-label="Cantidad"
                          />
                          <button
                            type="button"
                            className="flex h-9 w-8 items-center justify-center text-ink-500 transition-colors hover:text-jacaranda-700 disabled:opacity-40"
                            disabled={(enCarrito.get(l.productoId) ?? 0) + 1 > maximo}
                            onClick={() => actualizar(i, { cantidad: (l.cantidad ?? 0) + 1, rev: (l.rev ?? 0) + 1 })}
                            aria-label="Una pieza más"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <div className="w-28" title="Precio unitario">
                          <MoneyInput
                            allowNull
                            placeholder="Precio c/u"
                            value={l.precioUnitario}
                            onValueChange={(v) => actualizar(i, { precioUnitario: v })}
                          />
                        </div>
                        <span className="metric-value ml-auto text-sm text-ink-900">{formatMoneda(importe)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 3. Descuento */}
          {totalProductos > 0 && (
            <DescuentoCampo etiqueta="Descuento" base={totalProductos} value={descuento} onChange={setDescuento} />
          )}

          {/* 4. Pago */}
          {totalProductos > 0 && (
            <div ref={pagoRef} className="scroll-mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Pago</h3>
              {total > 0.005 ? (
                <LineasPago lineas={pagos} onChange={setPagos} metodos={config?.metodosPago ?? []} porCobrar={total} />
              ) : (
                <p className="text-xs text-ink-500">Total en $0: no hay nada que cobrar.</p>
              )}
            </div>
          )}

          {hayPagoSinEfectivo && (
            <div className="aparecer-suave flex flex-col gap-2 rounded-xl bg-beige-100 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Comprobante</p>
              {seleccion ? (
                <div className="flex items-center gap-2 text-sm text-ink-900">
                  <FileText size={15} className="shrink-0 text-jacaranda-600" />
                  <span className="min-w-0 flex-1 truncate">{seleccion.nombre}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={quitarComprobante}>
                    <X size={14} /> Quitar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="secondary" size="sm" onClick={elegirComprobante}>
                    <Upload size={14} /> Elegir comprobante
                  </Button>
                  <span className="text-xs text-ink-500">Foto del voucher o de la transferencia.</span>
                </div>
              )}
            </div>
          )}

          {lineas.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Observaciones</label>
              <Input
                value={observaciones}
                maxLength={500}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Opcional (sin datos de salud)"
              />
            </div>
          )}
        </div>

        {/* Total siempre visible: tipografía de interfaz, tabular y grande (nunca la serif de títulos). */}
        <div className="flex flex-col gap-3 border-t border-beige-200 bg-beige-50 px-5 py-4">
          {montoDesc > 0 && (
            <div className="flex flex-col gap-0.5 text-sm">
              <div className="flex justify-between text-ink-500">
                <span>Productos</span>
                <span className="tabular-nums">{formatMoneda(totalProductos)}</span>
              </div>
              <div className="flex justify-between text-success-500">
                <span>Descuento</span>
                <span className="tabular-nums">− {formatMoneda(montoDesc)}</span>
              </div>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink-500">Total</span>
            <span className="metric-value text-3xl tracking-tight text-ink-900">{formatMoneda(total)}</span>
          </div>
          {error && <AlertaError mensaje={error} />}
          {/* Si lo que falta es el pago, el aviso lleva hasta él (puede quedar abajo del scroll). */}
          {!error && motivoBloqueo && lineas.length > 0 &&
            (motivoBloqueo === cobro.error ? (
              <button
                type="button"
                className="text-left text-xs text-jacaranda-700 underline transition-colors hover:text-jacaranda-800"
                onClick={() => pagoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                {motivoBloqueo} Ir al pago
              </button>
            ) : (
              <p className="text-xs text-ink-500">{motivoBloqueo}</p>
            ))}
          <Button size="lg" className="w-full" disabled={!!motivoBloqueo || registrar.isPending} onClick={alCobrar}>
            <ShoppingBag size={18} /> {textoBoton}
          </Button>
        </div>
      </Card>

      <VentaDetalleModal ventaId={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}

const MAX_FILAS = 100;
type Orden = "frecuentes" | "nombre";

/**
 * Catálogo como lista de renglones a todo lo ancho (no rejilla): con pocos productos la lista se ve
 * completa y con muchos se recorre con búsqueda, filtro por tipo y teclado (↑ ↓ Enter). Muestra los
 * productos con precio de venta; los insumos sin precio quedan ocultos salvo que se pidan o se
 * busquen.
 */
function Catalogo({
  productos,
  frecuentes,
  enCarrito,
  onAgregar,
  onRestar,
}: {
  productos: ProductoConStock[];
  frecuentes: { productoId: string; piezas: number }[];
  enCarrito: Map<string, number>;
  onAgregar: (p: ProductoConStock) => void;
  onRestar: (productoId: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden>("frecuentes");
  const [conInsumos, setConInsumos] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  const rango = useMemo(() => new Map(frecuentes.map((f, i) => [f.productoId, i])), [frecuentes]);
  const activos = productos.filter((p) => p.activo);
  const aLaVenta = activos.filter((p) => (p.precioVenta ?? 0) > 0);
  const insumos = activos.length - aLaVenta.length;
  const termino = normalizar(busqueda.trim());

  const base = termino || conInsumos ? activos : aLaVenta;
  const tipos = [...new Set(base.map((p) => p.tipoProductoNombre).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, "es"));
  const filtrados = base
    .filter((p) => !termino || normalizar(`${p.nombre} ${p.sku ?? ""} ${p.linea ?? ""}`).includes(termino))
    .filter((p) => !tipo || p.tipoProductoNombre === tipo)
    .sort((a, b) => {
      // Lo agotado al final; luego por más vendidos o por nombre.
      const agotadoA = piezasVendibles(a) < 1 ? 1 : 0;
      const agotadoB = piezasVendibles(b) < 1 ? 1 : 0;
      if (agotadoA !== agotadoB) return agotadoA - agotadoB;
      if (orden === "frecuentes") {
        const ra = rango.get(a.id) ?? Infinity;
        const rb = rango.get(b.id) ?? Infinity;
        if (ra !== rb) return ra - rb;
      }
      return a.nombre.localeCompare(b.nombre, "es");
    });
  const visibles = filtrados.slice(0, MAX_FILAS);
  const indice = Math.min(resaltado, Math.max(0, visibles.length - 1));

  // El renglón resaltado con el teclado siempre queda a la vista.
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-fila="${indice}"]`)?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado(Math.min(indice + 1, visibles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado(Math.max(indice - 1, 0));
    } else if (e.key === "Enter" && visibles[indice]) {
      e.preventDefault();
      onAgregar(visibles[indice]);
    } else if (e.key === "Escape") {
      setBusqueda("");
      setResaltado(0);
    }
  }

  return (
    <Card className="relative isolate flex min-h-0 flex-col overflow-hidden p-0">
      {/* Barra: búsqueda + orden */}
      <div className="flex flex-wrap items-center gap-3 border-b border-beige-200 px-5 py-4">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            autoFocus
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setResaltado(0);
            }}
            onKeyDown={alTeclear}
            placeholder="Buscar producto por nombre, línea o SKU"
            aria-label="Buscar producto"
            className="pl-9"
          />
        </div>
        <div className="flex rounded-xl border border-beige-300 bg-beige-100 p-0.5 text-xs font-medium" role="group" aria-label="Orden">
          {(
            [
              ["frecuentes", "Más vendidos"],
              ["nombre", "A–Z"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setOrden(valor)}
              aria-pressed={orden === valor}
              className={cn(
                "rounded-lg px-3 py-1.5 transition-colors",
                orden === valor ? "bg-beige-50 text-jacaranda-700 shadow-sm" : "text-ink-500 hover:text-ink-900",
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Filtro por tipo, solo si hay más de uno */}
      {tipos.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-beige-200 px-5 py-3" role="group" aria-label="Tipo de producto">
          {[null, ...tipos].map((t) => (
            <button
              key={t ?? "todos"}
              type="button"
              onClick={() => {
                setTipo(t);
                setResaltado(0);
              }}
              aria-pressed={tipo === t}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                tipo === t
                  ? "border-jacaranda-500 bg-jacaranda-50 font-medium text-jacaranda-700"
                  : "border-beige-300 bg-beige-50 text-ink-700 hover:bg-beige-100",
              )}
            >
              {t ?? "Todos"}
            </button>
          ))}
        </div>
      )}

      {/* Renglones */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <ManchaOrganica
          className="pointer-events-none absolute bottom-0 right-0 -z-10 select-none"
          width={340}
          opacity={0.5}
          variante={1}
        />
        {visibles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-jacaranda-50 text-jacaranda-500">
              <PackageSearch size={22} />
            </span>
            <p className="text-sm font-medium text-ink-900">
              {termino || tipo ? "Ningún producto coincide" : "Todavía no hay productos con precio de venta"}
            </p>
            <p className="max-w-sm text-xs text-ink-500">
              {termino || tipo
                ? "Prueba con otra palabra o quita el filtro de tipo."
                : "Ponle precio de venta a un producto en Inventario y aparecerá aquí."}
            </p>
          </div>
        ) : (
          <ul ref={listaRef} role="listbox" aria-label="Productos" className="aparecer-suave">
            {visibles.map((p, i) => (
              <FilaProducto
                key={p.id}
                producto={p}
                indice={i}
                resaltado={i === indice}
                frecuente={orden === "frecuentes" && (rango.get(p.id) ?? Infinity) < 3}
                llevo={enCarrito.get(p.id) ?? 0}
                onAgregar={() => onAgregar(p)}
                onRestar={() => onRestar(p.id)}
                onResaltar={() => setResaltado(i)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Pie: conteo e insumos */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-beige-200 bg-beige-50 px-5 py-2.5 text-xs text-ink-500">
        <span>
          {filtrados.length > MAX_FILAS
            ? `Mostrando ${MAX_FILAS} de ${filtrados.length}: escribe para encontrar el resto`
            : `${filtrados.length} ${filtrados.length === 1 ? "producto" : "productos"}${termino || tipo ? " encontrados" : conInsumos ? "" : " a la venta"}`}
        </span>
        {insumos > 0 && !termino && (
          <button type="button" className="underline transition-colors hover:text-ink-900" onClick={() => setConInsumos(!conInsumos)}>
            {conInsumos ? "Ocultar insumos sin precio" : `Mostrar ${insumos} ${insumos === 1 ? "insumo" : "insumos"} sin precio de venta`}
          </button>
        )}
      </div>
    </Card>
  );
}

/** Iniciales para la ficha del producto: "Bloqueador solar FPS 50" → "BS". */
function iniciales(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter((w) => /^[\p{L}]/u.test(w));
  return (palabras[0]?.[0] ?? "?").toUpperCase() + (palabras[1]?.[0] ?? "").toUpperCase();
}

function FilaProducto({
  producto: p,
  indice,
  resaltado,
  frecuente,
  llevo,
  onAgregar,
  onRestar,
  onResaltar,
}: {
  producto: ProductoConStock;
  indice: number;
  resaltado: boolean;
  frecuente: boolean;
  llevo: number;
  onAgregar: () => void;
  onRestar: () => void;
  onResaltar: () => void;
}) {
  const disponibles = piezasVendibles(p);
  const agotado = disponibles < 1;
  const tope = llevo >= disponibles;
  const sinPrecio = !((p.precioVenta ?? 0) > 0);
  const contenido = p.contenidoCantidad && p.contenidoUnidad ? `${p.contenidoCantidad} ${p.contenidoUnidad}` : null;
  const detalle = [p.presentacion && contenido ? `${p.presentacion} de ${contenido}` : (p.presentacion ?? contenido), p.tipoProductoNombre]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      data-fila={indice}
      role="option"
      aria-selected={resaltado}
      aria-disabled={agotado}
      onMouseEnter={onResaltar}
      onClick={() => !agotado && !tope && onAgregar()}
      className={cn(
        "group flex items-center gap-4 border-b border-beige-200/70 bg-beige-50/80 px-5 py-3 transition-colors",
        agotado ? "cursor-not-allowed opacity-55" : "cursor-pointer",
        resaltado && !agotado && "bg-jacaranda-50/60",
        llevo > 0 && "bg-jacaranda-50",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition-colors",
          llevo > 0 ? "bg-jacaranda-600 text-beige-50" : "bg-jacaranda-100 text-jacaranda-700",
        )}
        aria-hidden
      >
        {iniciales(p.nombre)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <span className="truncate">{p.nombre}</span>
          {frecuente && (
            <span className="shrink-0 rounded-full bg-jacaranda-100 px-2 py-0.5 text-[11px] font-medium text-jacaranda-700">Frecuente</span>
          )}
        </p>
        <p className="truncate text-xs text-ink-500">{detalle || "—"}</p>
      </div>

      <span
        className={cn(
          "hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline",
          agotado ? "bg-danger-500/10 text-danger-500" : disponibles <= 3 ? "bg-warning-500/10 text-warning-500" : "bg-beige-200 text-ink-700",
        )}
        title={formatearStock(p.stockTotal, p.presentacion, p.contenidoCantidad, p.contenidoUnidad)}
      >
        {agotado ? "Agotado" : disponibles <= 3 ? `Últimas ${disponibles}` : `${disponibles} disponibles`}
      </span>

      <span className={cn("w-24 shrink-0 text-right", sinPrecio ? "text-xs text-ink-400" : "metric-value text-base text-ink-900")}>
        {sinPrecio ? "Sin precio" : formatMoneda(p.precioVenta)}
      </span>

      <div className="flex w-[118px] shrink-0 justify-end" onClick={(e) => e.stopPropagation()}>
        {llevo > 0 ? (
          <div className="flex items-center rounded-xl bg-jacaranda-600 text-beige-50 shadow-sm">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-l-xl transition-colors hover:bg-jacaranda-700"
              onClick={onRestar}
              aria-label={`Una pieza menos de ${p.nombre}`}
            >
              <Minus size={15} />
            </button>
            <span className="metric-value w-8 text-center text-sm">{llevo}</span>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-r-xl transition-colors hover:bg-jacaranda-700 disabled:opacity-40"
              disabled={tope}
              onClick={onAgregar}
              aria-label={`Una pieza más de ${p.nombre}`}
            >
              <Plus size={15} />
            </button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" disabled={agotado} onClick={onAgregar}>
            <Plus size={14} /> Agregar
          </Button>
        )}
      </div>
    </li>
  );
}
