# Skill de diseño Bellora — reglas para refinar y homogeneizar la UI

> Documento normativo para el rediseño v0.1.4 y para TODO desarrollo futuro de UI.
> Objetivo: que la app se sienta un producto caro, fino y coherente — sin tocar una sola función.
> La referencia canónica es la sección **Reportes** (la más reciente): su lenguaje visual es el
> que se extiende al resto. Ante la duda, mira cómo lo resuelve Reportes.

## 0. Reglas de oro (no negociables)

1. **Cero cambios funcionales.** Ni un handler, query, validación o flujo se toca. Solo JSX de
   presentación, clases, y componentes de `src/components/ui/`.
2. **Solo tokens existentes** (beige / jacaranda / ink / success / warning / danger de
   `src/index.css`). Prohibido inventar hex nuevos o usar colores Tailwind genéricos (`gray-500`,
   `blue-600`...).
3. **Tipografía**: Playfair Display (`font-display`, títulos de página en peso 700) SOLO en
   títulos y frases decorativas. Manrope (`font-ui`) en todo lo funcional. Nunca serif en
   tablas, botones, forms.
4. **Números tabulares** (`metric-value` o `tabular-nums`) en toda cifra alineada en columna.
5. Todo texto de UI en **español**, tono cálido y humano (la usuaria es cosmetóloga, no técnica).
6. `npm run typecheck` limpio al terminar. Nada de assets externos (CSP estricta): iconos =
   lucide-react, ilustraciones = SVG inline propio.

## 1. Anatomía de página (homogeneizar en TODAS las secciones)

```
PageHeader          → título (font-display) + subtítulo + ACCIÓN PRIMARIA de la sección
[Tabs]              → si la sección tiene pestañas
Toolbar             → fila única: búsqueda + filtros a la izquierda · acciones secundarias a la derecha (ml-auto)
Contenido           → cards/tablas con el MISMO gutter: p-8, gap-4
Meta                → pie discreto cuando aplique ("12 de 48 productos")
```

- **La acción primaria de cada sección vive en el PageHeader**, nunca flotando dentro del
  contenido (corregir: "Nueva categoría", "Nuevo servicio", "Nuevo producto", "Nuevo proveedor"
  de Configuración deben subir al patrón de toolbar de su pestaña, alineados con los filtros como
  hace Inventario con "Nueva entrada").
- **Filtros**: SIEMPRE el patrón de Inventario/Productos — `Input` de búsqueda con placeholder
  (`max-w-xs`) + `MultiSelect`s con placeholder "Todos los...". **Sin labels arriba** (corregir
  Citas, que hoy mezcla labels encima de los inputs). Un solo renglón, `flex flex-wrap gap-3`.
- Los rangos de fecha (Desde/Hasta) se agrupan en un solo control visual: dos inputs `date`
  unidos con "–" dentro de un contenedor con borde común, no dos inputs sueltos con label.

## 2. Tablas (el corazón del refinamiento)

Anatomía única para TODAS las tablas (basarse en las de Reportes/Inventario y estandarizar):

- Contenedor: `Card` con `overflow-x-auto`, sin padding extra alrededor de la tabla.
- Encabezado: `bg-beige-200 text-left text-xs font-medium uppercase tracking-wide text-ink-500`,
  celdas `px-4 py-2.5`. Columnas ordenables → `SortableHeader` con su indicador.
- Filas: `border-t border-beige-200`, celdas `px-4 py-3` (¡altura consistente!), y **hover
  `hover:bg-beige-100/60 transition-colors` en toda tabla interactiva**.
- Números y dinero: alineados a la derecha con `tabular-nums`; texto a la izquierda.
- Booleanos: nunca "Sí/No" en texto plano → icono `Check` (`text-success-500`) o "—"
  (`text-ink-300`) centrado (corregir Categorías).
