import { useQuery } from "@tanstack/react-query";
import { Drawer } from "@/components/ui/drawer";
import { formatFecha, formatMoneda } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Drill-down de "Cuentas por cobrar": quién debe, cuánto, por qué servicio y desde cuándo — el
 * ejemplo exacto del documento (clic en la cifra → drawer con clientas, saldo, antigüedad, último
 * servicio) en vez de dejar el número suelto (INSTRUCCIONES §15).
 */
export function CarteraDrawer({ open, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["reporteCarteraDetalle"],
    queryFn: () => window.api.reportes.carteraDetalle(),
    enabled: open,
  });

  const total = (data ?? []).reduce((acc, f) => acc + f.saldo, 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Cuentas por cobrar"
      subtitle={data ? `${data.length} clienta(s) · ${formatMoneda(total)} en total` : undefined}
    >
      {isLoading || !data ? (
        <p className="text-sm text-ink-500">Calculando…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-ink-500">Ninguna clienta tiene saldo pendiente. 👌</p>
      ) : (
        <div className="flex flex-col divide-y divide-beige-200">
          {data.map((f) => (
            <div key={f.clienteId} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{f.clienteNombre}</p>
                <p className="text-xs text-ink-500">
                  {f.ultimoServicioNombre ?? "Servicio"} · {formatFecha(f.ultimaFecha)}
                </p>
                <p className="text-xs text-ink-400">
                  {f.diasAntiguedad <= 0 ? "hoy" : `${f.diasAntiguedad} día${f.diasAntiguedad === 1 ? "" : "s"} de antigüedad`}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">{formatMoneda(f.saldo)}</p>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
