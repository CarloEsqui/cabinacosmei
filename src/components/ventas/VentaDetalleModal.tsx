import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Percent, Plus, Repeat, ShoppingBag, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertaError } from "@/components/ui/alerta-error";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatFecha, formatMoneda } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { cn } from "@/lib/utils";
import { Dato, FilaPago, PanelCancelar } from "@/pages/agenda/PagosDeCita";
import { MiniaturaComprobante, VisorComprobante } from "@/components/cobros/Comprobantes";
import { LINEA_INICIAL, LineasPago, evaluarCobro, lineasParaEnviar, type LineaPagoCaptura } from "@/components/cobros/LineasPago";
import {
  DESCUENTO_VACIO,
  DescuentoCampo,
  descuentoParaEnviar,
  errorDescuento,
  montoDescuento,
  type DescuentoBorrador,
} from "@/components/cobros/DescuentoCampo";
import { etiquetaMotivo, redondearDinero } from "@shared/descuentos";
import { requiereEvidencia } from "@shared/schemas";
import { invalidarVentas } from "@/components/ventas/invalidar";
import type { ComprobanteRow, DescuentoRow, DetalleVentaMostrador, PagoRow, VentaMostradorRow } from "@shared/types";

/** "Para quién" de una venta, igual en la lista, la ficha de la clienta y el detalle. */
export function destinatarioVenta(v: Pick<VentaMostradorRow, "clienteNombre" | "nombreReferencia">): string {
  if (v.clienteNombre) return v.clienteNombre;
  if (v.nombreReferencia) return `${v.nombreReferencia} (sin registro)`;
  return "Público general";
}

export function EstatusVenta({ venta }: { venta: Pick<VentaMostradorRow, "estatus" | "estatusPago"> }) {
  if (venta.estatus === "cancelada") return <Badge variant="neutral">Cancelada</Badge>;
  if (venta.estatusPago === "pagado") return <Badge variant="success">Pagada</Badge>;
  if (venta.estatusPago === "parcial") return <Badge variant="warning">Parcial</Badge>;
  return <Badge variant="danger">Pendiente</Badge>;
}

type Panel = null | "abono" | "descuento" | "cancelarVenta" | { cancelarPago: PagoRow };

/** Para armar en el punto de venta una venta igual a otra (acceso "Repetir venta", §23). */
export interface EstadoRepetirVenta {
  repetir: string;
}

/**
 * Detalle de una venta de mostrador (spec de la venta, FR-012), al estilo del detalle de cita: lo
 * vendido, el desglose y los pagos, con cada acción junto a lo que afecta. `panelInicial` abre una
 * acción de entrada (Por cobrar → "Registrar pago").
 */
export function VentaDetalleModal({
  ventaId,
  onClose,
  panelInicial,
}: {
  ventaId: string | null;
  onClose: () => void;
  panelInicial?: "abono";
}) {
  if (!ventaId) return null;
  return <Detalle ventaId={ventaId} onClose={onClose} panelInicial={panelInicial ?? null} />;
}

