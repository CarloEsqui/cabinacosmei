import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cake, History, Mail, Phone, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Expandable } from "@/components/ui/expandable";
import { SelectBuscable } from "@/components/ui/select-buscable";
import { AlertaError } from "@/components/ui/alerta-error";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/format";
import { mensajeDeError } from "@/lib/errores";
import { AvisoPrecaucion } from "@/components/ficha/AvisoPrecaucion";
import { FotosTratamiento } from "@/components/ficha/FotosTratamiento";
import { NotasTratamiento } from "@/components/ficha/NotasTratamiento";
import {
  ANTECEDENTES_CLINICOS,
  BOLSAS_TIPO,
  CUIDADO_PIEL,
  EXPOSICION_SOLAR,
  HABITOS,
  PREGUNTAS_SI_NO,
  SEXOS,
  TIPOLOGIA,
  fichaVacia,
  jsonCanonico,
  normalizarFicha,
  type FichaDatos,
  type PreguntaSiNo,
  type Respuesta,
} from "@shared/fichaClinica";
import type { VersionFicha } from "@shared/types";

type Paso = "datos" | "antecedentes" | "analisis" | "tratamientos";

interface Borrador {
  sexo: "F" | "M" | null;
  ocupacion: string;
  datos: FichaDatos;
}

const canonico = (b: Borrador) =>
  jsonCanonico({ sexo: b.sexo, ocupacion: b.ocupacion.trim() || null, datos: normalizarFicha(b.datos) });

function edad(fechaNacimiento: string | null | undefined): number | null {
  if (!fechaNacimiento) return null;
  const [a, m, d] = fechaNacimiento.split("-").map(Number);
  if (!a || !m || !d) return null;
  const hoy = new Date();
  let e = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) e -= 1;
  return e >= 0 ? e : null;
}

const fechaHora = (msEpoch: number) =>
  new Date(msEpoch).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Ficha clínica facial (spec .notes/spec-ficha-clinica-2026-11-05.md). DATOS DE SALUD SENSIBLES.
 * Cuatro pasos en cualquier orden con su conteo de pendientes (FR-002), Sí/No tri-estado con
 * "Especifique" (FR-003), chips (FR-004), versiones de solo lectura (FR-006), tratamientos con notas
 * y fotos (FR-007) y borrado sin PIN con confirmación (FR-011).
 */
