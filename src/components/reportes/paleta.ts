// Paleta categórica de gráficas de Reportes, VALIDADA con el script de la guía de dataviz sobre el
// fondo beige (#fbf8f3): separación segura para daltonismo, croma suficiente y contraste ≥3:1.
// No cambiar sin volver a validar.
export const PALETA_CATEGORICA = ["#6b3fa0", "#0a8a7a", "#b0651c", "#3a6ea5"] as const;

export const COLOR_SERIE = {
  ventas: "#6b3fa0",
  cobranza: "#0a8a7a",
  margen: "#b0651c",
} as const;

/** Color único para barras de magnitud (una sola serie). */
export const COLOR_BARRA = "#6b3fa0";

// Colores neutros del tema para ejes, grid y cursores (tomados de los tokens beige/jacaranda).
export const EJE_TEXTO = "#9a8f81";
export const EJE_LINEA = "#e2d3b8";
export const GRID = "#efe4d2";
export const CURSOR = "#c9ade9";
