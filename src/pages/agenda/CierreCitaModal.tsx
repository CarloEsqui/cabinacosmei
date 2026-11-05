import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Upload, FolderOpen, Lock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";
import { MoneyInput } from "@/components/ui/money-input";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatFecha, formatMoneda } from "@/lib/format";
import {
  LINEA_INICIAL,
  LineasPago,
  evaluarCobro,
  lineasParaEnviar,
  type LineaPagoCaptura,
} from "@/components/cobros/LineasPago";
import type { Producto } from "@shared/types";
import { requiereEvidencia } from "@shared/schemas";
import { AlertaError } from "@/components/ui/alerta-error";
import { mensajeDeError } from "@/lib/errores";

interface FilaProducto {
  productoId: string;
  // null = aún sin capturar: al elegir un producto en modo "contenido" el campo queda vacío a
  // propósito, para que los ml/g se escriban conscientemente y no se confundan con "1 pieza".
  cantidad: number | null;
  // Solo en productos vendidos: precio unitario de venta, editable, con default el precio de
  // venta del producto (cobro v2, FR-002).
  precioUnitario?: number | null;
}

function filasValidas(lista: FilaProducto[]): { productoId: string; cantidad: number }[] {
  return lista
    .filter((f) => f.productoId && f.cantidad !== null && f.cantidad > 0)
    .map((f) => ({ productoId: f.productoId, cantidad: f.cantidad! }));
}

function ventasValidas(lista: FilaProducto[]): { productoId: string; cantidad: number; precioUnitario: number }[] {
  return lista
    .filter((f) => f.productoId && f.cantidad !== null && f.cantidad > 0)
    .map((f) => ({ productoId: f.productoId, cantidad: f.cantidad!, precioUnitario: f.precioUnitario ?? 0 }));
}

interface CierreCitaModalProps {
  citaId: string;
  onClose: () => void;
  /** Se llama cuando la cita cerrada sugiere una fecha de mantenimiento y la usuaria confirma agendarla ya. */
  onAgendarMantenimiento: (clienteId: string, fecha: string) => void;
}

