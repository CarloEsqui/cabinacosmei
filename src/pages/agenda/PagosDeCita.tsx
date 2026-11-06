import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, FileText, HandCoins, Percent, Upload, Wallet, X } from "lucide-react";
import { Comprobantes } from "@/components/cobros/Comprobantes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { requiereEvidencia } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertaError } from "@/components/ui/alerta-error";
import { useToast } from "@/components/ui/toast";
import { formatFecha, formatMoneda } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import {
  LINEA_INICIAL,
  LineasPago,
  evaluarCobro,
  lineasParaEnviar,
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
import { etiquetaMotivo, redondearDinero } from "@shared/descuentos";
import type { CitaRow, DescuentoRow, EstadoCuentaCita, PagoRow } from "@shared/types";

/** Todo lo que muestra dinero de una cita o de sus clientas se refresca tras un movimiento de pago. */
export function invalidarDinero(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    "citas",
    "estadoCuentaCita",
    "detalleServicio",
    "corteResumenPendiente",
    "dashboardResumen",
    "resumenCliente",
    "clientes",
    "comprobantesCita",
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

type Panel = null | "registrar" | "descuento" | { cancelar: PagoRow };

/**
 * Pagos de una cita (cobro v2, spec §12): total, cobrado y saldo; lista de pagos con su estado;
 * "Registrar pago" (abono, FR-004) en citas cerradas con saldo; "Registrar anticipo" (FR-005) en
 * citas activas; "Cancelar pago" con motivo y PIN (FR-006) en cada pago cobrado.
 */
export function PagosDeCita({ cita, cobrarAlAbrir = false }: { cita: CitaRow; cobrarAlAbrir?: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  // "Cobrar" desde la lista de Citas abre el detalle directo en el panel de registrar pago.
  const [panel, setPanel] = useState<Panel>(cobrarAlAbrir ? "registrar" : null);

  const { data: cuenta } = useQuery({
    queryKey: ["estadoCuentaCita", cita.id],
    queryFn: () => window.api.cobros.estadoCuentaCita(cita.id),
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => window.api.config.obtener(),
  });

  if (!cuenta) return null;

  const activa = cita.estado === "programada" || cita.estado === "confirmada";
  const puedeAbonar = cuenta.cerrada && cuenta.saldo > 0.005 && cuenta.estatusPago !== "cancelado";
  const puedeAnticipo = !cuenta.cerrada && activa;
  // Spec de descuentos, FR-005: la misma acción del cierre, sobre una cita ya cerrada. Sin PIN.
  const puedeDescontar = cuenta.cerrada && cuenta.estatusPago !== "cancelado";
  if (!cuenta.cerrada && !puedeAnticipo && cuenta.pagos.length === 0) return null;

  async function quitarDescuento(d: DescuentoRow) {
    const r = await confirm({
      titulo: "Quitar descuento",
      mensaje: `Se quita el descuento de ${formatMoneda(d.monto)} (${etiquetaMotivo(d.motivo)}). El total de la cita vuelve a subir y el saldo se recalcula. Queda registrado en la bitácora.`,
      confirmarLabel: "Quitar descuento",
      cancelarLabel: "Volver",
    });
    if (r !== "confirmado") return;
    try {
      await window.api.cobros.quitarDescuento({ descuentoId: d.id, motivo: "Quitado desde el detalle de la cita" });
      invalidarDinero(queryClient);
      toast.success("Descuento quitado.");
    } catch (e) {
      toast.error(mensajeDeError(e, "No se pudo quitar el descuento."));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {cuenta.cerrada && cuenta.descuentos.length > 0 && <DesgloseTicket cuenta={cuenta} onQuitar={quitarDescuento} />}

      {cuenta.cerrada && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <Dato label="Total" valor={formatMoneda(cuenta.total)} />
          <Dato label="Cobrado" valor={formatMoneda(cuenta.cobrado)} />
          <Dato
            label="Saldo"
            valor={formatMoneda(cuenta.saldo)}
            acento={cuenta.saldo > 0.005 ? "danger" : "success"}
          />
        </div>
      )}

      {(cuenta.pagos.length > 0 || puedeAnticipo) && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {cuenta.cerrada ? "Pagos" : "Anticipos"}
          </h3>
          {cuenta.pagos.length === 0 && <p className="text-xs text-ink-500">Sin anticipos.</p>}
          <ul className="flex flex-col gap-1 text-sm text-ink-700">
            {cuenta.pagos.map((p) => (
              <FilaPago
                key={p.id}
                pago={p}
                onCancelar={p.estatus === "cobrado" ? () => setPanel({ cancelar: p }) : undefined}
              />
            ))}
          </ul>
        </div>
      )}

      {panel === null && (puedeAbonar || puedeAnticipo || puedeDescontar) && (
        <div className="flex flex-wrap gap-2">
          {(puedeAbonar || puedeAnticipo) && (
            <Button variant="secondary" size="sm" onClick={() => setPanel("registrar")}>
              {puedeAbonar ? (
                <>
                  <Wallet size={14} /> Registrar pago
                </>
              ) : (
                <>
                  <HandCoins size={14} /> Registrar anticipo
                </>
              )}
            </Button>
          )}
          {puedeDescontar && (
            <Button variant="secondary" size="sm" onClick={() => setPanel("descuento")}>
              <Percent size={14} /> {cuenta.descuentos.length > 0 ? "Cambiar descuento" : "Aplicar descuento"}
            </Button>
          )}
        </div>
      )}

      {panel === "descuento" && puedeDescontar && (
        <PanelDescuento
          cuenta={cuenta}
          onCerrar={() => setPanel(null)}
          onHecho={() => {
            invalidarDinero(queryClient);
            toast.success("Descuento aplicado.");
            setPanel(null);
          }}
        />
      )}

      {panel === "registrar" && (puedeAbonar || puedeAnticipo) && (
        <PanelRegistrar
          modo={puedeAbonar ? "abono" : "anticipo"}
          citaId={cita.id}
          servicioRealizadoId={cuenta.servicioRealizadoId}
          saldo={cuenta.saldo}
          tieneComprobante={puedeAbonar ? !!cuenta.tieneComprobante : false}
          metodos={config?.metodosPago ?? []}
          onCerrar={() => setPanel(null)}
          onHecho={(texto) => {
            invalidarDinero(queryClient);
            toast.success(texto);
            setPanel(null);
          }}
        />
      )}

      {/* Comprobantes del servicio y de los anticipos: vista previa, pantalla completa y descarga. */}
      <Comprobantes citaId={cita.id} servicioRealizadoId={cuenta.cerrada ? cuenta.servicioRealizadoId : undefined} />

      {panel !== null && panel !== "registrar" && panel !== "descuento" && (
        <PanelCancelar
          pago={panel.cancelar}
          onCerrar={() => setPanel(null)}
          onHecho={() => {
            invalidarDinero(queryClient);
            toast.success("Pago cancelado.");
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}

export function FilaPago({ pago, onCancelar }: { pago: PagoRow; onCancelar?: () => void }) {
  const cancelado = pago.estatus === "cancelado";
  return (
    <li className="flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className={cancelado ? "text-ink-400 line-through" : ""}>
          {formatFecha(pago.fecha)} · {pago.metodoPago}
          {pago.concepto === "anticipo" && (
            <Badge variant="jacaranda" className="ml-2">
              Anticipo
            </Badge>
          )}
        </span>
        <span className="flex items-center gap-1">
          <span className={cancelado ? "font-medium text-ink-400 line-through" : "font-medium"}>
            {formatMoneda(pago.monto)}
          </span>
          {onCancelar && (
            <Button
              variant="ghost"
              size="sm"
              className="text-ink-400 hover:text-danger-500"
              title="Cancelar este pago"
              onClick={onCancelar}
            >
              <Ban size={14} />
            </Button>
          )}
        </span>
      </div>
      {cancelado && pago.motivoCancelacion && (
        <span className="pl-1 text-xs text-ink-400">Cancelado: {pago.motivoCancelacion}</span>
      )}
    </li>
  );
}

function PanelRegistrar({
  modo,
  citaId,
  servicioRealizadoId,
  saldo,
  tieneComprobante,
  metodos,
  onCerrar,
  onHecho,
}: {
  modo: "abono" | "anticipo";
  citaId: string;
  servicioRealizadoId?: string;
  saldo: number;
  /** El servicio cerrado ya tiene comprobante. */
  tieneComprobante: boolean;
  metodos: string[];
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  const [lineas, setLineas] = useState<LineaPagoCaptura[]>(LINEA_INICIAL);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const esAbono = modo === "abono";
  const porCobrar = esAbono ? saldo : 0;
  const cobro = evaluarCobro(lineas, porCobrar, esAbono);

  // Anticipo: la cita aún no tiene servicio, así que el archivo se elige ahora y el main lo guarda
  // al registrar (token; la ruta nunca sale del main).
  const [seleccion, setSeleccion] = useState<{ token: string; nombre: string } | null>(null);
  const toast = useToast();

  // Al cerrar el panel sin registrar, el main olvida el archivo elegido (COB-B6).
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = seleccion?.token ?? null;
  useEffect(
    () => () => {
      if (tokenRef.current) void window.api.archivos.descartarComprobante(tokenRef.current);
    },
    [],
  );
  function quitarSeleccion() {
    if (seleccion) void window.api.archivos.descartarComprobante(seleccion.token);
    setSeleccion(null);
  }

  const subirComprobante = useMutation({
    mutationFn: () => window.api.archivos.subirComprobante(servicioRealizadoId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estadoCuentaCita", citaId] });
      queryClient.invalidateQueries({ queryKey: ["comprobantesCita", citaId] });
    },
    onError: (e) => setError(mensajeDeError(e, "No se pudo subir el comprobante.")),
  });

  async function elegirParaAnticipo() {
    try {
      const elegido = await window.api.archivos.elegirComprobante();
      if (elegido) setSeleccion(elegido);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo elegir el comprobante."));
    }
  }

  const guardar = useMutation({
    mutationFn: async (sinComprobanteAceptado: boolean): Promise<string | undefined> => {
      const lineasEnvio = lineasParaEnviar(lineas, porCobrar);
      if (esAbono) {
        await window.api.cobros.registrarAbono({
          servicioRealizadoId: servicioRealizadoId!,
          lineas: lineasEnvio,
          sinComprobanteAceptado,
        });
        return undefined;
      }
      const r = await window.api.cobros.registrarAnticipo({
        citaId,
        lineas: lineasEnvio,
        sinComprobanteAceptado,
        comprobanteToken: seleccion?.token,
      });
      return r.aviso;
    },
    // Registrado = siempre se cierra el panel (aunque el comprobante haya fallado): así no se puede
    // registrar dos veces el mismo anticipo (COB-A2). El token ya se consumió en el main.
    onSuccess: (aviso) => {
      tokenRef.current = null;
      if (aviso) toast.info(aviso);
      onHecho(esAbono ? "Pago registrado." : "Anticipo registrado.");
    },
    onError: (e) => setError(mensajeDeError(e, "No se pudo registrar el pago.")),
  });

  const sinMontos = lineasParaEnviar(lineas, porCobrar).length === 0;
  const listo = !cobro.error && !sinMontos;
  // Con tarjeta o transferencia el panel se abre para pedir el comprobante (opcional).
  const hayPagoSinEfectivo = requiereEvidencia(lineasParaEnviar(lineas, porCobrar));
  const pideEvidencia = hayPagoSinEfectivo && !tieneComprobante && !seleccion;

  // Addendum 2026-11-05: sin PIN. Efectivo no pide nada; otro método sin comprobante se confirma.
  async function alGuardar() {
    if (pideEvidencia) {
      const r = await confirm({
          titulo: "¿Continuar sin comprobante?",
          mensaje:
            "Este cobro no es en efectivo y no tiene comprobante. Si continúas, no tendrás evidencia de este pago.",
          confirmarLabel: "Continuar sin comprobante",
          cancelarLabel: "Volver",
        });
      if (r !== "confirmado") return;
    }
    guardar.mutate(pideEvidencia);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-beige-300 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {esAbono ? `Registrar pago · debe ${formatMoneda(saldo)}` : "Registrar anticipo"}
      </h3>
      <LineasPago lineas={lineas} onChange={setLineas} metodos={metodos} porCobrar={porCobrar} conTope={esAbono} />
      {hayPagoSinEfectivo && (
        <div className="aparecer-suave flex flex-col gap-2 rounded-xl bg-beige-100 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Comprobante</p>
          {tieneComprobante ? (
            <p className="flex items-center gap-1.5 text-sm text-success-500">
              <CheckCircle2 size={15} /> Este servicio ya tiene comprobante.
            </p>
          ) : seleccion ? (
            <div className="flex items-center gap-2 text-sm text-ink-900">
              <FileText size={15} className="shrink-0 text-jacaranda-600" />
              <span className="min-w-0 flex-1 truncate">{seleccion.nombre}</span>
              <Button type="button" variant="ghost" size="sm" onClick={quitarSeleccion}>
                <X size={14} /> Quitar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={subirComprobante.isPending}
                onClick={() => (esAbono ? subirComprobante.mutate() : elegirParaAnticipo())}
              >
                <Upload size={14} /> {esAbono ? "Subir comprobante" : "Elegir comprobante"}
              </Button>
              <span className="text-xs text-ink-500">Foto del voucher o de la transferencia.</span>
            </div>
          )}
        </div>
      )}
      {error && <AlertaError mensaje={error} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCerrar}>
          Volver
        </Button>
        <Button size="sm" disabled={!listo || guardar.isPending} onClick={alGuardar}>
          {esAbono ? "Registrar pago" : "Registrar anticipo"}
        </Button>
      </div>
    </div>
  );
}

/** Servicio, productos y sus descuentos vigentes, con la acción de quitar al lado (FR-006). */
function DesgloseTicket({ cuenta, onQuitar }: { cuenta: EstadoCuentaCita; onQuitar: (d: DescuentoRow) => void }) {
  const fila = (texto: string, monto: number, extra?: React.ReactNode, verde = false) => (
    <div className={`flex items-center justify-between gap-2 ${verde ? "text-success-500" : "text-ink-700"}`}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{texto}</span>
        {extra}
      </span>
      <span className="tabular-nums">{verde ? `− ${formatMoneda(monto)}` : formatMoneda(monto)}</span>
    </div>
  );
  const quitar = (d: DescuentoRow) => (
    <button type="button" className="shrink-0 text-xs text-ink-400 underline hover:text-danger-500" onClick={() => onQuitar(d)}>
      Quitar
    </button>
  );
  const textoDesc = (d: DescuentoRow) =>
    `Descuento ${d.modo === "porcentaje" ? `${d.valor} %` : ""} · ${etiquetaMotivo(d.motivo)}${d.motivoDetalle ? ` (${d.motivoDetalle})` : ""}`;
  const dServicio = cuenta.descuentos.find((d) => d.aplicaA === "servicio");
  const dProductos = cuenta.descuentos.find((d) => d.aplicaA === "productos");
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-beige-100 p-3 text-sm">
      {fila("Servicio", cuenta.precioBruto ?? 0)}
      {dServicio && fila(textoDesc(dServicio), dServicio.monto, quitar(dServicio), true)}
      {cuenta.totalProductos > 0 && fila("Productos vendidos", cuenta.totalProductos)}
      {dProductos && fila(textoDesc(dProductos), dProductos.monto, quitar(dProductos), true)}
    </div>
  );
}

/**
 * FR-005: aplicar o cambiar el descuento de una cita cerrada. Sin PIN (BR-008); pide una
 * confirmación. No puede bajar el total de lo ya cobrado (BR-005): se avisa aquí y el servidor lo
 * vuelve a validar.
 */
function PanelDescuento({
  cuenta,
  onCerrar,
  onHecho,
}: {
  cuenta: EstadoCuentaCita;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const confirm = useConfirm();
  const hayProductos = cuenta.totalProductos > 0;
  const [aplicaA, setAplicaA] = useState<"servicio" | "productos">("servicio");
  const [borrador, setBorrador] = useState<DescuentoBorrador>(DESCUENTO_VACIO);
  const [error, setError] = useState<string | null>(null);

  const base = aplicaA === "servicio" ? (cuenta.precioBruto ?? 0) : cuenta.totalProductos;
  const actual = cuenta.descuentos.find((d) => d.aplicaA === aplicaA);
  const monto = montoDescuento(borrador, base);
  // Total si este descuento reemplaza al actual de la misma base.
  const totalNuevo = redondearDinero((cuenta.total ?? 0) + (actual?.monto ?? 0) - monto);
  const maximo = Math.max(0, redondearDinero((cuenta.total ?? 0) + (actual?.monto ?? 0) - cuenta.cobrado));
  const errorCaptura =
    errorDescuento(borrador, base) ??
    (monto > maximo + 0.005
      ? `Ya se cobraron ${formatMoneda(cuenta.cobrado)}: el descuento puede ser de hasta ${formatMoneda(maximo)}. Para más, primero cancela un pago.`
      : null);
  const listo = monto > 0 && !errorCaptura;

  const aplicar = useMutation({
    mutationFn: () => {
      const descuento = descuentoParaEnviar(borrador, aplicaA);
      if (!cuenta.servicioRealizadoId || !descuento) throw new Error("Captura el descuento.");
      return window.api.cobros.aplicarDescuento({ servicioRealizadoId: cuenta.servicioRealizadoId, descuento });
    },
    onSuccess: onHecho,
    onError: (e) => setError(mensajeDeError(e, "No se pudo aplicar el descuento.")),
  });

  async function alGuardar() {
    const saldoNuevo = Math.max(0, redondearDinero(totalNuevo - cuenta.cobrado));
    const r = await confirm({
      titulo: actual ? "Cambiar descuento" : "Aplicar descuento",
      mensaje:
        `Descuento de ${formatMoneda(monto)} ${aplicaA === "servicio" ? "al servicio" : "a los productos"}` +
        (actual ? ` (reemplaza el de ${formatMoneda(actual.monto)})` : "") +
        `. El total queda en ${formatMoneda(totalNuevo)} y el saldo en ${formatMoneda(saldoNuevo)}. Los pagos no cambian. Queda registrado en la bitácora.`,
      confirmarLabel: actual ? "Cambiar descuento" : "Aplicar descuento",
      cancelarLabel: "Volver",
    });
    if (r === "confirmado") aplicar.mutate();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-jacaranda-200 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {actual ? "Cambiar descuento" : "Aplicar descuento"}
      </h3>
      {hayProductos && (
        <div className="flex gap-1.5" role="group" aria-label="¿A qué se aplica?">
          {(["servicio", "productos"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                setAplicaA(b);
                setBorrador(DESCUENTO_VACIO);
              }}
              aria-pressed={aplicaA === b}
              className={`rounded-full border px-3 py-1 text-xs ${
                aplicaA === b
                  ? "border-jacaranda-500 bg-jacaranda-50 font-medium text-jacaranda-700"
                  : "border-beige-300 bg-beige-50 text-ink-700"
              }`}
            >
              {b === "servicio" ? "Al servicio" : "A los productos"}
            </button>
          ))}
        </div>
      )}
      <DescuentoCampo
        key={aplicaA}
        etiqueta={`Sobre ${formatMoneda(base)}`}
        base={base}
        value={borrador}
        onChange={setBorrador}
      />
      {actual && (
        <p className="text-xs text-ink-500">
          Ya tiene un descuento de {formatMoneda(actual.monto)} ({etiquetaMotivo(actual.motivo)}); el nuevo lo reemplaza.
        </p>
      )}
      {monto > 0 && !errorCaptura && (
        <p className="text-xs text-ink-500">
          Total nuevo {formatMoneda(totalNuevo)} · cobrado {formatMoneda(cuenta.cobrado)}.
        </p>
      )}
      {errorCaptura && monto > 0 && <p className="text-xs text-danger-500">{errorCaptura}</p>}
      {error && <AlertaError mensaje={error} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCerrar}>
          Volver
        </Button>
        <Button size="sm" disabled={!listo || aplicar.isPending} onClick={alGuardar}>
          Guardar descuento
        </Button>
      </div>
    </div>
  );
}

export function PanelCancelar({ pago, onCerrar, onHecho }: { pago: PagoRow; onCerrar: () => void; onHecho: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cancelar = useMutation({
    mutationFn: () => window.api.cobros.cancelarPago({ pagoId: pago.id, motivo, pin }),
    onSuccess: onHecho,
    onError: (e) => setError(mensajeDeError(e, "No se pudo cancelar el pago.")),
  });

  const listo = motivo.trim().length >= 3 && pin.length >= 4;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-danger-500/40 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        Cancelar pago de {formatMoneda(pago.monto)} · {pago.metodoPago}
      </h3>
      <p className="text-xs text-ink-500">
        El pago no se borra: queda tachado, con su motivo, y deja de contar en el saldo.
        {pago.enCorte && " Como ya entró en un corte, el próximo corte lo mostrará como ajuste negativo."}
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Motivo (sin datos personales)</label>
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. se capturó dos veces" />
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
        <Button
          size="sm"
          variant="danger"
          disabled={!listo || cancelar.isPending}
          onClick={() => cancelar.mutate()}
        >
          Cancelar pago
        </Button>
      </div>
    </div>
  );
}

export function Dato({ label, valor, acento }: { label: string; valor: string; acento?: "danger" | "success" }) {
  return (
    <div className="rounded-xl bg-beige-100 px-2 py-2.5">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p
        className={
          acento === "danger"
            ? "text-sm font-semibold text-danger-500"
            : acento === "success"
              ? "text-sm font-semibold text-success-500"
              : "text-sm font-semibold text-ink-900"
        }
      >
        {valor}
      </p>
    </div>
  );
}
