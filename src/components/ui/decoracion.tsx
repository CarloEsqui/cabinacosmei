/**
 * Sistema de decoración botánica de marca — SVG inline (§10 de docs/DISENO_BELLORA.md).
 *
 * "Jacaranda" no es solo el color de acento: es el árbol de flores moradas del que toma su nombre
 * la marca. Este módulo no es "una planta": es un SISTEMA de piezas con un mismo lenguaje gráfico
 * (line-art botánico fino + manchas orgánicas de lavado) del que cada sección toma una pieza
 * distinta, para que la app tenga variedad y no una calcomanía repetida.
 *
 * LENGUAJE GRÁFICO (respétalo si añades piezas):
 *  - Tallos DIBUJADOS, no alambre: cintas cerradas que se AHÚSAN (gruesas al nacer, finas en la
 *    punta). Un stroke de grosor constante lee a plotter; la cinta ahusada lee a mano.
 *  - Hojas de jacaranda = PINNADAS COMPUESTAS: un raquis con 6-10 pares de hojuelas elípticas
 *    pequeñas. Eso —y no una hoja "blob"— es lo que hace que la silueta lea "jacaranda".
 *  - Flores = racimos COLGANTES LLENOS: campanitas trompeta superpuestas en dos tonos
 *    (jacaranda-200/300) formando una masa de gota. Nunca 5 campanitas sueltas.
 *  - Relleno MÍNIMO y selectivo: la mayoría de hojuelas/pétalos van solo en línea; ~1 de cada 3
 *    lleva relleno suave. Ese contraste es lo que da el aire "premium spa" dibujado a mano.
 *  - Dos capas: `ManchaOrganica` (lavado amorfo, va DEBAJO) + la botánica en línea encima.
 *
 * REGLAS DURAS (obligatorias para todo uso):
 *  - Opacidad baja: line-art 0.40–0.55, manchas 0.3–0.5 (sobre un fill ya clarito).
 *  - `pointer-events-none`, `select-none` y `aria-hidden`: son decorativas, jamás interactivas.
 *  - Posicionamiento ABSOLUTO anclado a una ESQUINA/BORDE del contenedor (`relative
 *    overflow-hidden`); nunca ocupan espacio de layout. Anclar a esquinas es lo que las hace
 *    inmunes al cambio de escala de texto (0.9–1.25): el contenedor crece y la pieza sigue
 *    abrazando su esquina.
 *  - NUNCA detrás de texto denso, tablas o cifras. Las cards opacas las recortan solas.
 *  - Solo tokens de marca (beige / jacaranda). Cero assets externos (CSP estricta).
 */

import { useId } from "react";
import type { ReactElement } from "react";

interface DecoracionProps {
  className?: string;
  /** Ancho en px (la altura se deriva del viewBox). */
  width?: number;
  /** Opacidad total de la pieza. Line-art 0.40–0.55; manchas 0.3–0.5. */
  opacity?: number;
}

const TALLO = "var(--color-beige-400)";
const LINEA = "var(--color-jacaranda-300)";
const RELLENO = "var(--color-jacaranda-100)";
const FLOR_A = "var(--color-jacaranda-200)";
const FLOR_B = "var(--color-jacaranda-300)";

/* ────────────────────────────────────────────────────────────────────────────
   Geometría: cintas ahusadas (el truco que hace que los tallos parezcan trazo)
   ──────────────────────────────────────────────────────────────────────────── */

type Punto = [number, number];
type Curva = { c1: Punto; c2: Punto; p: Punto };

function enCurva(p0: Punto, c1: Punto, c2: Punto, p1: Punto, t: number): Punto {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
}

function tangente(p0: Punto, c1: Punto, c2: Punto, p1: Punto, t: number): Punto {
  const u = 1 - t;
  return [
    3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p1[0] - c2[0]),
    3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p1[1] - c2[1]),
  ];
}

/**
 * Devuelve el `d` de un tallo AHUSADO: recorre la cadena de curvas y construye un contorno cerrado
 * cuyo grosor va de `wIni` (nacimiento) a `wFin` (punta). El exponente hace que el adelgazamiento
 * sea suave al principio y decidido al final, como un trazo de pincel.
 */
