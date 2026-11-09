import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Minus, Plus, Search, ShoppingBag, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectBuscable } from "@/components/ui/select-buscable";
import { NumberInput } from "@/components/ui/number-input";
import { MoneyInput } from "@/components/ui/money-input";
import { AlertaError } from "@/components/ui/alerta-error";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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
   * Solo de la pantalla: sube cuando la cantidad cambia por un botón (+, −, tocar la tarjeta), para
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

/**
 * Punto de venta del módulo Ventas (spec de la venta, §23): el catálogo a la izquierda (frecuentes y
 * búsqueda; un toque agrega una pieza) y el carrito con el cobro a la derecha, en la misma página.
 * Los totales son una vista previa con el mismo cálculo del main; el main los vuelve a calcular.
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

  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [nombreReferencia, setNombreReferencia] = useState("");
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [descuento, setDescuento] = useState<DescuentoBorrador>(DESCUENTO_VACIO);
  const [pagos, setPagos] = useState<LineaPagoCaptura[]>(LINEA_INICIAL);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ultima, setUltima] = useState<{ id: string; folio: string } | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

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

  // Piezas en el carrito por producto, contra el stock usable.
  const enCarrito = new Map<string, number>();
  for (const l of lineas) if (l.productoId) enCarrito.set(l.productoId, (enCarrito.get(l.productoId) ?? 0) + (l.cantidad ?? 0));

  const motivoBloqueo = (() => {
    if (validas.length === 0) return "Toca un producto para agregarlo a la venta.";
    if (validas.some((l) => !((l.precioUnitario ?? 0) > 0))) return "Cada producto necesita un precio mayor a $0. Para regalar, usa un descuento de cortesía.";
    if (validas.some((l) => !Number.isInteger(l.cantidad))) return "La cantidad es en piezas enteras.";
    for (const [id, cant] of enCarrito) {
      const p = porId.get(id);
      if (p && cant > p.stockTotal) return `No alcanza el stock de ${p.nombre}: hay ${p.stockTotal}.`;
    }
    if (errorDesc) return errorDesc;
    if (cobro.error) return cobro.error;
    if (sinClienta && Math.abs(cobro.suma - total) > 0.005) return "Sin clienta la venta se paga completa: no se vende a crédito.";
    return null;
  })();

  // --- Catálogo ---
  const vendibles = productos.filter((p) => p.activo);
  const listaFrecuentes = frecuentes
    .map((f) => porId.get(f.productoId))
    .filter((p): p is ProductoConStock => !!p && p.activo && p.stockTotal > 0);
  const termino = normalizar(busqueda.trim());
  const listaCatalogo = (termino
    ? vendibles.filter((p) => normalizar(p.nombre).includes(termino))
    : vendibles.filter((p) => p.stockTotal > 0)
  ).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  function agregar(p: ProductoConStock) {
    setUltima(null);
    const i = lineas.findIndex((l) => l.productoId === p.id);
    if (i >= 0) {
      setLineas(lineas.map((l, j) => (j === i ? { ...l, cantidad: (l.cantidad ?? 0) + 1, rev: (l.rev ?? 0) + 1 } : l)));
    } else {
      setLineas([...lineas, { productoId: p.id, cantidad: 1, precioUnitario: p.precioVenta || null }]);
    }
  }
  function actualizar(i: number, cambios: Partial<LineaCarrito>) {
    setLineas(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  }
  function quitar(i: number) {
    setLineas(lineas.filter((_, j) => j !== i));
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

  const hayPagoSinEfectivo = requiereEvidencia(pagosEnviar);
  const textoBoton =
    quedaDebiendo > 0.005 ? `Registrar · queda debiendo ${formatMoneda(quedaDebiendo)}` : total > 0.005 ? `Cobrar ${formatMoneda(total)}` : "Registrar venta";

  return (
    <div className="grid gap-6 p-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* ---------- Catálogo ---------- */}
      <div className="flex min-w-0 flex-col gap-5">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto"
            aria-label="Buscar producto"
            className="pl-9"
          />
        </div>

        {!termino && listaFrecuentes.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
              <Sparkles size={13} className="text-jacaranda-500" /> Frecuentes
            </h3>
            <RejillaProductos productos={listaFrecuentes} enCarrito={enCarrito} onAgregar={agregar} destacada />
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {termino ? `Resultados (${listaCatalogo.length})` : "Todos los productos"}
          </h3>
          {listaCatalogo.length === 0 ? (
            <p className="rounded-xl border border-dashed border-beige-300 p-6 text-center text-sm text-ink-500">
              {termino ? "Ningún producto coincide con la búsqueda." : "No hay productos con existencia para vender."}
            </p>
          ) : (
            <RejillaProductos productos={listaCatalogo} enCarrito={enCarrito} onAgregar={agregar} />
          )}
        </section>
      </div>

      {/* ---------- Carrito y cobro ---------- */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card className="flex flex-col gap-5 p-5">
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
            </h2>
            {lineas.length > 0 && (
              <button type="button" className="text-xs text-ink-400 underline hover:text-danger-500" onClick={vaciar}>
                Vaciar
              </button>
            )}
          </div>

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
                Toca un producto del catálogo para agregarlo.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-beige-200 rounded-xl border border-beige-200">
                {lineas.map((l, i) => {
                  const p = porId.get(l.productoId);
                  const excede = p && (enCarrito.get(p.id) ?? 0) > p.stockTotal;
                  const importe = redondear((l.cantidad ?? 0) * (l.precioUnitario ?? 0));
                  return (
                    <li key={l.productoId} className="flex flex-col gap-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{p?.nombre ?? "Producto"}</p>
                          {p && (
                            <p className={cn("text-xs", excede ? "text-danger-500" : "text-ink-500")}>
                              {excede ? "No alcanza: hay " : "Disponible: "}
                              {formatearStock(p.stockTotal, p.presentacion, p.contenidoCantidad, p.contenidoUnidad)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg p-1 text-ink-400 hover:bg-beige-100 hover:text-danger-500"
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
                            className="flex h-9 w-8 items-center justify-center text-ink-500 hover:text-jacaranda-700 disabled:opacity-40"
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
                            className="flex h-9 w-8 items-center justify-center text-ink-500 hover:text-jacaranda-700 disabled:opacity-40"
                            disabled={!!p && (enCarrito.get(p.id) ?? 0) >= p.stockTotal}
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
                        <span className="ml-auto text-sm font-semibold tabular-nums text-ink-900">{formatMoneda(importe)}</span>
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

          {/* 4. Total y pago */}
          {totalProductos > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 rounded-xl bg-beige-100 p-3 text-sm">
                <div className="flex justify-between text-ink-700">
                  <span>Productos</span>
                  <span className="tabular-nums">{formatMoneda(totalProductos)}</span>
                </div>
                {montoDesc > 0 && (
                  <div className="flex justify-between text-success-500">
                    <span>Descuento</span>
                    <span className="tabular-nums">− {formatMoneda(montoDesc)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-beige-300 pt-1 font-semibold text-ink-900">
                  <span>Total</span>
                  <span className="font-display text-xl tabular-nums">{formatMoneda(total)}</span>
                </div>
              </div>
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

          {error && <AlertaError mensaje={error} />}
          {!error && motivoBloqueo && <p className="text-xs text-ink-500">{motivoBloqueo}</p>}

          <Button size="lg" className="w-full" disabled={!!motivoBloqueo || registrar.isPending} onClick={alCobrar}>
            <ShoppingBag size={18} /> {textoBoton}
          </Button>
        </Card>
      </div>

      <VentaDetalleModal ventaId={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}

/** Tarjetas de producto: un toque agrega una pieza. Se apagan cuando el carrito ya tiene todo el stock. */
function RejillaProductos({
  productos,
  enCarrito,
  onAgregar,
  destacada = false,
}: {
  productos: ProductoConStock[];
  enCarrito: Map<string, number>;
  onAgregar: (p: ProductoConStock) => void;
  destacada?: boolean;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
      {productos.map((p) => {
        const llevo = enCarrito.get(p.id) ?? 0;
        const agotado = llevo >= p.stockTotal;
        return (
          <button
            key={p.id}
            type="button"
            disabled={agotado}
            onClick={() => onAgregar(p)}
            className={cn(
              "relative flex min-h-[92px] flex-col justify-between gap-2 rounded-2xl border p-3 text-left transition-all",
              "hover:-translate-y-0.5 hover:shadow-md hover:shadow-jacaranda-700/10 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
              llevo > 0
                ? "border-jacaranda-400 bg-jacaranda-50"
                : destacada
                  ? "border-jacaranda-200 bg-beige-50 hover:border-jacaranda-400"
                  : "border-beige-300 bg-beige-50 hover:border-jacaranda-300",
            )}
          >
            {llevo > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-jacaranda-600 px-1.5 text-xs font-bold text-beige-50 shadow-sm">
                {llevo}
              </span>
            )}
            <span className="line-clamp-2 text-sm font-medium leading-snug text-ink-900">{p.nombre}</span>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums text-jacaranda-700">
                {p.precioVenta ? formatMoneda(p.precioVenta) : "Sin precio"}
              </span>
              <span className={cn("text-xs", p.stockTotal === 0 ? "text-danger-500" : "text-ink-500")}>
                {p.stockTotal === 0 ? "Sin existencia" : `Quedan ${p.stockTotal}`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
