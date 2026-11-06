# Feature Specification — Ficha clínica facial (2026-11-05)

## 1. Feature
**Nombre:** Ficha clínica facial de la clienta, con notas y fotos de antes y después por tratamiento.
**Estado:** Draft — pendiente de Gate 001.
**Dueño:** Carlos.

## 2. Problem

### Current Situation
La cosmetóloga llena a mano un formato en papel de 5 páginas ("Ficha clínica facial"):
- datos de la paciente;
- antecedentes clínicos;
- cuidado habitual de la piel y hábitos tóxicos;
- análisis estético y tipología cutánea;
- tabla de 12 tratamientos realizados en cabina con fecha y notas;
- recomendación de productos para casa.

En la app, la ficha de la clienta (Clientes) solo tiene datos de contacto, notas y observaciones en
texto libre, y el historial de servicios.

### Problem
- Los antecedentes clínicos no existen en la app. Viven en papel, separados del historial y de la agenda.
- Nada avisa en la cita de una contraindicación (alergia, embarazo, marcapasos…) antes de empezar el
  tratamiento.
- No hay forma de guardar fotos de antes y después ligadas a cada tratamiento. Hoy solo se pueden
  meter archivos a mano en la carpeta de la clienta.

### Impact
La cosmetóloga y la clienta. Un antecedente que no se consulta antes de un tratamiento es un
riesgo para la clienta. Sin fotos ligadas a cada tratamiento no se puede mostrar el avance.

## 3. Desired Outcome
Desde la ficha de la clienta, y desde cualquier cita suya, se abre su ficha clínica:
- se llena con botones rápidos que siguen el orden del formato en papel;
- se actualiza con el tiempo, conservando las versiones anteriores;
- cada tratamiento tiene sus notas y fotos de antes y después.

Si la clienta tiene un antecedente delicado, el detalle de cada cita lo avisa.

## 4. Users and Roles
| Rol | Necesidad | Permisos / restricciones |
|---|---|---|
| Cosmetóloga o cosmetólogo (único usuario, PIN único) | Capturar y consultar la ficha rápido, con la clienta enfrente | App desbloqueada. No hay roles (PROJECT.md → roles) |
| Clienta (titular de los datos) | Que sus datos de salud se usen solo para su atención | Ver §10 Sensitive Data y Q-001 |

## 5. Scope

### In Scope
- Ficha clínica facial por clienta, con las secciones del formato en papel (§10).
- Versiones anteriores de la ficha, solo para consulta.
- Notas y fotos de antes y después en cada tratamiento (servicio realizado) de la clienta.
- Aviso de "Precaución" en el detalle de la cita y en el encabezado de la ficha.
- Acceso desde la ficha de la clienta (Clientes) y desde el detalle de la cita (Calendario, Citas y la
  ficha de la clienta), por la regla de "acciones donde se trabaja".

### Out of Scope
- Imprimir la ficha o exportarla a PDF (se puede pedir después).
- Fichas de otro tipo: corporal, depilación, etc.
- Firma digital y aviso de privacidad dentro de la app (ver Q-001).
- Comparador de fotos lado a lado con zoom, y edición de fotos.
- Exportar datos clínicos a CSV o reportes. Esto queda **prohibido**, no solo fuera de alcance (BR-006).

## 6. Functional Requirements

**FR-001** — En el modal de la clienta (Clientes) hay un botón "Ficha clínica" junto a "Nueva cita",
"Editar datos" y "Abrir carpeta". El detalle de la cita tiene el mismo acceso.
*Why:* una acción debe estar disponible en cada sección donde aparece la clienta.

**FR-002** — La ficha se organiza en cuatro pasos navegables en cualquier orden:
1. Datos.
2. Antecedentes: clínicos, cuidado de la piel y hábitos.
3. Análisis estético.
4. Tratamientos en cabina y recomendación para casa.

Cada paso muestra cuántas preguntas tiene sin responder.
*Why:* que se pueda llenar con la clienta enfrente, sin un formulario abierto ni largo.

**FR-003** — Cada pregunta de antecedentes tiene botones **Sí** y **No**:
- Es un tri-estado: sin responder, Sí o No.
- El campo "Especifique" aparece solo al marcar Sí en las preguntas que lo traen en el papel.
- Al cambiar a No, el texto de "Especifique" se descarta.

*Why:* el formato lo pide así. "Sin responder" no es lo mismo que "No".

