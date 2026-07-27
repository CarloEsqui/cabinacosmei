/**
 * Ilustraciones de marca — SVG inline, sobrias y elegantes, en tonos beige/jacaranda (§4).
 * Pensadas para EmptyStates: dan calidez sin caer en lo infantil. Nada de assets externos (CSP).
 * Tamaño natural ~110px; se puede escalar con la prop `size`.
 */

interface IlustracionProps {
  size?: number;
  className?: string;
}

const BASE = "var(--color-beige-400)";
const SUAVE = "var(--color-beige-200)";
const ACENTO = "var(--color-jacaranda-300)";
const ACENTO_SUAVE = "var(--color-jacaranda-100)";

/** Paquete / caja — inventario, stock, sin productos. */
export function IlustracionPaquete({ size = 110, className }: IlustracionProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="60" cy="102" rx="34" ry="5" fill={SUAVE} />
      <path
        d="M60 34 L92 50 V82 L60 98 L28 82 V50 Z"
        fill="var(--color-beige-50)"
        stroke={BASE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M28 50 L60 66 L92 50" stroke={BASE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 66 V98" stroke={BASE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M44 42 L76 58" stroke={ACENTO} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M84 30 l1.6 4.2 4.4 1.6 -4.4 1.6 -1.6 4.2 -1.6 -4.2 -4.4 -1.6 4.4 -1.6 Z"
        fill={ACENTO}
      />
    </svg>
  );
}

/** Calendario — sin citas, agenda vacía. */
export function IlustracionCalendario({ size = 110, className }: IlustracionProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="60" cy="104" rx="32" ry="5" fill={SUAVE} />
      <rect
        x="26"
        y="30"
        width="68"
        height="66"
        rx="10"
        fill="var(--color-beige-50)"
        stroke={BASE}
        strokeWidth="2"
      />
      <path d="M26 48 H94" stroke={BASE} strokeWidth="2" />
      <path d="M42 24 V36 M78 24 V36" stroke={ACENTO} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="43" cy="63" r="4" fill={ACENTO_SUAVE} />
      <circle cx="60" cy="63" r="4" fill={ACENTO} />
      <circle cx="77" cy="63" r="4" fill={ACENTO_SUAVE} />
      <circle cx="43" cy="80" r="4" fill={ACENTO_SUAVE} />
      <circle cx="60" cy="80" r="4" fill={ACENTO_SUAVE} />
      <circle cx="77" cy="80" r="4" fill={ACENTO_SUAVE} />
    </svg>
  );
}

/** Documento — sin registros, historial vacío, reportes. */
export function IlustracionDocumento({ size = 110, className }: IlustracionProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="60" cy="104" rx="30" ry="5" fill={SUAVE} />
      <path
        d="M36 24 H68 L86 42 V96 H36 Z"
        fill="var(--color-beige-50)"
        stroke={BASE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M68 24 V42 H86" fill="none" stroke={BASE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M46 58 H76 M46 70 H76 M46 82 H64" stroke={ACENTO} strokeWidth="2" strokeLinecap="round" />
      <circle cx="46" cy="46" r="3" fill={ACENTO_SUAVE} />
    </svg>
  );
}
