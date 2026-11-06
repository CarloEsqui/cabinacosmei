import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, ShoppingBag, Trash2, Upload, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectBuscable } from "@/components/ui/select-buscable";
import { NumberInput } from "@/components/ui/number-input";
import { MoneyInput } from "@/components/ui/money-input";
import { AlertaError } from "@/components/ui/alerta-error";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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

interface Linea {
  productoId: string;
  cantidad: number | null;
  precioUnitario: number | null;
}
const LINEA_VACIA: Linea = { productoId: "", cantidad: 1, precioUnitario: null };

/**
 * "Vender producto" (spec de la venta de mostrador, §8 y §12): clienta opcional, productos con
 * precio editable, descuento, pagos y comprobante, en un solo paso. Los totales de aquí son una
 * vista previa con el mismo cálculo del main; el main los vuelve a calcular y validar.
 */
export function VenderProductoModal({
  open,
  onClose,
  clienteIdInicial,
}: {
  open: boolean;
  onClose: () => void;
  /** Desde la ficha de una clienta: la venta ya trae a la clienta elegida. */
  clienteIdInicial?: string;
}) {
  if (!open) return null;
  return <Formulario onClose={onClose} clienteIdInicial={clienteIdInicial} />;
}

function Formulario({ onClose, clienteIdInicial }: { onClose: () => void; clienteIdInicial?: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const { data: productos = [] } = useQuery({
    queryKey: ["inventarioResumen"],
    queryFn: () => window.api.inventario.resumen(),
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => window.api.clientes.listar(),
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => window.api.config.obtener(),
  });

  const [clienteId, setClienteId] = useState(clienteIdInicial ?? "");
  const [nombreReferencia, setNombreReferencia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([LINEA_VACIA]);
  const [descuento, setDescuento] = useState<DescuentoBorrador>(DESCUENTO_VACIO);
  const [pagos, setPagos] = useState<LineaPagoCaptura[]>(LINEA_INICIAL);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  // --- Cálculo en vivo (mismo redondeo que el main) ---
  const validas = lineas.filter((l) => l.productoId && (l.cantidad ?? 0) > 0);
  const totalProductos = redondear(validas.reduce((acc, l) => acc + redondear((l.cantidad ?? 0) * (l.precioUnitario ?? 0)), 0));
  const montoDesc = totalProductos > 0 ? montoDescuento(descuento, totalProductos) : 0;
  const errorDesc = totalProductos > 0 ? errorDescuento(descuento, totalProductos) : null;
  const total = redondear(totalProductos - montoDesc);
  const cobro = evaluarCobro(pagos, total);
  const pagosEnviar = lineasParaEnviar(pagos, total);
  const sinClienta = !clienteId;

  // Stock pedido por producto (por si se repite en dos líneas) contra el stock usable.
  const pedido = new Map<string, number>();
  for (const l of validas) pedido.set(l.productoId, (pedido.get(l.productoId) ?? 0) + (l.cantidad ?? 0));

  const motivoBloqueo = (() => {
    if (validas.length === 0) return "Agrega al menos un producto.";
    if (validas.some((l) => !((l.precioUnitario ?? 0) > 0))) return "Cada producto necesita un precio mayor a $0. Para regalar, usa un descuento de cortesía.";
    if (validas.some((l) => !Number.isInteger(l.cantidad))) return "La cantidad es en piezas enteras.";
    for (const [id, cant] of pedido) {
      const p = productos.find((x) => x.id === id);
      if (p && cant > p.stockTotal) return `No alcanza el stock de ${p.nombre}: hay ${p.stockTotal}.`;
    }
    if (errorDesc) return errorDesc;
    if (cobro.error) return cobro.error;
    if (sinClienta && Math.abs(cobro.suma - total) > 0.005) return "Sin clienta, la venta se paga completa.";
    return null;
  })();

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
    // Registrada = siempre se cierra (aunque el comprobante haya fallado): así no se registra dos veces.
    onSuccess: (r) => {
      tokenRef.current = null;
      invalidarVentas(queryClient);
      toast.success(`Venta ${r.folio} registrada.`);
      if (r.aviso) toast.info(r.aviso);
      onClose();
    },
    onError: (e) => setError(mensajeDeError(e, "No se pudo registrar la venta.")),
  });

  async function alRegistrar() {
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

  function actualizar(i: number, cambios: Partial<Linea>) {
    setLineas(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  }

  const hayPagoSinEfectivo = requiereEvidencia(pagosEnviar);

  return (
    <Modal open onClose={onClose} title="Vender producto">
      <div className="flex flex-col gap-5">
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
                placeholder="Nombre de referencia (opcional), ej. vecina del local"
                aria-label="Nombre de referencia"
              />
              <p className="mt-1 text-xs text-ink-500">
                Sin clienta, la venta se paga completa. El nombre solo sirve para identificarla; no da de alta a nadie.
              </p>
            </div>
          )}
        </div>

        {/* 2. Productos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Productos</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLineas([...lineas, LINEA_VACIA])}>
              <Plus size={14} /> Agregar
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {lineas.map((l, i) => {
              const p = productos.find((x) => x.id === l.productoId);
              const excede = p && (pedido.get(p.id) ?? 0) > p.stockTotal;
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <SelectBuscable
                      className="flex-1"
                      value={l.productoId}
                      onChange={(v) => {
                        const nuevo = productos.find((x) => x.id === v);
                        actualizar(i, { productoId: v, cantidad: 1, precioUnitario: nuevo?.precioVenta || null });
                      }}
                      placeholder="Selecciona un producto"
                      aria-label="Producto"
                      opciones={productos
                        .filter((x) => (x.activo && x.stockTotal > 0) || x.id === l.productoId)
                        .map((x) => ({
                          value: x.id,
                          label: x.nombre,
                          detalle: `${formatearStock(x.stockTotal, x.presentacion, x.contenidoCantidad, x.contenidoUnidad)} · ${formatMoneda(x.precioVenta)}`,
                        }))}
                    />
                    <NumberInput
                      key={`cant-${l.productoId || "sin"}-${i}`}
                      className="w-20"
                      allowNull
                      min={0}
                      placeholder="piezas"
                      value={l.cantidad}
                      onValueChange={(v) => actualizar(i, { cantidad: v })}
                      aria-label="Cantidad"
                    />
                    <div className="w-32" title="Precio unitario">
                      <MoneyInput
                        key={`precio-${l.productoId || "sin"}-${i}`}
                        allowNull
                        placeholder="Precio c/u"
                        value={l.precioUnitario}
                        onValueChange={(v) => actualizar(i, { precioUnitario: v })}
                      />
                    </div>
                    {lineas.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-ink-400 hover:text-danger-500"
                        onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                        title="Quitar"
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                  {p && (
                    <p className={`pl-1 text-xs ${excede ? "text-danger-500" : "text-ink-500"}`}>
                      {excede ? "No alcanza: " : "Disponible: "}
                      {formatearStock(p.stockTotal, p.presentacion, p.contenidoCantidad, p.contenidoUnidad)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Descuento */}
        {totalProductos > 0 && (
          <DescuentoCampo etiqueta="Descuento" base={totalProductos} value={descuento} onChange={setDescuento} />
        )}

        {/* 4. Pago */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Pago</h3>
          <div className="mb-3 flex flex-col gap-1 rounded-xl bg-beige-100 p-3 text-sm">
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
            <div className="flex justify-between border-t border-beige-300 pt-1 font-semibold text-ink-900">
              <span>Total</span>
              <span className="tabular-nums">{formatMoneda(total)}</span>
            </div>
          </div>
          {total > 0.005 ? (
            <LineasPago lineas={pagos} onChange={setPagos} metodos={config?.metodosPago ?? []} porCobrar={total} />
          ) : (
            <p className="text-xs text-ink-500">Total en $0: no hay nada que cobrar.</p>
          )}
        </div>

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

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Observaciones</label>
          <Input
            value={observaciones}
            maxLength={500}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Opcional (sin datos de salud)"
          />
        </div>

        {error && <AlertaError mensaje={error} />}
        {!error && motivoBloqueo && <p className="text-xs text-ink-500">{motivoBloqueo}</p>}

        <Button disabled={!!motivoBloqueo || registrar.isPending} onClick={alRegistrar}>
          <ShoppingBag size={16} /> Registrar venta
        </Button>
      </div>
    </Modal>
  );
}