**FR-004** — Las preguntas de opción se contestan con botones (chips). Son de opción única donde el
concepto excluye a los demás y de opción múltiple donde pueden coexistir (tabla en §10).
*Why:* llenado rápido y sin texto libre innecesario.

**FR-005** — Datos de la clienta:
- Nombre, teléfono, correo y fecha de nacimiento se muestran desde su registro. Se editan solo con
  "Editar datos" de la clienta; hay una sola fuente.
- La edad se calcula de la fecha de nacimiento.
- La ficha agrega sexo (M / F, como en el papel) y ocupación.

**FR-006** — "Guardar" actualiza la ficha vigente.
- Si algo cambió, la versión anterior se conserva intacta, con fecha.
- Hay una vista "Versiones anteriores" solo de lectura.
- Si se intenta cerrar con cambios sin guardar, la app pregunta antes de descartarlos.

*Why:* decisión de Carlos del 2026-11-05: la ficha se va actualizando y se conservan versiones.

**FR-007** — "Tratamientos en cabina" lista los servicios realizados de la clienta en orden
cronológico, numerados 1°, 2°… como en el papel. Cada uno muestra:
- fecha y servicio;
- notas, editables también con el servicio ya cerrado;
- fotos de **antes** y de **después**: subir, ver la miniatura, abrir en grande y quitar con confirmación.

Las mismas notas y fotos están en el detalle de una cita cerrada.

**FR-008** — Recomendación de productos para casa: se eligen de los productos activos a la venta,
más un texto libre.

**FR-009** — Aviso de **Precaución**. Si la ficha vigente tiene Sí en alguna de estas preguntas, el
detalle de toda cita de la clienta y el encabezado de su ficha muestran un aviso rojo con cuáles
son y su "Especifique":
- alergias;
- embarazo;
- porta marcapasos;
- sufre convulsiones;
- enfermedades cardiacas;
- problemas de presión;
- diabetes o problemas de azúcar;
- consume medicamentos;
- implante estético.

**FR-011** — "Borrar ficha clínica" en la ficha.
- Pide una confirmación en pop-up, **sin PIN**. El pop-up dice qué se borra: la ficha, sus
  versiones y las fotos de antes y después de la clienta (filas en `archivos` y archivos en disco).
- Las notas de los tratamientos (`servicios_realizados.observaciones`) se conservan, porque son
  parte del registro del servicio.
- La bitácora registra "se borró la ficha clínica de CL-0001", sin contenido.

*Why:* decisión de Carlos del 2026-11-05. Atiende el derecho de cancelación (LFPDPPP).

**FR-010** — Si la clienta no tiene ficha, el botón dice "Llenar ficha clínica" y el detalle de la
cita muestra "Sin ficha clínica" en gris, sin alarma.

## 7. Business Rules
- **BR-001** — Una sola ficha vigente por clienta.
- **BR-002** — Las versiones anteriores son inmutables. Guardar sin cambios no crea versión.
- **BR-003** — "Sin responder" es distinto de "No". El aviso de FR-009 solo se basa en respuestas Sí.
- **BR-004** — "Especifique" solo se guarda cuando la respuesta es Sí.
- **BR-005** — Los datos de contacto viven solo en `clientes`. La ficha no los copia.
- **BR-006** — Los datos clínicos y las fotos nunca salen en:
  - exportaciones CSV;
  - reportes;
  - el Dashboard;
  - la bitácora (registra "se actualizó la ficha clínica de CL-0001", sin contenido);
  - los logs.
- **BR-007** — Las fotos se guardan dentro de la carpeta del negocio, en la carpeta del servicio. Es
  el proceso main el que decide la ruta, no el renderer. Formatos permitidos: jpg, jpeg, png, webp.
- **BR-008** — Las fotos entran en los respaldos, que ya incluyen `Datos/`, y se borran en el
  reinicio de datos, igual que los demás archivos de la clienta.
- **BR-009** — Una clienta con ficha clínica no se puede borrar mientras la ficha exista (FK
  `restrict`). El mensaje dice que primero se borre la ficha. La ficha sí se borra con FR-011.

## 8. Primary Flow
1. En Clientes se abre a la clienta y se pulsa "Llenar ficha clínica".
2. En el paso Datos ya aparecen su nombre, teléfono, correo y edad. Se marcan sexo y ocupación.
3. En Antecedentes, cada pregunta se responde Sí o No; en las Sí se escribe "Especifique".
4. En Análisis estético se escribe el motivo de la consulta y se marcan los chips.
5. Se pulsa Guardar.
6. En su siguiente cita, el detalle muestra "Precaución: alergias (…)".
7. Al cerrar la cita, se le agregan notas y fotos de antes y después desde el detalle de la cita o
   desde Tratamientos en la ficha.