export function CierreCitaModal({ citaId, onClose, onAgendarMantenimiento }: CierreCitaModalProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const { data: servicio } = useQuery({
    queryKey: ["abrirCierre", citaId],
    queryFn: () => window.api.serviciosRealizados.abrirCierre(citaId),
  });
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => window.api.config.obtener(),
  });
  // Anticipos ya pagados de esta cita (FR-005): el cierre pide solo el resto.
  const { data: cuenta } = useQuery({
    queryKey: ["estadoCuentaCita", citaId],
    queryFn: () => window.api.cobros.estadoCuentaCita(citaId),
  });
  const { data: receta = [] } = useQuery({
    queryKey: ["recetaServicio", servicio?.servicioCatalogoId],
    queryFn: () => window.api.serviciosCatalogo.listarReceta(servicio!.servicioCatalogoId),
    enabled: !!servicio?.servicioCatalogoId,
  });

  const [precio, setPrecio] = useState<number | null>(null);
  const [consumidos, setConsumidos] = useState<FilaProducto[]>([]);
  const recetaPrecargadaRef = useRef(false);

  useEffect(() => {
    if (recetaPrecargadaRef.current) return;
    if (receta.length === 0) return;
    recetaPrecargadaRef.current = true;
    setConsumidos(receta.map((r) => ({ productoId: r.productoId, cantidad: r.cantidadSugerida })));
  }, [receta]);
  const [vendidos, setVendidos] = useState<FilaProducto[]>([]);
  const [lineas, setLineas] = useState<LineaPagoCaptura[]>(LINEA_INICIAL);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);

  const precioEfectivo = precio ?? servicio?.precio ?? 0;
  // Cobro v2: total = servicio + productos vendidos; se cobra el total menos los anticipos. El
  // estatus (pagado / parcial / pendiente) lo deriva el servidor de estos números (FR-003).
  const totalProductos = ventasValidas(vendidos).reduce(
    (acc, v) => acc + Math.round(v.cantidad * v.precioUnitario * 100) / 100,
    0,
  );
  const total = Math.round((precioEfectivo + totalProductos) * 100) / 100;
  const anticipos = cuenta?.anticipos ?? 0;
  const porCobrar = Math.round((total - anticipos) * 100) / 100;
  const cobro = evaluarCobro(lineas, porCobrar);

  const subirComprobante = useMutation({
    // El main resuelve la carpeta del servicio y la crea si falta (clientas sin carpeta en disco).
    mutationFn: () => {
      if (!servicio) throw new Error("No se pudo abrir el servicio.");
      return window.api.archivos.subirComprobante(servicio.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["abrirCierre", citaId] });
      queryClient.invalidateQueries({ queryKey: ["comprobantesCita", citaId] });
    },
    onError: (e) => setError(mensajeDeError(e, "No se pudo subir el comprobante.")),
  });

  const cerrar = useMutation({
    mutationFn: (sinComprobanteAceptado: boolean) => {
      if (!servicio) throw new Error("No se pudo abrir el servicio.");
      return window.api.serviciosRealizados.cerrarCita({
        servicioRealizadoId: servicio.id,
        precio: precioEfectivo,
        productosConsumidos: filasValidas(consumidos),
        productosVendidos: ventasValidas(vendidos),
        pagos: lineasParaEnviar(lineas, porCobrar),
        observaciones,
        sinComprobanteAceptado,
      });
    },
    onSuccess: async (actualizado) => {
      queryClient.invalidateQueries({ queryKey: ["citas"] });
      queryClient.invalidateQueries({ queryKey: ["inventarioResumen"] });
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["mantenimientosNoProgramados"] });
      queryClient.invalidateQueries({ queryKey: ["estadoCuentaCita"] });
      queryClient.invalidateQueries({ queryKey: ["corteResumenPendiente"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardResumen"] });
      queryClient.invalidateQueries({ queryKey: ["resumenCliente"] });
      onClose();

      if (actualizado.proximaCitaSugerida) {
        const resultado = await confirm({
          titulo: "Agendar mantenimiento",
          mensaje: `${actualizado.clienteNombre} debería regresar el ${formatFecha(actualizado.proximaCitaSugerida)} para su próximo mantenimiento. ¿Quieres agendar esa cita ahora?`,
          confirmarLabel: "Agendar ahora",
          cancelarLabel: "Ahora no",
        });
        if (resultado === "confirmado") {
          onAgendarMantenimiento(actualizado.clienteId, actualizado.proximaCitaSugerida);
        }
      }
    },
    onError: (e) => setError(mensajeDeError(e, "No se pudo cerrar la cita.")),
  });

  function agregarFila(lista: FilaProducto[], setLista: (f: FilaProducto[]) => void) {
    setLista([...lista, { productoId: "", cantidad: null }]);
  }
  function actualizarFila(
    lista: FilaProducto[],
    setLista: (f: FilaProducto[]) => void,
    index: number,
    cambios: Partial<FilaProducto>,
  ) {
    setLista(lista.map((f, i) => (i === index ? { ...f, ...cambios } : f)));
  }
  function quitarFila(lista: FilaProducto[], setLista: (f: FilaProducto[]) => void, index: number) {
    setLista(lista.filter((_, i) => i !== index));
  }

  if (!servicio) {
    return (
      <Modal open onClose={onClose} title="Cerrar cita">
        <p className="text-sm text-ink-500">Preparando el cierre...</p>
      </Modal>
    );
  }

  const listoParaCerrar = !cobro.error && porCobrar >= -0.005;

  // Addendum 2026-11-05: el comprobante es evidencia opcional. Efectivo no pide nada; si algún
  // pago es con otro método y no hay comprobante, se confirma una vez antes de cerrar.
  async function alCerrar() {
    const sinEvidencia = !servicio!.tieneComprobante && requiereEvidencia(lineasParaEnviar(lineas, porCobrar));
    if (sinEvidencia) {
      const r = await confirm({
          titulo: "¿Continuar sin comprobante?",
          mensaje:
            "Este cobro no es en efectivo y no tiene comprobante. Si continúas, no tendrás evidencia de este pago.",
          confirmarLabel: "Continuar sin comprobante",
          cancelarLabel: "Volver",
        });
      if (r !== "confirmado") return;
    }
    cerrar.mutate(sinEvidencia);
  }

  const motivoBloqueo =
    porCobrar < -0.005
      ? `Los anticipos (${formatMoneda(anticipos)}) superan el total. Cancela el anticipo sobrante desde el detalle de la cita.`
      : cobro.error
        ? cobro.error
        : null;

  return (
    <Modal open onClose={onClose} title={`Cerrar cita · ${servicio.clienteNombre}`}>
      <div className="flex flex-col gap-5">
        <div className="rounded-xl bg-beige-100 p-3 text-sm">
          <p className="font-medium text-ink-900">
            {servicio.servicioNombre} · {servicio.codigoServicio}
          </p>
          <p className="text-xs text-ink-500">{servicio.fecha}</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Precio del servicio</label>
          <MoneyInput
            placeholder="0.00"
            value={precio ?? servicio.precio ?? 0}
            onValueChange={setPrecio}
          />
        </div>

        <ListaProductos
          titulo="Productos consumidos (insumos)"
          filas={consumidos}
          productos={productos}
          aplicarModoContenido
          onAgregar={() => agregarFila(consumidos, setConsumidos)}
          onActualizar={(i, c) => actualizarFila(consumidos, setConsumidos, i, c)}
          onQuitar={(i) => quitarFila(consumidos, setConsumidos, i)}
        />

        <ListaProductos
          titulo="Productos vendidos (venta adicional)"
          filas={vendidos}
          productos={productos}
          conPrecio
          onAgregar={() => agregarFila(vendidos, setVendidos)}
          onActualizar={(i, c) => actualizarFila(vendidos, setVendidos, i, c)}
          onQuitar={(i) => quitarFila(vendidos, setVendidos, i)}
        />

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Pago</h3>
          <div className="mb-3 flex flex-col gap-1 rounded-xl bg-beige-100 p-3 text-sm">
            <div className="flex justify-between text-ink-700">
              <span>Servicio</span>
              <span className="tabular-nums">{formatMoneda(precioEfectivo)}</span>
            </div>
            {totalProductos > 0 && (
              <div className="flex justify-between text-ink-700">
                <span>Productos vendidos</span>
                <span className="tabular-nums">{formatMoneda(totalProductos)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-ink-900">
              <span>Total</span>
              <span className="tabular-nums">{formatMoneda(total)}</span>
            </div>
            {anticipos > 0 && (
              <div className="flex justify-between text-ink-700">
                <span>Anticipo ya pagado</span>
                <span className="tabular-nums">− {formatMoneda(anticipos)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-beige-300 pt-1 font-semibold text-ink-900">
              <span>Por cobrar</span>
              <span className="tabular-nums">{formatMoneda(Math.max(0, porCobrar))}</span>
            </div>
          </div>
          <LineasPago
            lineas={lineas}
            onChange={setLineas}
            metodos={config?.metodosPago ?? []}
            porCobrar={porCobrar}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Observaciones</label>
          <Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        <div className="rounded-xl border border-beige-300 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Comprobante de pago</h3>
          {servicio.tieneComprobante ? (
            <div className="flex items-center justify-between">
              <Badge variant="success">Comprobante subido</Badge>
              {servicio.carpetaPath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.api.carpetas.abrirCarpeta(servicio.carpetaPath!)}
                >
                  <FolderOpen size={14} /> Ver carpeta
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={subirComprobante.isPending}
                onClick={() => subirComprobante.mutate()}
              >
                <Upload size={14} /> Subir comprobante
              </Button>
              <p className="text-xs text-ink-500">
                Opcional: guarda la foto del voucher o de la transferencia como evidencia. En efectivo no
                hace falta.
              </p>
            </div>
          )}
        </div>

        {error && <AlertaError mensaje={error} />}
        {!error && motivoBloqueo && <p className="text-xs text-ink-500">{motivoBloqueo}</p>}

        <Button disabled={!listoParaCerrar || cerrar.isPending} onClick={alCerrar}>
          <Lock size={16} /> Cerrar cita
        </Button>
      </div>
    </Modal>
  );
}

function ListaProductos({
  titulo,
  filas,
  productos,
  aplicarModoContenido = false,
  conPrecio = false,
  onAgregar,
  onActualizar,
  onQuitar,
}: {
  titulo: string;
  filas: FilaProducto[];
  productos: Producto[];
  /** true en la lista de insumos: los productos en modo "contenido" se capturan en ml/g. */
  aplicarModoContenido?: boolean;
  /** true en productos vendidos: muestra el precio unitario de venta, editable (DIN-A5). */
  conPrecio?: boolean;
  onAgregar: () => void;
  onActualizar: (index: number, cambios: Partial<FilaProducto>) => void;
  onQuitar: (index: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{titulo}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onAgregar}>
          <Plus size={14} /> Agregar
        </Button>
      </div>
      {filas.length === 0 && <p className="text-xs text-ink-500">Ninguno agregado.</p>}
      <div className="flex flex-col gap-2">
        {filas.map((fila, i) => {
          const prod = productos.find((p) => p.id === fila.productoId);
          // En la lista de insumos, un producto en modo "contenido" se captura en ml/g y descuenta
          // la fracción de pieza (ej. 2 ml de una ampolleta de 10 ml). El resto se captura en piezas.
          const porContenido =
            aplicarModoContenido && prod?.modoConsumo === "contenido" && !!prod.contenidoCantidad;
          const unidad = prod?.contenidoUnidad || "ml";
          const pieza = (prod?.presentacion || "pieza").toLowerCase();
          const equivalentePiezas =
            porContenido && prod?.contenidoCantidad ? (fila.cantidad ?? 0) / prod.contenidoCantidad : 0;
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex gap-2">
                <Select
                  className="flex-1"
                  value={fila.productoId}
                  onChange={(e) => {
                    // Al cambiar de producto, la cantidad se reinicia según su modo: los de
                    // "contenido" quedan vacíos (los ml/g se escriben a propósito, sin un "1"
                    // ambiguo precargado); los de pieza arrancan en 1, que es lo habitual.
                    const nuevo = productos.find((p) => p.id === e.target.value);
                    const nuevoPorContenido =
                      aplicarModoContenido && nuevo?.modoConsumo === "contenido" && !!nuevo.contenidoCantidad;
                    onActualizar(i, {
                      productoId: e.target.value,
                      cantidad: nuevoPorContenido ? null : 1,
                      ...(conPrecio ? { precioUnitario: nuevo?.precioVenta ?? 0 } : {}),
                    });
                  }}
                >
                  <option value="">Selecciona un producto</option>
                  {productos.filter((p) => p.activo || p.id === fila.productoId).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
                {/* key por producto: NumberInput guarda su texto interno y solo se resincroniza
                    al re-montarse, así el campo refleja el reinicio de cantidad al cambiar. */}
                <NumberInput
                  key={fila.productoId || "sin-producto"}
                  className="w-28"
                  allowNull
                  placeholder={porContenido ? `${unidad} usados` : "piezas"}
                  value={fila.cantidad}
                  onValueChange={(v) => onActualizar(i, { cantidad: v })}
                />
                {conPrecio && (
                  <div className="w-32" title="Precio unitario de venta">
                    <MoneyInput
                      key={`precio-${fila.productoId || "sin-producto"}`}
                      placeholder="Precio c/u"
                      value={fila.precioUnitario ?? 0}
                      onValueChange={(v) => onActualizar(i, { precioUnitario: v })}
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-ink-400 hover:text-danger-500"
                  onClick={() => onQuitar(i)}
                  title="Quitar"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              {porContenido && (
                <p className="pl-1 text-xs text-ink-500">
                  {fila.cantidad === null
                    ? `Escribe los ${unidad} usados (cada ${pieza} trae ${prod!.contenidoCantidad} ${unidad})`
                    : `${unidad} usados · ≈ ${equivalentePiezas.toFixed(2)} ${pieza}${equivalentePiezas === 1 ? "" : "s"}`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