- **Acciones de fila**: grupo `flex justify-end gap-1` con `Button variant="ghost" size="sm"` +
  `title`. Los iconos van en `text-ink-400`, y SOLO adquieren color semántico al hover
  (`hover:text-danger-500` para eliminar). Un basurero rojo permanente en cada fila grita barato.
- Botones de acción prominentes por fila (ej. "Cerrar" en Citas): conservar función, bajar
  volumen → `variant="secondary" size="sm"`; el primario saturado se reserva a la acción única
  de la página.
- `<tbody>` con `aparecer-suave` keyed por filtros (ya existe el patrón — aplicarlo donde falte).
- Pie de tabla: cuando hay filtros, línea discreta `text-xs text-ink-500` "Mostrando X de Y".
- EmptyState SIEMPRE con icono + mensaje + submensaje accionable, distinguiendo "no hay datos
  aún" vs "ningún resultado con estos filtros" (patrón ya existente en Productos — extenderlo).

## 3. Cards y jerarquía interna

- Card estándar: fondo `bg-beige-50`, borde `border-beige-200/70`, `rounded-2xl`,
  sombra sutilísima (`shadow-sm` máx.). Padding interno `p-5`.
- **Header de card único**: icono 16px en `text-jacaranda-500` + título `text-sm font-semibold
  text-ink-900` (NO jacaranda en texto de título de card — el color va en el icono; corregir
  Corte y Config que usan títulos morados en bold).
- KPI/stat: el patrón de Reportes es canon — valor `metric-value text-2xl`, label
  `text-xs text-ink-500`, comparación con flecha y color semántico si existe.
- Los botones "Guardar cambios" de Configuración: **nunca full-width**. `size="sm"` alineado a
  la derecha del card (`self-end`). El full-width se reserva para la acción única de un modal.
- El botón gigante "Hacer corte" de Corte: ancho natural centrado o alineado, `size` normal —
  presencia sí, grito no.

## 4. Vacíos y respiración (el problema del "mar beige")

Las páginas de lista con 4 filas nadan en vacío. Remedios aprobados (elegir según página):
- **Franja de stats** arriba de la tabla (3-4 `StatChip`s discretos: total, activos, con
  pendiente...) usando datos YA cargados en el componente — cero queries nuevas.
- La tabla no se estira: mantiene su alto natural; el vacío restante es respiración válida
  SOLO si la página abre con contenido de suficiente peso (stats + toolbar + tabla).
- Ilustración de marca sutil en EmptyStates (SVG inline simple en tonos beige-300/jacaranda-200,
  máx ~120px, nada infantil).

## 5. Modales y formularios

- Título del modal: `font-ui font-semibold` (ya es así vía Modal) — verificar consistencia.
- Labels: `text-xs font-medium text-ink-500 mb-1` (patrón dominante — corregir desviaciones).
- Grupos de 2 campos: `grid grid-cols-2 gap-3`. Espaciado vertical `flex flex-col gap-3`.
- Botón de submit: full-width al pie del modal (ese SÍ es su lugar), `mt-2`.
- Secciones dentro de un form largo (ej. "Presentación" en producto): separador con
  encabezadito `text-xs font-semibold uppercase tracking-wide text-ink-500 mt-2`.
- Inputs numéricos: SIEMPRE `NumberInput`/`MoneyInput` (regla del proyecto).

## 6. Botones (escala de volumen)

| Rol | Variante | Uso |
|---|---|---|
| Primario de página | `primary` | UNO por vista (Nueva cita, Nueva clienta...) en PageHeader/toolbar |
| Secundario | `secondary` | Exportar, Nueva salida, acciones de card |
| Terciario | `ghost` | Iconos de fila, navegación, cerrar |
| Peligro | ghost + hover danger | Eliminar (nunca rojo permanente) |

- Iconos en botones: 16px con texto, 14px en `size="sm"` de fila.
- Estados: hover y focus visibles en todos; `disabled` con opacidad, nunca invisible.

## 7. Micro-interacciones