**Expected Result:** la ficha queda vigente. Cada actualización deja una versión previa. Las fotos
quedan en la carpeta del servicio y en el siguiente respaldo.

## 9. Alternative and Error Flows
- **Servicio sin carpeta** (`carpeta_path` vacío, por datos viejos o un cierre sin carpeta): al
  subir la primera foto, el main crea la carpeta del servicio y la guarda en el servicio.
- **Archivo no permitido o ilegible:** mensaje "Esa foto no se pudo leer; usa JPG, PNG o WEBP" y
  no se guarda nada.
- **Foto borrada a mano del disco:** la miniatura dice "Foto no encontrada" y permite quitarla del
  registro.
- **Cerrar con cambios sin guardar:** confirmación "¿Descartar los cambios de la ficha?".
- **Clienta inactiva:** su ficha se puede consultar y editar.

## 10. Data

### Existing Data
- `clientes`: nombre, teléfono, correo y fecha de nacimiento.
- `servicios_realizados`: fecha, servicio, `observaciones` (las notas del tratamiento) y
  `carpeta_path`.
- `archivos`: `entidad_tipo` y `categoria` son texto. La categoría `foto` ya está prevista.
- `productos`: los que tienen precio de venta se usan para la recomendación para casa.

### New Data Requirements
Propuesta técnica; el Gate decide.

- **`fichas_clinicas`**: una fila por clienta (UNIQUE `cliente_id`).
  - Contiene sexo, ocupación, `version_formulario`, `datos` (JSON validado con zod en `shared/schemas.ts`),
    `created_at` y `updated_at`.
  - Se propone JSON porque el formulario espeja un documento en papel que cambiará, y ninguna
    consulta filtra por pregunta. El aviso de FR-009 se calcula al leer.
- **`fichas_clinicas_versiones`**: `ficha_id`, `datos` (JSON), `version_formulario`, `guardada_at`
  y `usuario_id`. Contiene la foto del estado anterior en cada guardado que cambia algo.
- **Fotos:** sin tabla nueva. Usan `archivos` con `entidad_tipo = 'servicio_realizado'` y
  `categoria = 'foto_antes' | 'foto_despues'`.
- **Recomendación para casa:** dentro de `datos`, como `{productoId, nombre}`. El nombre se copia
  para que la ficha no cambie si el producto se edita o se desactiva.

Contenido de `datos`, transcrito del formato en papel:

| Sección | Pregunta | Respuesta |
|---|---|---|
| Antecedentes clínicos | Alergias | Sí/No + especifique |
| | Diabetes | Sí/No |
| | E. renales | Sí/No + especifique |
| | E. respiratorias | Sí/No + especifique |
| | E. cardiacas | Sí/No + especifique |
| | E. digestivas | Sí/No + especifique |
| | Edemas | Sí/No + especifique |
| | Caída de cabello | Sí/No |
| | Porta marcapasos | Sí/No |
| | Cirugía facial | Sí/No + especifique |
| | Fractura facial | Sí/No + especifique |
| | Implante estético | Sí/No + especifique |
| | Implante dental | Sí/No |
| | Sufre convulsiones | Sí/No |
| | Problemas de presión | Sí/No + especifique |
| | Problemas de azúcar | Sí/No + especifique |
| | Consume medicamentos | Sí/No + especifique |
| | Embarazo | Sí/No |
| | Problemas hormonales | Sí/No + especifique |
| Cuidado de la piel | Tratamiento dermatológico | Sí/No + especifique |
| | Cosméticos de uso actual | texto |
| | Nivel de exposición solar | única: Alto / Medio / Bajo |
| | Uso de protector solar | Sí/No + especifique cuál |
| Hábitos tóxicos | Tabaco | Sí/No + frecuencia |
| | Alcohol | Sí/No + frecuencia |
| | Otros | texto |
| Análisis estético | Motivo de la consulta | texto |
| Tipología cutánea | Piel | múltiple: Eudérmica (normal), Seca, Grasa, Mixta, Asfixiada, Desvitalizada, Sensible |
| | Color | única: Normal, Rojiza, Amarillenta, Grisácea |
| | Secreción sebácea | única: Normal, Alípica, Seborreica, Mixta |
| | Grado de hidratación | única: Normal, Deshidratada, Hiperhidratada |
| | Textura | múltiple: Fina, Gruesa, Áspera, Suave, Brillosa |
| | Acné | múltiple: Comedones, Pápulas, Pústulas, Quistes |
| | Pigmentación | múltiple: Efélides, Hipercromías, Melasma, Nevus, Léntigos, Acromías |
| | Arrugas | múltiple: Expresión, Envejecimiento |
| | Vascularización | múltiple: Rosácea, Cuperosis, Telangiectasias, Eritrosis |
| | Flacidez cutánea | múltiple: Mejillas, Párpados, Óvalo facial |
| | Bolsas palpebrales | Sí/No; si Sí: Edema / Grasa |
| Para casa | Recomendación de productos | productos a la venta + texto |