function tallo(inicio: Punto, curvas: Curva[], wIni: number, wFin: number, pasosPorTramo = 26): string {
  const izq: Punto[] = [];
  const der: Punto[] = [];
  let p0 = inicio;
  const total = curvas.length * pasosPorTramo;
  let n = 0;
  for (const cv of curvas) {
    for (let i = 0; i <= pasosPorTramo; i++) {
      if (i === 0 && n > 0) continue; // no dupliques la juntura
      const t = i / pasosPorTramo;
      const g = n / total;
      const pt = enCurva(p0, cv.c1, cv.c2, cv.p, t);
      const tg = tangente(p0, cv.c1, cv.c2, cv.p, t);
      const len = Math.hypot(tg[0], tg[1]) || 1;
      const half = (wIni + (wFin - wIni) * Math.pow(g, 0.72)) / 2;
      const nx = (-tg[1] / len) * half;
      const ny = (tg[0] / len) * half;
      izq.push([pt[0] + nx, pt[1] + ny]);
      der.push([pt[0] - nx, pt[1] - ny]);
      n++;
    }
    p0 = cv.p;
  }
  const f = (pt: Punto) => `${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`;
  const ida = izq.map((pt, i) => (i === 0 ? `M${f(pt)}` : `L${f(pt)}`)).join("");
  const vuelta = der
    .slice()
    .reverse()
    .map((pt) => `L${f(pt)}`)
    .join("");
  return `${ida}${vuelta}Z`;
}

/** Punta final del tallo: la última posición de la cadena (para colgar hojas/racimos ahí). */
function finDe(inicio: Punto, curvas: Curva[]): Punto {
  return curvas.length ? curvas[curvas.length - 1].p : inicio;
}

/* ────────────────────────────────────────────────────────────────────────────
   Piezas atómicas reutilizables
   ──────────────────────────────────────────────────────────────────────────── */

/** Hojuela: elipse apuntada de 12 unidades, dibujada desde su base hacia +x. */
const HOJUELA = "M0 0C2.6 -2.7 8.2 -3.3 12 0C8.2 3.3 2.6 2.7 0 0Z";

/**
 * HOJA PINNADA COMPUESTA — la firma botánica de la jacaranda.
 * Un raquis curvo con `pares` pares de hojuelas que menguan hacia el ápice, más una terminal.
 * La mayoría van en línea; una de cada tres lleva relleno suave.
 */
function HojaPinnada({
  x,
  y,
  giro = 0,
  escala = 1,
  pares = 8,
  largo = 70,
  curva = 9,
  semilla = 0,
}: {
  x: number;
  y: number;
  giro?: number;
  escala?: number;
  pares?: number;
  largo?: number;
  curva?: number;
  semilla?: number;
}) {
  const p0: Punto = [0, 0];
  const cv: Curva = { c1: [largo * 0.34, -curva], c2: [largo * 0.68, -curva * 1.35], p: [largo, -curva * 0.7] };
  const hojuelas: ReactElement[] = [];

  // Densidad: las hojuelas se solapan ligeramente con sus vecinas. Un peine de hojuelas separadas
  // lee "espiga de trigo"; solapadas leen "fronda", que es lo que hace jacaranda.
  const base = largo / 62;
  for (let i = 0; i < pares; i++) {
    const t = 0.1 + (i / Math.max(1, pares - 1)) * 0.85;
    const pt = enCurva(p0, cv.c1, cv.c2, cv.p, t);
    const tg = tangente(p0, cv.c1, cv.c2, cv.p, t);
    const ang = (Math.atan2(tg[1], tg[0]) * 180) / Math.PI;
    // grandes en el tercio inicial, menguando hacia el ápice
    const s = (1.06 - 0.46 * t) * base;
    const jitter = ((i * 37 + semilla * 17) % 11) - 5;
    for (const lado of [-1, 1]) {
      const k = i * 2 + (lado > 0 ? 1 : 0);
      const relleno = (k + semilla) % 3 === 0;
      hojuelas.push(
        <path
          key={`h${k}`}
          d={HOJUELA}
          transform={`translate(${pt[0].toFixed(1)} ${pt[1].toFixed(1)}) rotate(${(ang + lado * 56 + jitter * 0.8).toFixed(1)}) scale(${s.toFixed(3)})`}
          fill={relleno ? RELLENO : "none"}
          stroke={LINEA}
          strokeWidth={(1.0 / s).toFixed(2)}
          strokeLinejoin="round"
        />,
      );
    }
  }
  // hojuela terminal, en el eje del raquis
  const tgFin = tangente(p0, cv.c1, cv.c2, cv.p, 1);
  const angFin = (Math.atan2(tgFin[1], tgFin[0]) * 180) / Math.PI;
  const sFin = 0.6 * base;
  hojuelas.push(
    <path
      key="term"
      d={HOJUELA}
      transform={`translate(${cv.p[0]} ${cv.p[1]}) rotate(${angFin.toFixed(1)}) scale(${sFin.toFixed(3)})`}
      fill="none"
      stroke={LINEA}
      strokeWidth={(1.0 / sFin).toFixed(2)}
      strokeLinejoin="round"
    />,
  );

  return (
    <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>
      <path d={tallo(p0, [cv], 1.9, 0.55)} fill={TALLO} />
      {hojuelas}
    </g>
  );
}

