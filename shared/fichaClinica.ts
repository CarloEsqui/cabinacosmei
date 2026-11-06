/**
 * Catálogo de la ficha clínica facial (spec .notes/spec-ficha-clinica-2026-11-05.md §10 y §21).
 * Transcrito del formato en papel. Es la ÚNICA definición de preguntas y opciones: de aquí salen el
 * esquema zod (shared/schemas.ts), la normalización del main y la UI (Gate, condición 6).
 *
 * Si el formato en papel cambia, se sube VERSION_FORMULARIO y las versiones viejas se siguen
 * leyendo con `safeParse` (nunca lanzan).
 */

export const VERSION_FORMULARIO = 1;

export type Respuesta = "si" | "no" | null;

export interface PreguntaSiNo {
  clave: string;
  etiqueta: string;
  /** Si el papel trae "Especifique" (o "¿cuál?", "frecuencia"), su etiqueta. */
  especifique?: string;
}

export const ANTECEDENTES_CLINICOS: PreguntaSiNo[] = [
  { clave: "alergias", etiqueta: "Alergias", especifique: "Especifique" },
  { clave: "diabetes", etiqueta: "Diabetes" },
  { clave: "renales", etiqueta: "Enfermedades renales", especifique: "Especifique" },
  { clave: "respiratorias", etiqueta: "Enfermedades respiratorias", especifique: "Especifique" },
  { clave: "cardiacas", etiqueta: "Enfermedades cardiacas", especifique: "Especifique" },
  { clave: "digestivas", etiqueta: "Enfermedades digestivas", especifique: "Especifique" },
  { clave: "edemas", etiqueta: "Edemas", especifique: "Especifique" },
  { clave: "caidaCabello", etiqueta: "Caída de cabello" },
  { clave: "marcapasos", etiqueta: "Porta marcapasos" },
  { clave: "cirugiaFacial", etiqueta: "Cirugía facial", especifique: "Especifique" },
  { clave: "fracturaFacial", etiqueta: "Fractura facial", especifique: "Especifique" },
  { clave: "implanteEstetico", etiqueta: "Implante estético", especifique: "Especifique" },
  { clave: "implanteDental", etiqueta: "Implante dental" },
  { clave: "convulsiones", etiqueta: "Sufre convulsiones" },
  { clave: "presion", etiqueta: "Problemas de presión", especifique: "Especifique" },
  { clave: "azucar", etiqueta: "Problemas de azúcar", especifique: "Especifique" },
  { clave: "medicamentos", etiqueta: "Consume medicamentos", especifique: "¿Cuáles?" },
  { clave: "embarazo", etiqueta: "Embarazo" },
  { clave: "hormonales", etiqueta: "Problemas hormonales", especifique: "Especifique" },
];

export const CUIDADO_PIEL: PreguntaSiNo[] = [
  { clave: "tratamientoDermatologico", etiqueta: "Tratamiento dermatológico", especifique: "Especifique" },
  { clave: "protectorSolar", etiqueta: "Uso de protector solar", especifique: "¿Cuál?" },
];

export const HABITOS: PreguntaSiNo[] = [
  { clave: "tabaco", etiqueta: "Tabaco", especifique: "Frecuencia" },
  { clave: "alcohol", etiqueta: "Alcohol", especifique: "Frecuencia" },
];

export const PREGUNTAS_SI_NO: PreguntaSiNo[] = [...ANTECEDENTES_CLINICOS, ...CUIDADO_PIEL, ...HABITOS];

/** FR-009: un Sí en cualquiera de estas muestra el aviso de Precaución. */
export const PREGUNTAS_PRECAUCION = [
  "alergias",
  "embarazo",
  "marcapasos",
  "convulsiones",
  "cardiacas",
  "presion",
  "diabetes",
  "azucar",
  "medicamentos",
  "implanteEstetico",
] as const;

export interface Opcion {
  valor: string;
  etiqueta: string;
}
const op = (...pares: [string, string][]): Opcion[] => pares.map(([valor, etiqueta]) => ({ valor, etiqueta }));