La tabla de tratamientos del papel no se guarda dentro de `datos`. Sale de `servicios_realizados`
(FR-007).

### Sensitive Data
- Todo lo de esta ficha son **datos personales sensibles** (salud), según la LFPDPPP 2025.
- Las fotos del rostro son datos biométricos potenciales y, como mínimo, datos personales.
- La BD, las carpetas y los respaldos van **sin cifrar** (PROJECT.md → pii). Esta feature no
  cambia eso; ver §15.

## 11. Authorization
| Acción | Quién | Condición |
|---|---|---|
| Ver la ficha y sus versiones | Usuario con la app desbloqueada | Sin PIN adicional |
| Crear o actualizar la ficha | Usuario con la app desbloqueada | Sin PIN adicional |
| Subir foto de antes o después | Usuario con la app desbloqueada | Sin PIN adicional |
| Quitar una foto | Usuario con la app desbloqueada | Confirmación. Se borran la fila y el archivo físico |
| Borrar la ficha clínica completa (FR-011) | Usuario con la app desbloqueada | Confirmación en pop-up, **sin PIN** (decisión del dueño) |
| Editar notas de un tratamiento cerrado | Usuario con la app desbloqueada | Sin PIN; solo cambia `observaciones` |

## 12. UX Requirements
- Mismo lenguaje visual que el detalle de cita, según `docs/DISENO_BELLORA.md` y la memoria de
  diseño:
  - modal ancho (`ancho="2xl"`) con encabezado beige y avatar;
  - pasos con contador de pendientes;
  - chips grandes con texto, nunca íconos sueltos.
- Sí y No como un par de botones; la opción elegida queda resaltada. Pulsar otra vez la opción
  elegida la regresa a "sin responder".
- "Especifique" aparece con animación suave debajo de la pregunta y recibe el foco al marcar Sí.
- Miniaturas de fotos en dos columnas, Antes y Después. Vacíos: "Agregar foto de antes".
- Estado vacío de Tratamientos: "Aún no hay tratamientos cerrados".
- Aviso de Precaución: banda roja suave arriba del detalle de la cita, con el texto completo.

## 13. Non-Functional Requirements
- **Security:**
  - El renderer nunca recibe rutas para escribir fotos. El main resuelve la carpeta desde el servicio.
  - Para mostrar fotos, el main entrega la miniatura (data URL reducida con `nativeImage`, sin
    dependencias nuevas) o abre el archivo con el visor del sistema.
  - Toda ruta se valida con `rutaDentroDe`.
- **Performance:** las miniaturas se generan reducidas (≤ 320 px). La lista de tratamientos es corta
  (decenas).
- **Reliability:** guardar la ficha y su versión previa es una sola transacción.
- **Auditability:** la bitácora registra crear y actualizar la ficha, subir y quitar fotos, con
  código de clienta o servicio y sin contenido clínico.

## 14. Integrations
| Sistema | Propósito | Dirección | Impacto si falla |
|---|---|---|---|
| Sistema de archivos (carpeta del negocio) | Guardar fotos | main → disco | Foto no guardada; la ficha no se afecta |
| `shell.openPath` | Abrir la foto en grande | main → SO | Solo no se abre |
| Respaldos (`respaldos.ts`) | Incluir fotos | lectura | Ya incluye `Datos/`; no cambia |
| Reinicio (`reinicio.ts`) | Borrar las tablas nuevas | escritura | Si no se agregan, el reinicio falla por FK o deja datos clínicos. Hay que agregarlas |

## 15. Constraints
- La migración nueva es la `0006`. La Parte A del cobro ocupa la `0005`, así que la Parte B del
  cobro pasa a la `0007`. La `0006` se genera solo en una rama que ya contenga la `0005`.