export function FichaClinicaModal({ clienteId, onClose }: { clienteId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const { data: cliente } = useQuery({
    queryKey: ["clienteExpediente", clienteId],
    queryFn: () => window.api.clientes.obtenerExpediente(clienteId),
  });
  // FIC-B6: el borrador se inicializa solo con una lectura fresca (no con una caché invalidada ni
  // con un error, que se confundiría con "sin ficha").
  const { data: ficha, isSuccess, isFetching, isError } = useQuery({
    queryKey: ["fichaClinica", clienteId],
    queryFn: () => window.api.fichas.obtener(clienteId),
    refetchOnMount: "always",
  });
  const cargada = isSuccess && !isFetching;

  const [paso, setPaso] = useState<Paso>("datos");
  const [verVersiones, setVerVersiones] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [base, setBase] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  // El `updatedAt` de la ficha que se abrió: concurrencia optimista (Gate, condición 4).
  const updatedAtAbierto = useRef<number | null>(null);

  useEffect(() => {
    if (!cargada || borrador) return;
    const b: Borrador = ficha
      ? { sexo: ficha.sexo, ocupacion: ficha.ocupacion ?? "", datos: ficha.datos }
      : { sexo: null, ocupacion: "", datos: fichaVacia() };
    updatedAtAbierto.current = ficha?.updatedAt ?? null;
    setBorrador(b);
    setBase(canonico(b));
  }, [cargada, ficha, borrador]);

  // FIC-M2: notas de tratamiento escritas y sin guardar (viven en cada NotasTratamiento).
  const [notasSinGuardar, setNotasSinGuardar] = useState<Set<string>>(new Set());
  const marcarNotas = (servicioId: string, pendiente: boolean) =>
    setNotasSinGuardar((prev) => {
      if (prev.has(servicioId) === pendiente) return prev;
      const s = new Set(prev);
      if (pendiente) s.add(servicioId);
      else s.delete(servicioId);
      return s;
    });

  const sucio = borrador !== null && canonico(borrador) !== base;

  const guardar = useMutation({
    mutationFn: () =>
      window.api.fichas.guardar({
        clienteId,
        sexo: borrador!.sexo,
        ocupacion: borrador!.ocupacion.trim() || null,
        datos: borrador!.datos,
        updatedAtEsperado: updatedAtAbierto.current,
      }),
    onSuccess: (guardada) => {
      updatedAtAbierto.current = guardada.updatedAt;
      const b: Borrador = { sexo: guardada.sexo, ocupacion: guardada.ocupacion ?? "", datos: guardada.datos };
      setBorrador(b);
      setBase(canonico(b));
      setError(null);
      queryClient.setQueryData(["fichaClinica", clienteId], guardada);
      for (const key of ["fichaAviso", "fichaVersiones"]) queryClient.invalidateQueries({ queryKey: [key, clienteId] });
      toast.success("Ficha clínica guardada.");
    },
    onError: (e) => setError(mensajeDeError(e, "No se pudo guardar la ficha.")),
  });

  async function cerrar() {
    if (sucio || notasSinGuardar.size > 0) {
      const r = await confirm({
        titulo: "Cambios sin guardar",
        mensaje:
          sucio && notasSinGuardar.size > 0
            ? "Hay cambios en la ficha y notas de tratamiento sin guardar. ¿Descartarlos?"
            : sucio
              ? "¿Descartar los cambios de la ficha?"
              : "Hay notas de tratamiento sin guardar. ¿Descartarlas?",
        confirmarLabel: "Descartar",
        cancelarLabel: "Seguir editando",
      });
      if (r !== "confirmado") return;
    }
    onClose();
  }

  async function borrar() {
    const r = await confirm({
      titulo: "Borrar ficha clínica",
      mensaje:
        "Se borran la ficha, todas sus versiones anteriores y las fotos de antes y después de la clienta (del registro y de la carpeta). Las notas de los tratamientos se conservan. No se puede deshacer. Ojo: las copias de respaldo creadas antes de hoy todavía la contienen; si se restaura una, la ficha vuelve.",
      confirmarLabel: "Borrar ficha",
      cancelarLabel: "Volver",
    });
    if (r !== "confirmado") return;
    try {
      const res = await window.api.fichas.borrar(clienteId);
      for (const key of ["fichaClinica", "fichaAviso", "fichaVersiones", "fichaTratamientos", "fotosServicio"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(
        res.archivosNoBorrados > 0
          ? `Ficha borrada. ${res.archivosNoBorrados} foto(s) no se pudieron borrar de la carpeta.`
          : "Ficha clínica borrada.",
      );
      onClose();
    } catch (e) {
      toast.error(mensajeDeError(e, "No se pudo borrar la ficha."));
    }
  }

  if (!cliente || !borrador) {
    return (
      <Modal open onClose={onClose} title="Ficha clínica" ancho="2xl">
        {isError ? (
          <AlertaError mensaje="No se pudo cargar la ficha clínica. Cierra y vuelve a abrirla." />
        ) : (
          <p className="text-sm text-ink-500">Cargando…</p>
        )}
      </Modal>
    );
  }

  const set = (cambios: Partial<Borrador>) => setBorrador({ ...borrador, ...cambios });
  const setDatos = (cambios: Partial<FichaDatos>) => set({ datos: { ...borrador.datos, ...cambios } });
  const pendientes = contarPendientes(borrador);
  const edadClienta = edad(cliente.fechaNacimiento);

  return (
    <Modal open onClose={cerrar} title={ficha ? "Ficha clínica" : "Llenar ficha clínica"} ancho="2xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl bg-beige-100 p-4">
          <Avatar nombre={cliente.nombreCompleto} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-ink-900">{cliente.nombreCompleto}</p>
            <p className="text-sm text-ink-500">
              {cliente.codigoCliente}
              {ficha ? ` · actualizada ${fechaHora(ficha.updatedAt)}` : " · sin ficha"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
              {cliente.telefono && (
                <span className="flex items-center gap-1">
                  <Phone size={14} /> {cliente.telefono}
                </span>
              )}
              {cliente.correo && (
                <span className="flex min-w-0 items-center gap-1">
                  <Mail size={14} className="shrink-0" /> <span className="truncate">{cliente.correo}</span>
                </span>
              )}
              {cliente.fechaNacimiento && (
                <span className="flex items-center gap-1">
                  <Cake size={14} /> {formatFecha(cliente.fechaNacimiento)}
                  {edadClienta !== null ? ` · ${edadClienta} años` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {ficha && <AvisoPrecaucion clienteId={clienteId} />}

        {verVersiones ? (
          <Versiones clienteId={clienteId} onVolver={() => setVerVersiones(false)} />
        ) : (
          <>
            <nav className="flex flex-wrap gap-1.5" aria-label="Pasos de la ficha">
              {(
                [
                  ["datos", "1. Datos"],
                  ["antecedentes", "2. Antecedentes"],
                  ["analisis", "3. Análisis estético"],
                  ["tratamientos", "4. Tratamientos y casa"],
                ] as [Paso, string][]
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setPaso(valor)}
                  aria-current={paso === valor ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                    paso === valor
                      ? "border-jacaranda-500 bg-jacaranda-50 font-medium text-jacaranda-700"
                      : "border-beige-300 bg-beige-50 text-ink-700 hover:bg-beige-100",
                  )}
                >
                  {etiqueta}
                  {pendientes[valor] > 0 && (
                    <span className="rounded-full bg-beige-200 px-1.5 text-[11px] text-ink-500" title="Sin responder">
                      {pendientes[valor]}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {paso === "datos" && (
              <div className="flex flex-col gap-4">
                <Campo etiqueta="Sexo">
                  <Chips
                    opciones={SEXOS}
                    elegidos={borrador.sexo ? [borrador.sexo] : []}
                    onCambio={(v) => set({ sexo: (v[0] as "F" | "M" | undefined) ?? null })}
                  />
                </Campo>
                <Campo etiqueta="Ocupación">
                  <Input value={borrador.ocupacion} maxLength={120} onChange={(e) => set({ ocupacion: e.target.value })} />
                </Campo>
                <p className="text-xs text-ink-500">
                  Nombre, teléfono, correo y fecha de nacimiento se editan con "Editar datos" de la clienta.
                </p>
              </div>
            )}

            {paso === "antecedentes" && (
              <div className="flex flex-col gap-5">
                <Grupo titulo="Antecedentes clínicos">
                  {ANTECEDENTES_CLINICOS.map((p) => (
                    <FilaSiNo key={p.clave} pregunta={p} datos={borrador.datos} onCambio={setDatos} />
                  ))}
                </Grupo>
                <Grupo titulo="Cuidado de la piel">
                  <FilaSiNo pregunta={CUIDADO_PIEL[0]} datos={borrador.datos} onCambio={setDatos} />
                  <Campo etiqueta="Cosméticos de uso actual">
                    <AreaTexto valor={borrador.datos.cosmeticosActuales} onCambio={(v) => setDatos({ cosmeticosActuales: v })} />
                  </Campo>
                  <Campo etiqueta="Nivel de exposición solar">
                    <Chips
                      opciones={EXPOSICION_SOLAR}
                      elegidos={borrador.datos.exposicionSolar ? [borrador.datos.exposicionSolar] : []}
                      onCambio={(v) => setDatos({ exposicionSolar: v[0] ?? null })}
                    />
                  </Campo>
                  <FilaSiNo pregunta={CUIDADO_PIEL[1]} datos={borrador.datos} onCambio={setDatos} />
                </Grupo>
                <Grupo titulo="Hábitos tóxicos">
                  {HABITOS.map((p) => (
                    <FilaSiNo key={p.clave} pregunta={p} datos={borrador.datos} onCambio={setDatos} />
                  ))}
                  <Campo etiqueta="Otros">
                    <AreaTexto valor={borrador.datos.habitosOtros} onCambio={(v) => setDatos({ habitosOtros: v })} />
                  </Campo>
                </Grupo>
              </div>
            )}

            {paso === "analisis" && (
              <div className="flex flex-col gap-4">
                <Campo etiqueta="Motivo de la consulta">
                  <AreaTexto valor={borrador.datos.motivoConsulta} onCambio={(v) => setDatos({ motivoConsulta: v })} />
                </Campo>
                <Grupo titulo="Tipología cutánea">
                  {TIPOLOGIA.map((g) => (
                    <Campo key={g.clave} etiqueta={`${g.etiqueta}${g.multiple ? "" : " (una)"}`}>
                      <Chips
                        opciones={g.opciones}
                        multiple={g.multiple}
                        elegidos={borrador.datos.tipologia[g.clave] ?? []}
                        onCambio={(v) => setDatos({ tipologia: { ...borrador.datos.tipologia, [g.clave]: v } })}
                      />
                    </Campo>
                  ))}
                  <Campo etiqueta="Bolsas palpebrales">
                    <div className="flex flex-wrap items-center gap-3">
                      <SiNo
                        valor={borrador.datos.bolsas.respuesta}
                        onCambio={(r) => setDatos({ bolsas: { respuesta: r, tipo: r === "si" ? borrador.datos.bolsas.tipo : null } })}
                      />
                      {borrador.datos.bolsas.respuesta === "si" && (
                        <Chips
                          opciones={BOLSAS_TIPO}
                          elegidos={borrador.datos.bolsas.tipo ? [borrador.datos.bolsas.tipo] : []}
                          onCambio={(v) => setDatos({ bolsas: { respuesta: "si", tipo: v[0] ?? null } })}
                        />
                      )}
                    </div>
                  </Campo>
                </Grupo>
              </div>
            )}

            {/* Montado siempre (oculto fuera de su paso) para no perder notas escritas al cambiar de paso (FIC-M2). */}
            <div className={cn("flex flex-col gap-5", paso !== "tratamientos" && "hidden")}>
              <Tratamientos clienteId={clienteId} onNotasPendientes={marcarNotas} />
              {paso === "tratamientos" && <Recomendacion datos={borrador.datos} onCambio={setDatos} />}
            </div>

            {error && <AlertaError mensaje={error} />}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-beige-200 pt-3">
              <div className="flex gap-1">
                {ficha && (
                  <Button variant="ghost" size="sm" onClick={() => setVerVersiones(true)}>
                    <History size={14} /> Versiones anteriores
                  </Button>
                )}
                {ficha && (
                  <Button variant="ghost" size="sm" className="text-ink-400 hover:text-danger-500" onClick={borrar}>
                    <Trash2 size={14} /> Borrar ficha clínica
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={cerrar}>
                  Cerrar
                </Button>
                <Button disabled={!sucio || guardar.isPending} onClick={() => guardar.mutate()}>
                  Guardar
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** FR-002: preguntas sin responder por paso. Los grupos de opción múltiple pueden quedar vacíos. */
function contarPendientes(b: Borrador): Record<Paso, number> {
  const d = b.datos;
  const sinResp = (claves: PreguntaSiNo[]) => claves.filter((p) => !d.respuestas[p.clave]?.respuesta).length;
  return {
    datos: (b.sexo ? 0 : 1) + (b.ocupacion.trim() ? 0 : 1),
    antecedentes: sinResp(PREGUNTAS_SI_NO) + (d.exposicionSolar ? 0 : 1),
    analisis:
      (d.motivoConsulta?.trim() ? 0 : 1) +
      TIPOLOGIA.filter((g) => !g.multiple && (d.tipologia[g.clave] ?? []).length === 0).length +
      (d.bolsas.respuesta ? 0 : 1),
    tratamientos: 0,
  };
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{titulo}</h3>
      {children}
    </section>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-500">{etiqueta}</span>
      {children}
    </div>
  );
}

function AreaTexto({ valor, onCambio }: { valor: string | null; onCambio: (v: string | null) => void }) {
  return (
    <textarea
      value={valor ?? ""}
      onChange={(e) => onCambio(e.target.value === "" ? null : e.target.value)}
      rows={2}
      maxLength={2000}
      className="w-full resize-y rounded-xl border border-beige-300 bg-beige-50 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-jacaranda-400"
    />
  );
}

/** Sí / No como par; pulsar la opción elegida la regresa a "sin responder" (§12). */
function SiNo({ valor, onCambio }: { valor: Respuesta; onCambio: (r: Respuesta) => void }) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-beige-300" role="group">
      {(["si", "no"] as const).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={valor === r}
          onClick={() => onCambio(valor === r ? null : r)}
          className={cn(
            "h-9 w-12 text-sm",
            valor === r
              ? r === "si"
                ? "bg-jacaranda-500 font-medium text-white"
                : "bg-ink-700 font-medium text-white"
              : "bg-beige-50 text-ink-700 hover:bg-beige-100",
          )}
        >
          {r === "si" ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );
}

function FilaSiNo({
  pregunta,
  datos,
  onCambio,
}: {
  pregunta: PreguntaSiNo;
  datos: FichaDatos;
  onCambio: (c: Partial<FichaDatos>) => void;
}) {
  const actual = datos.respuestas[pregunta.clave] ?? { respuesta: null, especifique: null };
  const especRef = useRef<HTMLInputElement>(null);
  const actualizar = (r: Partial<typeof actual>) =>
    onCambio({ respuestas: { ...datos.respuestas, [pregunta.clave]: { ...actual, ...r } } });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-900">{pregunta.etiqueta}</span>
        <SiNo
          valor={actual.respuesta}
          onCambio={(r) => {
            // BR-004: al dejar de ser Sí, el "Especifique" se descarta.
            actualizar({ respuesta: r, especifique: r === "si" ? actual.especifique : null });
            if (r === "si" && pregunta.especifique) requestAnimationFrame(() => especRef.current?.focus());
          }}
        />
      </div>
      {pregunta.especifique && (
        <Expandable open={actual.respuesta === "si"}>
          <Input
            ref={especRef}
            placeholder={pregunta.especifique}
            maxLength={500}
            value={actual.especifique ?? ""}
            onChange={(e) => actualizar({ especifique: e.target.value })}
          />
        </Expandable>
      )}
    </div>
  );
}

function Chips({
  opciones,
  elegidos,
  onCambio,
  multiple = false,
}: {
  opciones: { valor: string; etiqueta: string }[];
  elegidos: string[];
  onCambio: (v: string[]) => void;
  multiple?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const activo = elegidos.includes(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activo}
            onClick={() =>
              onCambio(
                multiple
                  ? activo
                    ? elegidos.filter((v) => v !== o.valor)
                    : [...elegidos, o.valor]
                  : activo
                    ? []
                    : [o.valor],
              )
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              activo
                ? "border-jacaranda-500 bg-jacaranda-50 font-medium text-jacaranda-700"
                : "border-beige-300 bg-beige-50 text-ink-700 hover:bg-beige-100",
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/** FR-007: tratamientos en cabina, numerados como en el papel, con notas y fotos. */
function Tratamientos({
  clienteId,
  onNotasPendientes,
}: {
  clienteId: string;
  onNotasPendientes: (servicioId: string, pendiente: boolean) => void;
}) {
  const { data: tratamientos } = useQuery({
    queryKey: ["fichaTratamientos", clienteId],
    queryFn: () => window.api.fichas.tratamientos(clienteId),
  });
  return (
    <Grupo titulo="Tratamientos en cabina">
      {!tratamientos ? (
        <p className="text-sm text-ink-500">Cargando…</p>
      ) : tratamientos.length === 0 ? (
        <p className="text-sm text-ink-500">Aún no hay tratamientos cerrados.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {tratamientos.map((t) => (
            <div key={t.servicioRealizadoId} className="flex flex-col gap-2 rounded-xl border border-beige-300 p-3">
              <p className="text-sm font-medium text-ink-900">
                {t.numero}° · {formatFecha(t.fecha)} · {t.servicioNombre}
                <span className="ml-1 text-xs font-normal text-ink-500">{t.codigoServicio}</span>
              </p>
              <NotasTratamiento
                servicioRealizadoId={t.servicioRealizadoId}
                inicial={t.observaciones}
                onPendiente={(p) => onNotasPendientes(t.servicioRealizadoId, p)}
              />
              <FotosTratamiento servicioRealizadoId={t.servicioRealizadoId} fotos={t.fotos} />
            </div>
          ))}
        </div>
      )}
    </Grupo>
  );
}

/** FR-008: productos activos a la venta + texto libre. Se copia el nombre (§10). */
function Recomendacion({ datos, onCambio }: { datos: FichaDatos; onCambio: (c: Partial<FichaDatos>) => void }) {
  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => window.api.productos.listar(),
  });
  const elegidos = datos.recomendacion.productos;
  const disponibles = useMemo(
    () =>
      productos
        .filter((p) => p.activo && (p.precioVenta ?? 0) > 0 && !elegidos.some((e) => e.productoId === p.id))
        .map((p) => ({ value: p.id, label: p.nombre, detalle: p.linea ?? undefined })),
    [productos, elegidos],
  );
  const set = (r: Partial<FichaDatos["recomendacion"]>) => onCambio({ recomendacion: { ...datos.recomendacion, ...r } });

  return (
    <Grupo titulo="Recomendación para casa">
      <SelectBuscable
        value=""
        placeholder="Agregar un producto"
        aria-label="Producto recomendado"
        opciones={disponibles}
        onChange={(id) => {
          const p = productos.find((x) => x.id === id);
          if (p) set({ productos: [...elegidos, { productoId: p.id, nombre: p.nombre }] });
        }}
      />
      {elegidos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {elegidos.map((p) => (
            <span key={p.productoId} className="flex items-center gap-1 rounded-full bg-jacaranda-50 px-3 py-1 text-sm text-jacaranda-700">
              {p.nombre}
              <button
                type="button"
                title="Quitar"
                onClick={() => set({ productos: elegidos.filter((x) => x.productoId !== p.productoId) })}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <Campo etiqueta="Indicaciones">
        <AreaTexto valor={datos.recomendacion.texto} onCambio={(v) => set({ texto: v })} />
      </Campo>
    </Grupo>
  );
}

/** FR-006: versiones anteriores, solo lectura, cada una con su rango de vigencia. */
function Versiones({ clienteId, onVolver }: { clienteId: string; onVolver: () => void }) {
  const { data: versiones } = useQuery({
    queryKey: ["fichaVersiones", clienteId],
    queryFn: () => window.api.fichas.versiones(clienteId),
  });
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Versiones anteriores</h3>
        <Button variant="ghost" size="sm" onClick={onVolver}>
          Volver a la ficha
        </Button>
      </div>
      {!versiones ? (
        <p className="text-sm text-ink-500">Cargando…</p>
      ) : versiones.length === 0 ? (
        <p className="text-sm text-ink-500">Todavía no hay versiones anteriores: la ficha no ha cambiado desde que se llenó.</p>
      ) : (
        versiones.map((v) => (
          <div key={v.id} className="rounded-xl border border-beige-300">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-ink-900"
              onClick={() => setAbierta(abierta === v.id ? null : v.id)}
            >
              <span>
                Vigente del {fechaHora(v.vigenteDesde)} al {fechaHora(v.vigenteHasta)}
              </span>
              <span className="text-xs text-ink-500">{abierta === v.id ? "Ocultar" : "Ver"}</span>
            </button>
            {abierta === v.id && (
              <div className="border-t border-beige-200 p-3">
                <ResumenVersion version={v} />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function ResumenVersion({ version }: { version: VersionFicha }) {
  if (!version.datos) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-ink-500">Versión con formato anterior; se muestra tal cual se guardó.</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-ink-700">{version.datosCrudos}</pre>
      </div>
    );
  }
  const d = version.datos;
  const respondidas = PREGUNTAS_SI_NO.filter((p) => d.respuestas[p.clave]?.respuesta);
  const fila = (k: string, v: string) => (
    <div key={k} className="flex justify-between gap-3 text-sm">
      <span className="text-ink-500">{k}</span>
      <span className="text-right text-ink-900">{v}</span>
    </div>
  );
  const etiquetaOpcion = (grupo: (typeof TIPOLOGIA)[number], valor: string) =>
    grupo.opciones.find((o) => o.valor === valor)?.etiqueta ?? valor;
  return (
    <div className="flex flex-col gap-1">
      {fila("Sexo", version.sexo ?? "—")}
      {fila("Ocupación", version.ocupacion ?? "—")}
      {respondidas.map((p) => {
        const r = d.respuestas[p.clave];
        return fila(p.etiqueta, `${r.respuesta === "si" ? "Sí" : "No"}${r.especifique ? ` — ${r.especifique}` : ""}`);
      })}
      {d.cosmeticosActuales && fila("Cosméticos de uso actual", d.cosmeticosActuales)}
      {d.exposicionSolar && fila("Exposición solar", EXPOSICION_SOLAR.find((o) => o.valor === d.exposicionSolar)?.etiqueta ?? d.exposicionSolar)}
      {d.habitosOtros && fila("Otros hábitos", d.habitosOtros)}
      {d.motivoConsulta && fila("Motivo de la consulta", d.motivoConsulta)}
      {TIPOLOGIA.filter((g) => (d.tipologia[g.clave] ?? []).length > 0).map((g) =>
        fila(g.etiqueta, d.tipologia[g.clave].map((v) => etiquetaOpcion(g, v)).join(", ")),
      )}
      {d.bolsas.respuesta &&
        fila("Bolsas palpebrales", d.bolsas.respuesta === "si" ? `Sí${d.bolsas.tipo ? ` — ${BOLSAS_TIPO.find((o) => o.valor === d.bolsas.tipo)?.etiqueta}` : ""}` : "No")}
      {d.recomendacion.productos.length > 0 && fila("Para casa", d.recomendacion.productos.map((p) => p.nombre).join(", "))}
      {d.recomendacion.texto && fila("Indicaciones", d.recomendacion.texto)}
    </div>
  );
}