export const EXPOSICION_SOLAR = op(["alto", "Alto"], ["medio", "Medio"], ["bajo", "Bajo"]);

export interface GrupoChips {
  clave: string;
  etiqueta: string;
  multiple: boolean;
  opciones: Opcion[];
}

/** Tipología cutánea (análisis estético). Única donde el concepto excluye; múltiple donde coexisten. */
export const TIPOLOGIA: GrupoChips[] = [
  {
    clave: "piel",
    etiqueta: "Piel",
    multiple: true,
    opciones: op(
      ["eudermica", "Eudérmica (normal)"],
      ["seca", "Seca"],
      ["grasa", "Grasa"],
      ["mixta", "Mixta"],
      ["asfixiada", "Asfixiada"],
      ["desvitalizada", "Desvitalizada"],
      ["sensible", "Sensible"],
    ),
  },
  {
    clave: "color",
    etiqueta: "Color",
    multiple: false,
    opciones: op(["normal", "Normal"], ["rojiza", "Rojiza"], ["amarillenta", "Amarillenta"], ["grisacea", "Grisácea"]),
  },
  {
    clave: "secrecion",
    etiqueta: "Secreción sebácea",
    multiple: false,
    opciones: op(["normal", "Normal"], ["alipica", "Alípica"], ["seborreica", "Seborreica"], ["mixta", "Mixta"]),
  },
  {
    clave: "hidratacion",
    etiqueta: "Grado de hidratación",
    multiple: false,
    opciones: op(["normal", "Normal"], ["deshidratada", "Deshidratada"], ["hiperhidratada", "Hiperhidratada"]),
  },
  {
    clave: "textura",
    etiqueta: "Textura",
    multiple: true,
    opciones: op(["fina", "Fina"], ["gruesa", "Gruesa"], ["aspera", "Áspera"], ["suave", "Suave"], ["brillosa", "Brillosa"]),
  },
  {
    clave: "acne",
    etiqueta: "Acné",
    multiple: true,
    opciones: op(["comedones", "Comedones"], ["papulas", "Pápulas"], ["pustulas", "Pústulas"], ["quistes", "Quistes"]),
  },
  {
    clave: "pigmentacion",
    etiqueta: "Pigmentación",
    multiple: true,
    opciones: op(
      ["efelides", "Efélides"],
      ["hipercromias", "Hipercromías"],
      ["melasma", "Melasma"],
      ["nevus", "Nevus"],
      ["lentigos", "Léntigos"],
      ["acromias", "Acromías"],
    ),
  },
  {
    clave: "arrugas",
    etiqueta: "Arrugas",
    multiple: true,
    opciones: op(["expresion", "Expresión"], ["envejecimiento", "Envejecimiento"]),
  },
  {
    clave: "vascularizacion",
    etiqueta: "Vascularización",
    multiple: true,
    opciones: op(["rosacea", "Rosácea"], ["cuperosis", "Cuperosis"], ["telangiectasias", "Telangiectasias"], ["eritrosis", "Eritrosis"]),
  },
  {
    clave: "flacidez",
    etiqueta: "Flacidez cutánea",
    multiple: true,
    opciones: op(["mejillas", "Mejillas"], ["parpados", "Párpados"], ["ovalo", "Óvalo facial"]),
  },
];

export const BOLSAS_TIPO = op(["edema", "Edema"], ["grasa", "Grasa"]);
export const SEXOS = op(["F", "F"], ["M", "M"]);

export function etiquetaPregunta(clave: string): string {
  return PREGUNTAS_SI_NO.find((p) => p.clave === clave)?.etiqueta ?? clave;
}

// ---------------------------------------------------------------------------
// Forma de `datos` y su normalización (BR-003, BR-004; Gate, condición 4)
// ---------------------------------------------------------------------------

export interface RespuestaSiNo {
  respuesta: Respuesta;
  especifique: string | null;
}

export interface ProductoRecomendado {
  productoId: string;
  /** Copia del nombre: la ficha no cambia si el producto se edita o se desactiva (§10). */
  nombre: string;
}