- No se agregan dependencias nuevas (`package.json` es superficie crítica).
- **Marco legal** (PROJECT.md → Marco legal):
  - la LFPDPPP exige consentimiento **expreso y por escrito** para datos sensibles, y el contrato
    dice que "cualquier feature de fotos de tratamiento o notas clínicas entra por Gate 001 y
    requiere el flujo de consentimiento";
  - NOM-004-SSA3 podría exigir conservar el historial ≥ 5 años si la cosmiatría cuenta como
    atención médica.

## 16. Assumptions
- **A-001** — Una sola cabina y un solo usuario. No hace falta saber quién llenó la ficha más allá
  de `usuario_id`.
- **A-002** — El formato en papel es estable. Si cambia, `version_formulario` permite leer las
  versiones viejas con su esquema.
- **A-003** — Las fotos vienen de archivos en la computadora (cámara o celular pasados a la PC). No
  hay captura desde la cámara en esta versión.

## 17. Open Questions
- **Q-001 — Consentimiento. RESUELTA 2026-11-05, opción (a).** Carlos autorizó por escrito la
  edición de PROJECT.md: el Marco legal y `pii.notes` registran el consentimiento implícito como
  riesgo aceptado, solo para esta feature. La app no lleva casilla ni registro de consentimiento.
- **Q-002 — Borrado. RESUELTA 2026-11-05.**
  - Existe "Borrar ficha clínica" con confirmación en pop-up y sin PIN (FR-011).
  - Borra ficha, versiones y fotos.
  - `fichas_clinicas.cliente_id` lleva `restrict` (BR-009).
  - `fichas_clinicas_versiones.ficha_id` se borra junto con la ficha, en la misma transacción del
    servicio.

## 18. Acceptance Criteria
- **AC-001** — Dada una clienta sin ficha, cuando se abre su modal en Clientes, entonces aparece
  "Llenar ficha clínica". Al guardar con Alergias = Sí ("penicilina"), el detalle de cualquiera de
  sus citas muestra "Precaución: Alergias — penicilina".
- **AC-002** — Dada una ficha con Alergias = Sí ("penicilina"), cuando se cambia a No y se guarda,
  entonces la ficha vigente no tiene especifique, el aviso desaparece y "Versiones anteriores"
  muestra una versión con Alergias = Sí ("penicilina").
- **AC-003** — Dada una ficha guardada, cuando se pulsa Guardar sin cambios, entonces no se crea
  versión: el conteo de `fichas_clinicas_versiones` no cambia.
- **AC-004** — Dada una pregunta sin responder, entonces se guarda como `null`, no como "No", y
  el paso muestra un pendiente más.
- **AC-005** — Dado un servicio cerrado, cuando se sube una foto de antes desde el detalle de la
  cita, entonces:
  - aparece en la ficha clínica en el mismo tratamiento;
  - el archivo está dentro de la carpeta del servicio;
  - `archivos.categoria = 'foto_antes'`.
- **AC-006** — Dado un servicio con `carpeta_path` nulo, cuando se sube una foto, entonces el main
  crea la carpeta, actualiza `carpeta_path` y la foto queda dentro de la carpeta del negocio.
- **AC-007** — Dado un respaldo creado después de subir fotos, entonces el .zip contiene esas fotos.
  Dado un reinicio de datos, entonces `fichas_clinicas`, `fichas_clinicas_versiones` y las fotos
  quedan vacías.
- **AC-008** — Verificación por grep: ningún export CSV, reporte ni texto de bitácora contiene
  campos de `datos`. `grep -n "fichas_clinicas\|fichaClinica" electron/services/exportarCsv.ts electron/services/reportes*.ts`
  da 0 resultados.
- **AC-009** — `git diff -- package.json` no agrega dependencias.
- **AC-010** — `npm run typecheck` y `npm run build` pasan. Prueba manual con `npm run dev` sobre la
  BD de datos ficticios.

## 19. Success
- La cosmetóloga deja de llenar la ficha en papel para clientas nuevas.
- Toda cita de una clienta con antecedente delicado lo muestra antes de empezar.

## 20. References
- Formato en papel "Ficha clínica facial" (5 páginas), entregado por Carlos el 2026-11-05. No se
  versiona.
- `src/pages/Clientes.tsx` (FichaCliente) y `src/pages/agenda/CitaDetalleModal.tsx`.
- `electron/services/archivos.ts`, `folders.ts`, `respaldos.ts` y `reinicio.ts`.
- PROJECT.md: pii, critical_surfaces y marco legal.
- Spec del cobro v2, §23 y addenda (orden A → ficha → B).
