import type { CeldaDemanda } from "@shared/types";

const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Hue secuencial (morado de "ventas") en un ramp claro→oscuro por intensidad de demanda.
// Al ser una sola magnitud, un solo hue con lightness creciente es lo correcto (guía dataviz).
function colorCelda(citas: number, max: number): string {
  if (citas <= 0 || max <= 0) return "transparent";
  const t = citas / max; // 0..1
  const alpha = 0.15 + 0.75 * t;
  return `rgba(107, 63, 160, ${alpha.toFixed(2)})`;
}

interface Props {
  demanda: CeldaDemanda[];
  horaMin: number;
  horaMax: number;
  diasLaborales: number[];
}

export function GraficaDemanda({ demanda, horaMin, horaMax, diasLaborales }: Props) {
  const total = demanda.reduce((acc, c) => acc + c.citas, 0);
  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-ink-400">
        No hay citas en el periodo para dibujar la demanda.
      </div>
    );
  }

  const horas: number[] = [];
  for (let h = horaMin; h < horaMax; h++) horas.push(h);
  const dias = diasLaborales.length > 0 ? diasLaborales : [1, 2, 3, 4, 5, 6];

  const mapa = new Map<string, number>();
  for (const c of demanda) mapa.set(`${c.dia}-${c.hora}`, c.citas);
  const max = Math.max(...demanda.map((c) => c.citas));

  return (
    <div className="overflow-x-auto">
      {/* Días como filas (son pocos, 6-7) y horas como columnas (suelen ser más, 8-12): así la
          cuadrícula reparte el ancho completo de la tarjeta entre más columnas y las celdas quedan
          bien proporcionadas, en vez de 6 columnas gigantes o comprimidas en una esquina. */}
      <table className="w-full border-separate border-spacing-[3px] text-sm" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th className="w-14 text-right text-xs font-medium text-ink-400" />
            {horas.map((h) => (
              <th key={h} className="pb-1 text-center text-xs font-medium text-ink-500">
                {h}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d}>
              <td className="whitespace-nowrap pr-2 text-right text-xs font-medium text-ink-500">
                {NOMBRE_DIA[d]}
              </td>
              {horas.map((h) => {
                const n = mapa.get(`${d}-${h}`) ?? 0;
                return (
                  <td
                    key={h}
                    className="h-10 rounded-[4px] text-center text-xs font-medium tabular-nums"
                    style={{
                      backgroundColor: colorCelda(n, max),
                      color: n / max > 0.55 ? "#fbf8f3" : "#6b5b47",
                    }}
                    title={`${NOMBRE_DIA[d]} ${String(h).padStart(2, "0")}:00 — ${n} cita${n === 1 ? "" : "s"}`}
                  >
                    {n > 0 ? n : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Leyenda de intensidad */}
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-ink-400">
        <span>Menos</span>
        <div className="flex gap-[2px]">
          {[0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <div
              key={t}
              className="h-3 w-5 rounded-[3px]"
              style={{ backgroundColor: `rgba(107, 63, 160, ${(0.15 + 0.75 * t).toFixed(2)})` }}
            />
          ))}
        </div>
        <span>Más</span>
      </div>
    </div>
  );
}