/**
 * Campanita trompeta que cuelga desde su punto de anclaje (0,0): tubo estrecho arriba y boca
 * acampanada con tres lóbulos abajo. Los lóbulos son lo que la separa de un "cono de helado".
 */
const CAMPANA =
  "M0 0C-1.1 3.3 -2.4 6.6 -5.9 10.2C-5.1 13.3 -3.1 14.5 -1.9 12.5C-0.9 14.6 0.9 14.6 1.9 12.5C3.1 14.5 5.1 13.3 5.9 10.2C2.4 6.6 1.1 3.3 0 0Z";

/**
 * RACIMO (panícula) de jacaranda: masa de gota formada por campanitas superpuestas en dos tonos,
 * ancha arriba y afinándose hacia abajo. La densidad es intencional: un racimo ralo a opacidad
 * baja se lee como garabato, uno lleno se lee como flor.
 */
function Racimo({
  x,
  y,
  giro = 0,
  escala = 1,
  semilla = 0,
}: {
  x: number;
  y: number;
  giro?: number;
  escala?: number;
  semilla?: number;
}) {
  // Filas superpuestas: ancho arriba, punta abajo. Las campanitas se pisan entre sí a propósito —
  // así el racimo es una MASA (como la panícula real) y no seis flores flotando.
  const filas = [
    { fy: 1, xs: [-16, -5.5, 4.5, 15], s: 0.92 },
    { fy: 10, xs: [-21.5, -11, -0.5, 10, 20.5], s: 1.0 },
    { fy: 21, xs: [-16.5, -6, 4, 14.5], s: 0.94 },
    { fy: 32, xs: [-11.5, -1, 9], s: 0.86 },
    { fy: 43, xs: [-6, 4], s: 0.76 },
    { fy: 53, xs: [-1], s: 0.66 },
  ];
  const campanas: { cx: number; cy: number; s: number; g: number; k: number }[] = [];
  let k = 0;
  for (const f of filas) {
    for (const cx of f.xs) {
      campanas.push({ cx, cy: f.fy, s: f.s, g: (((k * 29 + semilla * 11) % 13) - 6) * 1.6, k });
      k++;
    }
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>
      {/* Eje del racimo: un tallito que baja por dentro de la masa. Sustituye a los pedúnculos en
          abanico, que hacían que el racimo pareciera una lámpara y no una flor. */}
      <path d={tallo([0, -1], [{ c1: [3, 12], c2: [-2, 26], p: [0, 40] }], 1.7, 0.5)} fill={TALLO} />
      <path d={tallo([-1, 7], [{ c1: [-8, 9], c2: [-13, 8], p: [-18, 6] }], 1.1, 0.4)} fill={TALLO} />
      <path d={tallo([0, 17], [{ c1: [7, 19], c2: [12, 18], p: [17, 16] }], 1.1, 0.4)} fill={TALLO} />
      {/* Capullos sin abrir prendidos del eje (dan el remate "en flor" del hombro). */}
      <ellipse cx={-19} cy={4} rx={1.8} ry={3} transform="rotate(-18 -19 4)" fill="none" stroke={FLOR_B} strokeWidth="0.95" />
      <ellipse cx={18} cy={13} rx={1.7} ry={2.8} transform="rotate(16 18 13)" fill="none" stroke={FLOR_B} strokeWidth="0.95" />
      {campanas.map((c) => {
        const soloLinea = (c.k + semilla) % 5 === 4;
        return (
          <path
            key={`c${c.k}`}
            d={CAMPANA}
            transform={`translate(${c.cx} ${c.cy}) rotate(${c.g.toFixed(1)}) scale(${c.s})`}
            fill={soloLinea ? "none" : c.k % 2 === 0 ? FLOR_A : FLOR_B}
            stroke={soloLinea ? FLOR_B : "none"}
            strokeWidth={soloLinea ? (0.95 / c.s).toFixed(2) : undefined}
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}

/** Pétalo suelto (para las piezas de vuelo), dibujado apuntando hacia -y desde su base. */
function Petalo({
  x,
  y,
  giro = 0,
  escala = 1,
  relleno = false,
}: {
  x: number;
  y: number;
  giro?: number;
  escala?: number;
  relleno?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>
      <path
        d="M0 0C-5.4 -5.6 -6.8 -15.2 0 -23.5C6.8 -15.2 5.4 -5.6 0 0Z"
        fill={relleno ? RELLENO : "none"}
        stroke={LINEA}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M0 -2.5C0.5 -8.5 0.6 -15 0 -20.5" stroke={LINEA} strokeWidth="0.7" fill="none" opacity="0.8" />
    </g>
  );
}

/** Hoja elíptica simple con nervadura (para sprigs no pinnados). */
function HojaSimple({
  x,
  y,
  giro = 0,
  escala = 1,
  relleno = false,
}: {
  x: number;
  y: number;
  giro?: number;
  escala?: number;
  relleno?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro}) scale(${escala})`}>
      <path
        d="M0 0C6 -8.5 20 -11.5 33 -6C24 4.5 9 6.5 0 0Z"
        fill={relleno ? RELLENO : "none"}
        stroke={LINEA}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M1.5 -0.6C10 -2.4 22 -4.6 31.5 -5.8" stroke={LINEA} strokeWidth="0.75" fill="none" opacity="0.85" />
    </g>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   1. Capa de LAVADO: mancha orgánica
   ──────────────────────────────────────────────────────────────────────────── */

// Siluetas deliberadamente asimétricas: un círculo suave se lee como "círculo", una mancha con
// radios desiguales se lee como mancha.
const MANCHAS: Record<1 | 2 | 3, string> = {
  1: "M112 2C158 6 200 34 197 84C194 130 168 152 132 168C96 184 44 196 20 166C-4 136 10 96 18 62C26 28 62 -3 112 2Z",
  2: "M56 16C110 -6 184 8 195 60C207 116 158 140 118 164C80 187 26 194 9 154C-9 112 4 74 24 48C34 34 42 22 56 16Z",
  3: "M26 56C52 12 128 -8 168 22C206 50 198 106 176 144C154 182 96 200 56 178C14 155 0 100 26 56Z",
};

/**
 * MANCHA ORGÁNICA — blob amorfo redondeado. Es la capa de LAVADO: va debajo de la botánica (o
 * sola, en páginas densas) y da profundidad a una esquina sin dibujar nada reconocible.
 * `variante` cambia la silueta para que dos páginas no repitan la misma forma.
 *
 * El relleno es un degradado radial que se desvanece hacia el borde: un fill plano deja un canto
 * duro que delata la figura geométrica; el degradado la convierte en un lavado de acuarela.
 */
export function ManchaOrganica({
  className,
  width = 260,
  opacity = 0.45,
  variante = 1,
  color = "var(--color-beige-200)",
}: DecoracionProps & { variante?: 1 | 2 | 3; color?: string }) {
  const id = `mancha-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={width}
      viewBox="0 0 200 200"
      fill="none"
      aria-hidden="true"
      data-deco="mancha"
      className={className}
      style={{ opacity }}
    >
      <defs>
        <radialGradient id={id} cx="42%" cy="38%" r="72%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="55%" stopColor={color} stopOpacity="0.82" />
          <stop offset="100%" stopColor={color} stopOpacity="0.08" />
        </radialGradient>
      </defs>
      <path d={MANCHAS[variante]} fill={`url(#${id})`} />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   2. Pieza mayor: la rama del hero
   ──────────────────────────────────────────────────────────────────────────── */

// Tallo maestro: entra por la esquina superior derecha y drapea, combándose, hasta abajo-izquierda.
// La curva es lo que da carácter: entra casi horizontal, se comba y vuelve a levantar la punta,
// como una rama cargada de flor. Una diagonal recta volvería a leerse como cable.
const RAMA_INICIO: Punto = [566, 20];
const RAMA_CURVAS: Curva[] = [
  { c1: [504, 10], c2: [444, 16], p: [392, 38] },
  { c1: [344, 58], c2: [300, 84], p: [258, 112] },
  { c1: [212, 142], c2: [150, 164], p: [70, 172] },
];
// Ramas secundarias: [inicio, curvas, grosor inicial]. Las que suben llevan hoja, las que bajan
// llevan racimo: así ninguna cruza el tallo maestro y la silueta queda limpia.
const RAMA_SECUNDARIAS: [Punto, Curva[], number][] = [
  [[470, 16], [{ c1: [516, 26], c2: [534, 50], p: [514, 74] }], 3.0], // 0 · racimo (tras la tarjeta)
  [[392, 38], [{ c1: [388, 28], c2: [376, 22], p: [356, 20] }], 2.4], // 1 · hoja
  [[348, 60], [{ c1: [362, 88], c2: [348, 110], p: [316, 116] }], 2.6], // 2 · racimo
  [[300, 84], [{ c1: [286, 60], c2: [266, 46], p: [236, 38] }], 2.4], // 3 · hoja
  [[258, 112], [{ c1: [232, 132], c2: [206, 142], p: [174, 136] }], 2.9], // 4 · racimo grande (al aire)
  [[167, 153], [{ c1: [142, 134], c2: [116, 122], p: [86, 116] }], 2.1], // 5 · hoja
  [[424, 28], [{ c1: [430, 40], c2: [432, 46], p: [430, 52] }], 1.8], // 6 · hoja caída (rellena el hueco)
  [[140, 164], [{ c1: [136, 172], c2: [132, 176], p: [126, 178] }], 1.7], // 7 · racimo chico junto a la punta
];

/**
 * RAMA DE JACARANDA — pieza mayor, exclusiva del hero del Dashboard.
 * Se ancla a la esquina superior derecha y drapea hacia abajo-izquierda: el tronco se teje por
 * detrás de la tarjeta translúcida (donde solo se insinúa) y la masa legible —el racimo grande y
 * las hojas pinnadas— aterriza en el aire libre del centro del hero.
 */
export function RamaJacaranda({ className, width = 560, opacity = 0.5 }: DecoracionProps) {
  return (
    <svg
      width={width}
      viewBox="0 0 560 224"
      fill="none"
      aria-hidden="true"
      data-deco="rama"
      className={className}
      style={{ opacity }}
    >
      <path d={tallo(RAMA_INICIO, RAMA_CURVAS, 6.4, 0.9)} fill={TALLO} />
      {RAMA_SECUNDARIAS.map(([ini, cvs, w], i) => (
        <path key={`s${i}`} d={tallo(ini, cvs, w, 0.8)} fill={TALLO} />
      ))}

      {/* Hojas pinnadas: la firma que hace que la silueta lea "jacaranda". */}
      <HojaPinnada {...pos(RAMA_SECUNDARIAS[1])} giro={177} escala={0.95} pares={10} largo={62} semilla={1} />
      <HojaPinnada {...pos(RAMA_SECUNDARIAS[3])} giro={186} escala={1} pares={12} largo={76} semilla={2} />
      <HojaPinnada {...pos(RAMA_SECUNDARIAS[5])} giro={193} escala={0.92} pares={10} largo={62} semilla={0} />
      <HojaPinnada {...pos(RAMA_SECUNDARIAS[6])} giro={146} escala={0.8} pares={8} largo={54} semilla={4} />
      <HojaPinnada x={70} y={172} giro={204} escala={0.85} pares={7} largo={46} semilla={3} />

      {/* Racimos colgantes: el grande cae en el aire libre; los otros dos se insinúan tras la
          tarjeta translúcida, dando profundidad sin competir con el texto. */}
      <Racimo {...pos(RAMA_SECUNDARIAS[0])} escala={0.95} giro={6} semilla={0} />
      <Racimo {...pos(RAMA_SECUNDARIAS[2])} escala={0.85} giro={-7} semilla={2} />
      <Racimo {...pos(RAMA_SECUNDARIAS[4])} escala={1.1} giro={4} semilla={1} />
      <Racimo {...pos(RAMA_SECUNDARIAS[7])} escala={0.6} giro={-9} semilla={3} />

      {/* Pétalos ya caídos: el suelo bajo una jacaranda siempre está alfombrado. */}
      <Petalo x={214} y={196} giro={152} escala={0.72} relleno />
      <Petalo x={252} y={162} giro={-158} escala={0.6} />
    </svg>
  );
}

/** Azúcar: cuelga una pieza de la punta de una rama secundaria. */
function pos([ini, cvs]: [Punto, Curva[], number]) {
  const p = finDe(ini, cvs);
  return { x: p[0], y: p[1] };
}

/* ────────────────────────────────────────────────────────────────────────────
   3. Piezas de sección (una distinta por página)
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * PÉTALOS AL VUELO — pétalos derivando en diagonal, con estelas finísimas de aire.
 * La más ligera del sistema: para esquinas amplias donde una rama sería demasiado.
 */
export function PetalosAlVuelo({ className, width = 230, opacity = 0.45 }: DecoracionProps) {
  const petalos = [
    { x: 186, y: 34, g: 24, s: 1.05, r: true },
    { x: 132, y: 12, g: -32, s: 0.82, r: false },
    { x: 138, y: 82, g: 58, s: 0.95, r: false },
    { x: 78, y: 54, g: -14, s: 1.12, r: false },
    { x: 86, y: 122, g: 38, s: 0.86, r: true },
    { x: 24, y: 96, g: -48, s: 0.98, r: false },
    { x: 38, y: 162, g: 12, s: 0.74, r: false },
  ];
  return (
    <svg
      width={width}
      viewBox="0 0 210 185"
      fill="none"
      aria-hidden="true"
      data-deco="petalos"
      className={className}
      style={{ opacity }}
    >
      {/* estelas de aire: apenas visibles, dan la diagonal de caída */}
      <path d="M204 6C168 30 138 44 108 78" stroke={TALLO} strokeWidth="0.9" fill="none" opacity="0.55" />
      <path d="M160 62C126 88 94 104 62 142" stroke={TALLO} strokeWidth="0.9" fill="none" opacity="0.45" />
      <path d="M96 22C74 46 56 60 30 74" stroke={TALLO} strokeWidth="0.8" fill="none" opacity="0.35" />
      {petalos.map((p, i) => (
        <Petalo key={i} x={p.x} y={p.y} giro={p.g} escala={p.s} relleno={p.r} />
      ))}
    </svg>
  );
}

/**
 * RAMITA EN FLOR — ramita corta que nace del borde inferior con dos racimos pequeños y una hoja
 * pinnada. Es la "rama del hero" en versión de bolsillo: para pies de página con poco aire.
 */
export function RamitaEnFlor({ className, width = 210, opacity = 0.45 }: DecoracionProps) {
  const ini: Punto = [8, 158];
  const curvas: Curva[] = [
    { c1: [52, 152], c2: [92, 132], p: [130, 106] },
    { c1: [158, 88], c2: [180, 76], p: [206, 70] },
  ];
  const b1: [Punto, Curva[]] = [[92, 130], [{ c1: [98, 108], c2: [96, 96], p: [82, 84] }]];
  const b2: [Punto, Curva[]] = [[152, 92], [{ c1: [160, 74], c2: [156, 62], p: [140, 52] }]];
  return (
    <svg
      width={width}
      viewBox="0 0 215 175"
      fill="none"
      aria-hidden="true"
      data-deco="ramita"
      className={className}
      style={{ opacity }}
    >
      <path d={tallo(ini, curvas, 3.4, 0.9)} fill={TALLO} />
      <path d={tallo(b1[0], b1[1], 1.9, 0.7)} fill={TALLO} />
      <path d={tallo(b2[0], b2[1], 1.9, 0.7)} fill={TALLO} />
      <HojaPinnada x={82} y={84} giro={-24} escala={0.78} pares={7} largo={58} semilla={1} />
      <HojaPinnada x={140} y={52} giro={-16} escala={0.7} pares={6} largo={50} semilla={2} />
      <Racimo x={130} y={106} escala={0.8} giro={4} semilla={0} />
      <Racimo x={206} y={70} escala={0.68} giro={-5} semilla={2} />
    </svg>
  );
}

/**
 * HOJAS SUELTAS — sprig de hojas elípticas sin flor. La pieza más neutra y "verde" del sistema:
 * para secciones de trabajo (inventario) donde la flor sería demasiado dulce.
 */
export function HojasSueltas({ className, width = 195, opacity = 0.45 }: DecoracionProps) {
  const ini: Punto = [10, 168];
  const curvas: Curva[] = [
    { c1: [40, 152], c2: [66, 132], p: [88, 106] },
    { c1: [108, 82], c2: [122, 54], p: [128, 24] },
  ];
  const b1: [Punto, Curva[]] = [[70, 128], [{ c1: [58, 112], c2: [46, 104], p: [30, 100] }]];
  const b2: [Punto, Curva[]] = [[108, 78], [{ c1: [122, 66], c2: [136, 62], p: [154, 62] }]];
  return (
    <svg
      width={width}
      viewBox="0 0 190 180"
      fill="none"
      aria-hidden="true"
      data-deco="hojas"
      className={className}
      style={{ opacity }}
    >
      <path d={tallo(ini, curvas, 3.1, 0.8)} fill={TALLO} />
      <path d={tallo(b1[0], b1[1], 1.7, 0.7)} fill={TALLO} />
      <path d={tallo(b2[0], b2[1], 1.7, 0.7)} fill={TALLO} />
      <HojaSimple x={30} y={100} giro={196} escala={1.05} relleno={false} />
      <HojaSimple x={44} y={144} giro={168} escala={0.9} relleno />
      <HojaSimple x={92} y={100} giro={-58} escala={1.15} relleno={false} />
      <HojaSimple x={154} y={62} giro={-22} escala={1} relleno={false} />
      <HojaSimple x={128} y={24} giro={-74} escala={0.95} relleno />
      <HojaSimple x={112} y={62} giro={-118} escala={0.8} relleno={false} />
    </svg>
  );
}

/**
 * TALLO MINIMAL — una sola línea de tallo con hojuelas alternas. Ultra discreto: es casi un
 * remate tipográfico. Para páginas con mucha cifra donde solo se busca romper el borde.
 */
export function TalloMinimal({ className, width = 84, opacity = 0.5 }: DecoracionProps) {
  const ini: Punto = [46, 246];
  const curvas: Curva[] = [
    { c1: [40, 200], c2: [30, 166], p: [34, 126] },
    { c1: [38, 86], c2: [46, 50], p: [40, 12] },
  ];
  const hojuelas: ReactElement[] = [];
  let p0 = ini;
  let k = 0;
  for (const cv of curvas) {
    for (let i = 1; i <= 4; i++) {
      const t = i / 4.6;
      const pt = enCurva(p0, cv.c1, cv.c2, cv.p, t);
      const tg = tangente(p0, cv.c1, cv.c2, cv.p, t);
      const ang = (Math.atan2(tg[1], tg[0]) * 180) / Math.PI;
      const lado = k % 2 === 0 ? 1 : -1;
      const s = 0.95 - k * 0.05;
      hojuelas.push(
        <path
          key={k}
          d={HOJUELA}
          transform={`translate(${pt[0].toFixed(1)} ${pt[1].toFixed(1)}) rotate(${(ang + lado * 52).toFixed(1)}) scale(${s.toFixed(2)})`}
          fill={k % 3 === 0 ? RELLENO : "none"}
          stroke={LINEA}
          strokeWidth={(1.05 / s).toFixed(2)}
          strokeLinejoin="round"
        />,
      );
      k++;
    }
    p0 = cv.p;
  }
  return (
    <svg
      width={width}
      viewBox="0 0 80 250"
      fill="none"
      aria-hidden="true"
      data-deco="tallo"
      className={className}
      style={{ opacity }}
    >
      <path d={tallo(ini, curvas, 2.6, 0.7)} fill={TALLO} />
      {hojuelas}
    </svg>
  );
}