- `transition-colors` en todo elemento interactivo (filas, botones, tabs, chips).
- `aparecer-suave` al montar listas/cards principales de cada página.
- Respetar `prefers-reduced-motion` (el keyframe ya lo hace — no introducir animaciones fuera
  de ese patrón sin la misma guarda).
- framer-motion solo donde ya se usa (modales/drawers); no añadir springs nuevos por página.

## 8. Qué NO tocar

- **Reportes** (`src/components/reportes/*`, `src/pages/Reportes.tsx`): es la referencia; solo
  se permite alinear detalles si chocan con este documento.
- La Agenda/calendario recién rediseñada (`Calendario.tsx`, CSS de FullCalendar).
- Lógica alguna: servicios, IPC, queries, mutaciones, validaciones, rutas.
- `MensajeSorpresa` (temporal, se elimina en otra tarea).

## 9. Checklist de salida (por agente, por página tocada)

- [ ] `npm run typecheck` limpio.
- [ ] La página respeta la anatomía de §1 (acción primaria arriba, toolbar única, gutter p-8).
- [ ] Toda tabla cumple §2 completa (hover, acciones ghost, booleanos con icono, pie, empty).
- [ ] Ningún color fuera de tokens; ninguna serif fuera de títulos.
- [ ] Cero cambios de comportamiento: mismos handlers, mismos datos, mismos flujos.

## 10. Sistema de decoración botánica

"Jacaranda" no es solo el color de acento: es el árbol de flores moradas que da nombre a la marca.
Pero **una sola planta repetida en todas las pantallas se lee como calcomanía**. Por eso la
decoración es un **sistema de piezas** (`src/components/ui/decoracion.tsx`, SVG inline propio, cero
assets externos) del que **cada sección toma una pieza distinta**.

### 10.1 Lenguaje gráfico (respétalo si añades piezas)

- **Tallos dibujados, no alambre.** Nada de `stroke` de grosor constante: los tallos son cintas
  cerradas que se **ahúsan** (gruesas al nacer, finas en la punta). El helper interno `tallo()`
  las genera desde una cadena de curvas Bézier. Un grosor uniforme lee a plotter; la cinta ahusada
  lee a mano.
- **Hoja de jacaranda = pinnada compuesta.** Un raquis con 7-12 pares de hojuelas elípticas
  pequeñas que **se solapan** entre sí y menguan hacia el ápice. Esa fronda —y no una hoja "blob"—
  es lo que hace que la silueta lea *jacaranda*. Hojuelas separadas leen "espiga de trigo".
- **Flor = racimo colgante LLENO.** Campanitas trompeta (boca acampanada con tres lóbulos)
  superpuestas en dos tonos (`jacaranda-200` / `jacaranda-300`) formando una masa de gota, con un
  eje interno del que cuelgan. Un racimo ralo a opacidad baja se lee como garabato.
- **Relleno mínimo y selectivo.** La mayoría de hojuelas y pétalos van **solo en línea**
  (`jacaranda-300`, 1–1.25); ~1 de cada 3 lleva relleno suave (`jacaranda-100`). Ese contraste es
  el aire "premium spa" dibujado a mano.
- **Paleta fija:** tallos `beige-400`, línea `jacaranda-300`, relleno `jacaranda-100`, flor
  `jacaranda-200/300`, lavado `beige-200` (o `jacaranda-50`).

### 10.2 Las dos capas

| Capa | Qué es | Cuándo |
|---|---|---|
| **Lavado** | `ManchaOrganica`: blob amorfo asimétrico con **degradado radial** que se desvanece al borde (un fill plano deja canto duro y delata la figura). 3 `variante`s de silueta. | Sola en páginas densas; debajo de la botánica donde haga falta profundidad. |
| **Line-art** | Las piezas botánicas. | Encima del lavado o sola. |

### 10.3 Las piezas