function Detalle({ ventaId, onClose, panelInicial }: { ventaId: string; onClose: () => void; panelInicial: Panel }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(panelInicial);
  const [abierto, setAbierto] = useState<ComprobanteRow | null>(null);

  const { data: venta, error } = useQuery({
    queryKey: ["ventaDetalle", ventaId],
    queryFn: () => window.api.ventas.detalle(ventaId),
  });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: () => window.api.config.obtener() });

  const agregarComprobante = useMutation({
    mutationFn: () => window.api.ventas.subirComprobante(ventaId),
    onSuccess: (r) => {
      if (!r) return;
      invalidarVentas(queryClient);
      toast.success("Comprobante agregado.");
    },
    onError: (e) => toast.error(mensajeDeError(e, "No se pudo subir el comprobante.")),
  });

  const titulo = venta ? `Venta ${venta.folio}` : "Venta";
  if (!venta) {
    return (
      <Modal open onClose={onClose} title={titulo}>
        {error ? <AlertaError mensaje={mensajeDeError(error, "No se pudo cargar la venta.")} /> : <p className="text-sm text-ink-500">Cargando…</p>}
      </Modal>
    );
  }

  const vigente = venta.estatus === "vigente";
  const puedeAbonar = vigente && venta.saldo > 0.005;
  const hecho = (texto: string) => {
    invalidarVentas(queryClient);
    toast.success(texto);
    setPanel(null);
  };

  async function quitarDescuento(d: DescuentoRow) {
    const r = await confirm({
      titulo: "Quitar descuento",
      mensaje: `Se quita el descuento de ${formatMoneda(d.monto)} (${etiquetaMotivo(d.motivo)}). El total vuelve a subir y el saldo se recalcula. Queda registrado en la bitácora.`,
      confirmarLabel: "Quitar descuento",
      cancelarLabel: "Volver",
    });
    if (r !== "confirmado") return;
    try {
      await window.api.cobros.quitarDescuento({ descuentoId: d.id, motivo: "Quitado desde el detalle de la venta" });
      hecho("Descuento quitado.");
    } catch (e) {
      toast.error(mensajeDeError(e, "No se pudo quitar el descuento."));
    }
  }

  const descuento = venta.descuentos[0];

  // "Repetir venta": el punto de venta arma el carrito con la misma clienta y los mismos productos.
  function repetir() {
    const estado: EstadoRepetirVenta = { repetir: venta!.id };
    onClose();
    navigate("/ventas", { state: estado });
  }

  return (
    <>
      <Modal open onClose={onClose} title={titulo}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 rounded-xl bg-beige-100 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink-900">{destinatarioVenta(venta)}</p>
              <p className="text-xs text-ink-500">
                {formatFecha(venta.fecha)}
                {venta.clienteCodigo ? ` · ${venta.clienteCodigo}` : ""}
              </p>
            </div>
            <EstatusVenta venta={venta} />
          </div>

          {!vigente && (
            <p className="rounded-xl border border-beige-300 p-3 text-xs text-ink-500">
              Venta cancelada{venta.motivoCancelacion ? `: ${venta.motivoCancelacion}` : ""}. El producto regresó al inventario y
              sus pagos quedaron cancelados.
            </p>
          )}

          {/* Lo vendido y el desglose */}
          <div className="flex flex-col gap-1 rounded-xl bg-beige-100 p-3 text-sm">
            {venta.lineas.map((l) => (
              <div key={`${l.productoId}-${l.precioUnitario}`} className="flex justify-between gap-2 text-ink-700">
                <span className="min-w-0 truncate">
                  {l.nombre} · {l.cantidad} × {formatMoneda(l.precioUnitario)}
                </span>
                <span className="tabular-nums">{formatMoneda(l.importe)}</span>
              </div>
            ))}
            {descuento && (
              <div className="flex items-center justify-between gap-2 text-success-500">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">
                    Descuento {descuento.modo === "porcentaje" ? `${descuento.valor} % ` : ""}· {etiquetaMotivo(descuento.motivo)}
                    {descuento.motivoDetalle ? ` (${descuento.motivoDetalle})` : ""}
                  </span>
                  {vigente && venta.admiteSaldo && (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-ink-400 underline hover:text-danger-500"
                      onClick={() => quitarDescuento(descuento)}
                    >
                      Quitar
                    </button>
                  )}
                </span>
                <span className="tabular-nums">− {formatMoneda(descuento.monto)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <Dato label="Total" valor={formatMoneda(venta.total)} />
            <Dato label="Cobrado" valor={formatMoneda(venta.cobrado)} />
            <Dato label="Saldo" valor={formatMoneda(venta.saldo)} acento={venta.saldo > 0.005 ? "danger" : "success"} />
          </div>

          {/* Pagos */}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Pagos</h3>
            {venta.pagos.length === 0 && <p className="text-xs text-ink-500">Sin pagos.</p>}
            <ul className="flex flex-col gap-1 text-sm text-ink-700">
              {venta.pagos.map((p) => (
                <FilaPago
                  key={p.id}
                  pago={p}
                  // BR-003 (§23): sin clienta no hay crédito; un pago suelto no se cancela.
                  onCancelar={vigente && p.estatus === "cobrado" && venta.admiteSaldo ? () => setPanel({ cancelarPago: p }) : undefined}
                />
              ))}
            </ul>
            {vigente && !venta.admiteSaldo && venta.pagos.some((p) => p.estatus === "cobrado") && (
              <p className="mt-1 text-xs text-ink-400">
                Sin clienta la venta no puede quedar debiendo: para corregir un pago o el precio, cancela la venta y regístrala de nuevo.
              </p>
            )}
          </div>

          {/* Comprobantes */}
          {(venta.comprobantes.length > 0 || vigente) && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Comprobantes</h3>
              <div className="flex flex-wrap gap-2">
                {venta.comprobantes.map((c) => (
                  <MiniaturaComprobante key={c.id} comprobante={c} onAbrir={() => setAbierto(c)} />
                ))}
                {vigente && (
                  <button
                    type="button"
                    disabled={agregarComprobante.isPending}
                    onClick={() => agregarComprobante.mutate()}
                    className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-beige-300 text-xs text-ink-500 transition-colors hover:border-jacaranda-300 hover:bg-jacaranda-50 hover:text-jacaranda-700 disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Agregar
                  </button>
                )}
              </div>
            </div>
          )}

          {venta.observaciones && (
            <p className="text-sm text-ink-700">
              <span className="text-xs font-medium text-ink-500">Observaciones: </span>
              {venta.observaciones}
            </p>
          )}

          {/* Acciones */}
          {!vigente && panel === null && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={repetir}>
                <Repeat size={14} /> Repetir venta
              </Button>
            </div>
          )}
          {vigente && panel === null && (
            <div className="flex flex-wrap gap-2">
              {puedeAbonar && (
                <Button variant="secondary" size="sm" onClick={() => setPanel("abono")}>
                  <Wallet size={14} /> Registrar pago
                </Button>
              )}
              {/* VEN-A1 (§23): sin clienta, cambiar el descuento la dejaría debiendo; el main también
                  lo rechaza. */}
              {venta.admiteSaldo && (
                <Button variant="secondary" size="sm" onClick={() => setPanel("descuento")}>
                  <Percent size={14} /> {descuento ? "Cambiar descuento" : "Aplicar descuento"}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={repetir}>
                <Repeat size={14} /> Repetir venta
              </Button>
              <Button variant="ghost" size="sm" className="text-danger-500" onClick={() => setPanel("cancelarVenta")}>
                <Ban size={14} /> Cancelar venta
              </Button>
            </div>
          )}

          {panel === "abono" && puedeAbonar && (
            <PanelAbono venta={venta} metodos={config?.metodosPago ?? []} onCerrar={() => setPanel(null)} onHecho={() => hecho("Pago registrado.")} />
          )}
          {panel === "descuento" && vigente && (
            <PanelDescuentoVenta venta={venta} onCerrar={() => setPanel(null)} onHecho={() => hecho("Descuento aplicado.")} />
          )}
          {panel === "cancelarVenta" && vigente && (
            <PanelCancelarVenta venta={venta} onCerrar={() => setPanel(null)} onHecho={() => hecho(`Venta ${venta.folio} cancelada.`)} />
          )}
          {panel !== null && typeof panel === "object" && (
            <PanelCancelar pago={panel.cancelarPago} onCerrar={() => setPanel(null)} onHecho={() => hecho("Pago cancelado.")} />
          )}
        </div>
      </Modal>
      {abierto && createPortal(<VisorComprobante comprobante={abierto} onClose={() => setAbierto(null)} />, document.body)}
    </>
  );
}

function PanelAbono({
  venta,
  metodos,
  onCerrar,
  onHecho,
}: {
  venta: DetalleVentaMostrador;
  metodos: string[];
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const confirm = useConfirm();
  const [lineas, setLineas] = useState<LineaPagoCaptura[]>(LINEA_INICIAL);
  const [error, setError] = useState<string | null>(null);
  const cobro = evaluarCobro(lineas, venta.saldo);
  const enviar = lineasParaEnviar(lineas, venta.saldo);

  const guardar = useMutation({
    mutationFn: (sinComprobanteAceptado: boolean) =>
      window.api.cobros.registrarAbono({ ventaMostradorId: venta.id, lineas: enviar, sinComprobanteAceptado }),
    onSuccess: onHecho,
    onError: (e) => setError(mensajeDeError(e, "No se pudo registrar el pago.")),
  });

  async function alGuardar() {
    const sinEvidencia = !venta.tieneComprobante && requiereEvidencia(enviar);
    if (sinEvidencia) {
      const r = await confirm({
        titulo: "¿Continuar sin comprobante?",
        mensaje: "Este cobro no es en efectivo y la venta no tiene comprobante. Puedes agregarlo en Comprobantes antes de registrar.",
        confirmarLabel: "Continuar sin comprobante",
        cancelarLabel: "Volver",
      });
      if (r !== "confirmado") return;
    }
    guardar.mutate(sinEvidencia);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-beige-300 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Registrar pago · debe {formatMoneda(venta.saldo)}</h3>
      <LineasPago lineas={lineas} onChange={setLineas} metodos={metodos} porCobrar={venta.saldo} />
      {error && <AlertaError mensaje={error} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCerrar}>
          Volver
        </Button>
        <Button size="sm" disabled={!!cobro.error || enviar.length === 0 || guardar.isPending} onClick={alGuardar}>
          Registrar pago
        </Button>
      </div>
    </div>
  );
}

/** Mismo control que en la cita cerrada: no puede bajar el total de lo ya cobrado (BR-005). */
function PanelDescuentoVenta({ venta, onCerrar, onHecho }: { venta: DetalleVentaMostrador; onCerrar: () => void; onHecho: () => void }) {
  const confirm = useConfirm();
  const [borrador, setBorrador] = useState<DescuentoBorrador>(DESCUENTO_VACIO);
  const [error, setError] = useState<string | null>(null);
  const actual = venta.descuentos[0];
  const base = venta.totalProductos;
  const monto = montoDescuento(borrador, base);
  const totalNuevo = redondearDinero(base - monto);
  const maximo = Math.max(0, redondearDinero(base - venta.cobrado));
  const errorCaptura =
    errorDescuento(borrador, base) ??
    (monto > maximo + 0.005
      ? `Ya se cobraron ${formatMoneda(venta.cobrado)}: el descuento puede ser de hasta ${formatMoneda(maximo)}. Para más, primero cancela un pago.`
      : null);

  const aplicar = useMutation({
    mutationFn: () => {
      const descuento = descuentoParaEnviar(borrador, "productos");
      if (!descuento) throw new Error("Captura el descuento.");
      return window.api.cobros.aplicarDescuento({ ventaMostradorId: venta.id, descuento });
    },
    onSuccess: onHecho,
    onError: (e) => setError(mensajeDeError(e, "No se pudo aplicar el descuento.")),
  });

  async function alGuardar() {
    const r = await confirm({
      titulo: actual ? "Cambiar descuento" : "Aplicar descuento",
      mensaje:
        `Descuento de ${formatMoneda(monto)}${actual ? ` (reemplaza el de ${formatMoneda(actual.monto)})` : ""}. ` +
        `El total queda en ${formatMoneda(totalNuevo)} y el saldo en ${formatMoneda(Math.max(0, redondearDinero(totalNuevo - venta.cobrado)))}. Queda registrado en la bitácora.`,
      confirmarLabel: actual ? "Cambiar descuento" : "Aplicar descuento",
      cancelarLabel: "Volver",
    });
    if (r === "confirmado") aplicar.mutate();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-jacaranda-200 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{actual ? "Cambiar descuento" : "Aplicar descuento"}</h3>
      <DescuentoCampo etiqueta={`Sobre ${formatMoneda(base)}`} base={base} value={borrador} onChange={setBorrador} />
      {errorCaptura && monto > 0 && <p className="text-xs text-danger-500">{errorCaptura}</p>}
      {error && <AlertaError mensaje={error} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCerrar}>
          Volver
        </Button>
        <Button size="sm" disabled={!(monto > 0) || !!errorCaptura || aplicar.isPending} onClick={alGuardar}>
          Guardar descuento
        </Button>
      </div>
    </div>
  );
}

const MOTIVOS_CANCELACION = ["Devolución", "Error al capturar", "Otro"] as const;

/**
 * FR-009 (§23): con PIN; el motivo es opcional y se elige con un toque. Regresa el producto y cancela
 * los pagos; nunca se borra.
 */
function PanelCancelarVenta({ venta, onCerrar, onHecho }: { venta: DetalleVentaMostrador; onCerrar: () => void; onHecho: () => void }) {
  const [chip, setChip] = useState<(typeof MOTIVOS_CANCELACION)[number] | null>(null);
  const [detalle, setDetalle] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cortados = venta.pagos.some((p) => p.estatus === "cobrado" && p.enCorte);
  const motivo = chip === "Otro" ? detalle.trim() || undefined : (chip ?? undefined);

  const cancelar = useMutation({
    mutationFn: () => window.api.ventas.cancelar({ ventaId: venta.id, motivo, pin }),
    onSuccess: onHecho,
    onError: (e) => setError(mensajeDeError(e, "No se pudo cancelar la venta.")),
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-danger-500/40 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <ShoppingBag size={14} /> Cancelar venta {venta.folio}
      </h3>
      <p className="text-xs text-ink-500">
        La venta no se borra: queda cancelada, el producto regresa al inventario y sus pagos se cancelan.
        {cortados && " Como ya entraron en un corte, el próximo corte los mostrará como ajuste negativo."}
      </p>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-500">Motivo (opcional)</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivo de la cancelación">
          {MOTIVOS_CANCELACION.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setChip(chip === m ? null : m)}
              aria-pressed={chip === m}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                chip === m
                  ? "border-jacaranda-500 bg-jacaranda-50 font-medium text-jacaranda-700"
                  : "border-beige-300 bg-beige-50 text-ink-700 hover:bg-beige-100",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        {chip === "Otro" && (
          <Input
            value={detalle}
            maxLength={120}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Motivo (sin nombres ni datos de salud)"
          />
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">PIN de acceso</label>
        <Input
          type="password"
          inputMode="numeric"
          placeholder="PIN de acceso"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      {error && <AlertaError mensaje={error} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCerrar}>
          Volver
        </Button>
        <Button size="sm" variant="danger" disabled={pin.length < 4 || cancelar.isPending} onClick={() => cancelar.mutate()}>
          Cancelar venta
        </Button>
      </div>
    </div>
  );
}