export interface FichaDatos {
  respuestas: Record<string, RespuestaSiNo>;
  cosmeticosActuales: string | null;
  exposicionSolar: string | null;
  habitosOtros: string | null;
  motivoConsulta: string | null;
  /** Todas como arreglo; en los grupos de opción única tiene a lo más un valor. */
  tipologia: Record<string, string[]>;
  bolsas: { respuesta: Respuesta; tipo: string | null };
  recomendacion: { productos: ProductoRecomendado[]; texto: string | null };
}

export function fichaVacia(): FichaDatos {
  return {
    respuestas: Object.fromEntries(PREGUNTAS_SI_NO.map((p) => [p.clave, { respuesta: null, especifique: null }])),
    cosmeticosActuales: null,
    exposicionSolar: null,
    habitosOtros: null,
    motivoConsulta: null,
    tipologia: Object.fromEntries(TIPOLOGIA.map((g) => [g.clave, []])),
    bolsas: { respuesta: null, tipo: null },
    recomendacion: { productos: [], texto: null },
  };
}

function texto(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * Forma canónica: solo claves del catálogo, textos recortados ("" → null), "Especifique" descartado
 * si la respuesta no es Sí (BR-004), chips sin duplicados y en el orden del catálogo, opción única
 * con a lo más un valor. Dos fichas iguales en contenido dan el mismo JSON (BR-002).
 */
export function normalizarFicha(d: FichaDatos): FichaDatos {
  const respuestas: Record<string, RespuestaSiNo> = {};
  for (const p of PREGUNTAS_SI_NO) {
    const r = d.respuestas?.[p.clave];
    const respuesta: Respuesta = r?.respuesta === "si" || r?.respuesta === "no" ? r.respuesta : null;
    respuestas[p.clave] = {
      respuesta,
      especifique: respuesta === "si" && p.especifique ? texto(r?.especifique) : null,
    };
  }
  const tipologia: Record<string, string[]> = {};
  for (const g of TIPOLOGIA) {
    const elegidos = new Set(d.tipologia?.[g.clave] ?? []);
    const enOrden = g.opciones.map((o) => o.valor).filter((v) => elegidos.has(v));
    tipologia[g.clave] = g.multiple ? enOrden : enOrden.slice(0, 1);
  }
  const bolsasResp: Respuesta = d.bolsas?.respuesta === "si" || d.bolsas?.respuesta === "no" ? d.bolsas.respuesta : null;
  const vistos = new Set<string>();
  const productos = (d.recomendacion?.productos ?? []).filter((p) => {
    if (!p.productoId || vistos.has(p.productoId)) return false;
    vistos.add(p.productoId);
    return true;
  });
  return {
    respuestas,
    cosmeticosActuales: texto(d.cosmeticosActuales),
    exposicionSolar: EXPOSICION_SOLAR.some((o) => o.valor === d.exposicionSolar) ? d.exposicionSolar : null,
    habitosOtros: texto(d.habitosOtros),
    motivoConsulta: texto(d.motivoConsulta),
    tipologia,
    bolsas: {
      respuesta: bolsasResp,
      tipo: bolsasResp === "si" && BOLSAS_TIPO.some((o) => o.valor === d.bolsas?.tipo) ? d.bolsas.tipo : null,
    },
    recomendacion: {
      productos: productos.map((p) => ({ productoId: p.productoId, nombre: p.nombre.trim() })),
      texto: texto(d.recomendacion?.texto),
    },
  };
}

/** JSON con claves ordenadas: la comparación "¿cambió algo?" no depende del orden de inserción. */
export function jsonCanonico(valor: unknown): string {
  return JSON.stringify(valor, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

/** FR-009: preguntas de precaución marcadas con Sí, con su "Especifique". */
export function precaucionesDe(d: FichaDatos): { clave: string; etiqueta: string; especifique: string | null }[] {
  return PREGUNTAS_PRECAUCION.filter((c) => d.respuestas?.[c]?.respuesta === "si").map((c) => ({
    clave: c,
    etiqueta: etiquetaPregunta(c),
    especifique: d.respuestas[c].especifique ?? null,
  }));
}
