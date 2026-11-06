import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import { formatMoneda } from "@/lib/format";
import type { LineaPago } from "@shared/schemas";

/** Una línea en captura. `monto: null` en la PRIMERA línea = "lo que se debe" (sigue al total). */
export interface LineaPagoCaptura {
  metodoPago: string;
  monto: number | null;
}

export const LINEA_INICIAL: LineaPagoCaptura[] = [{ metodoPago: "", monto: null }];

const TOL = 0.005;

/** Mismo redondeo que el servidor (cobros.redondearDinero, BR-007), con Number.EPSILON. */
export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Monto efectivo de cada línea: la primera, sin tocar, propone lo que se debe. */
export function montosEfectivos(lineas: LineaPagoCaptura[], porCobrar: number): number[] {
  return lineas.map((l, i) => l.monto ?? (i === 0 ? Math.max(0, porCobrar) : 0));
}

/** Líneas listas para enviar: solo las de monto > 0. */
export function lineasParaEnviar(lineas: LineaPagoCaptura[], porCobrar: number): LineaPago[] {
  const montos = montosEfectivos(lineas, porCobrar);
  return lineas
    .map((l, i) => ({ metodoPago: l.metodoPago, monto: redondear(montos[i]) }))
    .filter((l) => l.monto > 0);
}

/**
 * Estado del cobro en vivo (spec §8, paso 5). `error` bloquea el envío; `leyenda` es lo que
 * quedará: la usuaria nunca elige "pagado" o "parcial", el servidor lo deriva igual que aquí.
 */
export function evaluarCobro(lineas: LineaPagoCaptura[], porCobrar: number, conTope = true) {
  const montos = montosEfectivos(lineas, porCobrar);
  const suma = redondear(montos.reduce((a, m) => a + m, 0));
  const debe = Math.max(0, redondear(porCobrar));
  const sinMetodo = lineas.some((l, i) => montos[i] > 0 && !l.metodoPago);
  let error: string | null = null;
  if (conTope && suma > debe + TOL) error = `El pago excede lo que se debe (${formatMoneda(debe)}).`;
  else if (sinMetodo) error = "Elige el método de cada pago.";
  else if (!conTope && suma <= 0) error = "Escribe el monto del anticipo.";
  let leyenda: { texto: string; tono: "success" | "warning" | "neutral" };
  // Anticipo: la cita aún no tiene total, no hay tope; el cierre rechaza si los anticipos lo superan.
  if (!conTope) leyenda = { texto: `Anticipo de ${formatMoneda(suma)}`, tono: "neutral" };
  else if (debe <= TOL) leyenda = { texto: "No hay nada por cobrar", tono: "success" };
  else if (suma >= debe - TOL) leyenda = { texto: "Pagado completo", tono: "success" };
  else if (suma > 0) leyenda = { texto: `Queda debiendo ${formatMoneda(redondear(debe - suma))}`, tono: "warning" };
  else leyenda = { texto: `Sin pago: queda debiendo ${formatMoneda(debe)}`, tono: "warning" };
  return { suma, error, leyenda };
}

/** Captura de 1..N pagos (método + monto). "Agregar otro método" divide el cobro (FR-001). */
export function LineasPago({
  lineas,
  onChange,
  metodos,
  porCobrar,
  conTope = true,
}: {
  lineas: LineaPagoCaptura[];
  onChange: (lineas: LineaPagoCaptura[]) => void;
  metodos: string[];
  porCobrar: number;
  /** false para anticipos: no hay total contra el cual comparar. */
  conTope?: boolean;
}) {
  const montos = montosEfectivos(lineas, porCobrar);
  const { leyenda, error } = evaluarCobro(lineas, porCobrar, conTope);

  function actualizar(i: number, cambios: Partial<LineaPagoCaptura>) {
    onChange(lineas.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  }

  return (
    <div className="flex flex-col gap-2">
      {lineas.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Select className="flex-1" value={l.metodoPago} onChange={(e) => actualizar(i, { metodoPago: e.target.value })}>
            <option value="">Método de pago</option>
            {metodos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <div className="w-36">
            <MoneyInput placeholder="0.00" value={montos[i]} onValueChange={(v) => actualizar(i, { monto: v ?? 0 })} />
          </div>
          {lineas.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-ink-400 hover:text-danger-500"
              title="Quitar este pago"
              onClick={() => onChange(lineas.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            // Al dividir, la primera línea deja de "seguir al total": se fija en lo que mostraba y la
            // nueva línea propone lo que falta.
            const fijadas = lineas.map((x, j) => ({ ...x, monto: montos[j] }));
            const falta = Math.max(0, redondear(porCobrar - montos.reduce((a, m) => a + m, 0)));
            onChange([...fijadas, { metodoPago: "", monto: falta }]);
          }}
        >
          <Plus size={14} /> Agregar otro método
        </Button>
        <span
          className={
            error
              ? "text-sm font-medium text-danger-500"
              : leyenda.tono === "success"
                ? "text-sm font-medium text-success-500"
                : "text-sm font-medium text-ink-700"
          }
        >
          {error ?? leyenda.texto}
        </span>
      </div>
    </div>
  );
}