| Pieza | Qué es | Tamaño típico |
|---|---|---|
| `ManchaOrganica` | Lavado amorfo (`variante` 1/2/3, `color` opcional). | 260–540 px |
| `RamaJacaranda` | **Pieza mayor, exclusiva del hero del Dashboard.** Bough combada con 3 racimos, 4 hojas pinnadas y pétalos caídos. | 380–560 px |
| `PetalosAlVuelo` | Pétalos derivando en diagonal con estelas de aire finísimas. | ~220 px |
| `RamitaEnFlor` | Ramita corta con 2 racimos pequeños y 2 fronda. La rama del hero en versión de bolsillo. | ~200–230 px |
| `HojasSueltas` | Sprig de hojas elípticas **sin flor**: la más neutra, para secciones de trabajo. | ~185 px |
| `TalloMinimal` | Tallo vertical con hojuelas alternas. Casi un remate tipográfico. | ~84–96 px |

### 10.4 Asignación por sección (no clonar: cada página su pieza)

| Sección | Pieza(s) | Anclaje |
|---|---|---|
| Dashboard | `RamaJacaranda` en el hero | esquina sup. derecha, tejida tras la tarjeta translúcida; ancho **relativo** (`w-[46%] max-w-[560px]`) |
| Clientes | `PetalosAlVuelo` + `ManchaOrganica` (v2) | inferior izquierda / inferior derecha |
| Citas | `RamitaEnFlor` | inferior izquierda |
| Inventario | `HojasSueltas` | inferior derecha |
| Corte | `TalloMinimal` | borde derecho (canaleta) |
| Configuración | `ManchaOrganica` (v3) **sola** | borde derecho — página densa, mínimo ruido |
| Lock (PIN) | 2 `ManchaOrganica` en esquinas opuestas + `RamitaEnFlor` + `PetalosAlVuelo` | esquinas, sangrando fuera del viewport |
| Reportes, Agenda/calendario | **ninguna** | — |

En las páginas con pestañas (Citas, Inventario, Configuración) la decoración vive en el **componente
de página**, nunca en cada pestaña: así no se duplica ni parpadea al cambiar de tab.

### 10.5 Reglas duras (no negociables)

1. **Opacidad baja**: line-art **0.40–0.55**; manchas **0.30–0.55** (sobre un fill ya clarito). Se
   deben *sentir* más que *verse*.
2. `pointer-events-none`, `select-none` y `aria-hidden` siempre.
3. **Anclaje a ESQUINA o BORDE** de un contenedor `relative`. Nunca ocupan espacio de layout.
   Anclar a esquinas es lo que las hace inmunes a `escalaTexto` (0.9–1.25): el contenedor crece y
   la pieza sigue abrazando su esquina. **Verifica siempre en 1.0 Y 1.25.**
4. Cuando el ancho del contenedor cambie con la escala de texto (caso del hero), da a la pieza un
   **ancho relativo** (`w-[46%] max-w-[…]`) en vez de un `width` fijo, o acabará invadiendo el texto.
5. **Nunca offsets negativos** dentro de un contenedor con `overflow-y-auto` hacia la derecha o
   abajo: generan scroll fantasma. Sangra solo hacia arriba/izquierda, o usa `overflow-hidden`.
6. **`isolate` en la página + `-z-10` en la pieza.** Así la decoración cae al fondo del apilamiento:
   las cards opacas la recortan solas y **jamás** queda sobre una tabla o un texto denso.
7. **La decoración vive en el aire.** Si la página está llena de datos, se recorta sola y no se ve:
   eso es correcto, no un bug. Aparece cuando hay vacío que llenar (§4).
8. Solo tokens de marca. Cero assets externos (CSP estricta).
9. **Prefiere una pieza legible** a muchos elementos sueltos. Si compiten dos decoraciones en la
   misma zona, quita una.

**Verificación obligatoria:** captura real de la pantalla (no confíes en el código). Pregúntate:
¿alguien leería "jacaranda" sin que se lo digan? ¿el trazo parece dibujado a mano o de plotter? ¿a
la opacidad final se distingue o es ruido? Si distrae, bájale la opacidad o quítala.
