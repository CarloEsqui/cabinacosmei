# Evidencia para auditoría — Ficha clínica facial (2026-11-06)

**Responde a:** [auditoria-ficha-clinica-2026-11-06.md](auditoria-ficha-clinica-2026-11-06.md) (FIC-A1,
M1, M2, B1–B7). Cierra la evidencia que piden el [Gate](gate-001-ficha-clinica-2026-11-05.md) y la
verificación de la `0007`.

**Responsable:** sesión de Claude Code del 2026-11-06. Los comandos de git los corre Carlos.

**Método y PII:**
- **Pruebas.** Corrieron sobre una **copia** de la BD de desarrollo, que solo tiene datos ficticios,
  en el scratchpad de la sesión (`/private/tmp`), con una copia nueva en cada corrida.
  - `carpetaRaiz` apunta a una carpeta de prueba y se usa un PIN de prueba.
  - Las fotos de prueba son un PNG generado y un WEBP mínimo de 1×1.
- **Dónde corren.** Las pruebas corren **dentro de Electron real**, no con `ELECTRON_RUN_AS_NODE`,
  porque las reglas de fotos usan `nativeImage`.
  - El bundle de esbuild importa los servicios reales de `electron/services/*` y el zod del IPC.
  - Se ejecuta con `node_modules/.bin/electron` y `app.whenReady()`, sin ventana.
- **Respaldo real de la cabina.** Se aplicaron `0004`…`0007` sobre una copia escribible del respaldo
  automático del 2026-11-05, la misma copia de solo lectura de la
  [evidencia de descuentos](evidencia-descuentos-2026-11-06.md). Solo se reportan conteos.

## RESPUESTAS a los hallazgos

1. **FIC-A1 — ¿Existe la evidencia?** **CORREGIDO: es esta nota.** Salida literal de la última
   corrida, después de las correcciones de abajo:
   ```
   migraciones: 8
   PASA AC-001 — aviso: [{"clave":"alergias","etiqueta":"Alergias","especifique":"penicilina"}]
   PASA BR-004 — diabetes No → especifique null; piel ["seca","sensible"]; color (única) ["normal"]
   PASA AC-004 — embarazo sin responder → null
   PASA AC-003 — versiones 0 → 0; updatedAt igual: true
   PASA AC-002 — vigente especifique null; aviso 0; versiones 1 (Sí: penicilina); rango = [true, true]
   PASA Cond. 4 — ventana vieja: "La ficha cambió en otra ventana; vuelve a abrirla." | crear sobre existente: "La ficha cambió en otra ventana; vuelve a abrirla."
   PASA Cond. 6 — formato anterior → datos null, crudos "{"formato":"viejo"}"
   PASA FIC-B2 — clave desconocida → cruda: true
   PASA AC-006 — carpeta creada dentro de la raíz: true; foto dentro de la carpeta del servicio: true
   PASA AC-005 — categoria foto_antes, tipo_mime image/png, en el tratamiento 1° de la ficha: true
   PASA Cond. 7 — ilegible: "Esa foto no se pudo leer; usa JPG o PNG." | extensión: "Esa foto no se pudo leer; usa JPG o PNG." | servicio abierto: "Las fotos se agregan cuando la cita ya está cerrada."
   PASA FIC-B3 — WEBP fuera de la lista: "Esa foto no se pudo leer; usa JPG o PNG."
   PASA Cond. 8 — miniatura JPEG: true; borrada a mano → faltante: true; fuera de la raíz: "La foto está fuera de la carpeta del negocio."
   PASA Cond. 9 — dinero intacto: true; bitácora sin contenido: "SRV-0001 · notas del tratamiento actualizadas"
   PASA BR-006 — 4 filas de bitácora; con contenido clínico: 0
   PASA BR-009 — "HISTORIAL_ASOCIADO:Esta clienta tiene citas, servicios, pagos o ficha clínica asociados. Desactívala en su lugar; si solo es la ficha clínica, bórrala primero desde la ficha."
   PASA AC-007a — el .zip contiene la foto de antes: true
   PASA FR-011 — ficha 0, versiones 0, fotos 0, archivo en disco: false, notas conservadas: true, no borrados 0
   PASA AC-007b — tras el reinicio: fichas 0, versiones 0, foto en disco: false

   19/19 pasan
   ```
   - Notas sobre la corrida:
     - El caso "servicio abierto" de la condición 7 abre un cierre real con `abrirCierre` antes de
       intentar subir la foto. En la primera corrida la BD de prueba no tenía servicios abiertos y el
       caso no se ejercitaba; se corrigió antes de dar la prueba por buena.
     - La "Cond. 8" de esta salida prueba la miniatura JPEG, el archivo faltante y la ruta fuera de
       la carpeta. No prueba el rendimiento.
   - **Respaldo real** (`0004` + `0005` + `0006` + `0007` juntas, partiendo de `0003`):
     - 8 migraciones aplicadas;
     - `fichas_clinicas` 0 filas y `fichas_clinicas_versiones` 0 filas;
     - 4 objetos nuevos en `sqlite_master`: 2 tablas y 2 índices;
     - estatus de pago idénticos a la corrida de la `0006`.
   - **Se concede un matiz:** el auditor tiene razón en que dos pruebas del Gate son manuales y
     siguen **pendientes de Carlos** en `npm run dev`:
     - (a) Condición 4 desde la UI: abrir la ficha desde Clientes y desde el detalle de una cita,
       guardar en la primera y luego en la segunda. La segunda debe rechazarse. El servicio ya lo
       hace (caso "Cond. 4" de arriba); falta verlo en pantalla.
     - (b) Condición 8 con 20 fotos o más de celular: la ficha debe abrir sin congelar la ventana.
2. **FIC-M1 — ¿El borrado alcanza a los respaldos?** **CORREGIDO en la app; PROJECT.md queda pendiente
   del dueño.**
   - El pop-up de FR-011 ahora agrega: "las copias de respaldo creadas antes de hoy todavía la
     contienen; si se restaura una, la ficha vuelve."
   - El texto equivalente en PROJECT.md (Marco legal) lo edita Carlos. Está anotado en el addendum
     del spec.
3. **FIC-M2 — ¿Se pierden notas no guardadas?** **CORREGIDO.**
   - `NotasTratamiento` avisa a su contenedor si hay texto sin guardar (`onPendiente`, guardado en
     un `ref` para no entrar en un bucle de renders).
   - En la ficha, el paso de Tratamientos **queda montado** (oculto con CSS fuera de su paso), así
     que cambiar de paso ya no borra lo escrito. Además, cerrar la ficha pregunta si hay notas o
     cambios pendientes.
   - En el detalle de la cita, cerrar con notas sin guardar pregunta "¿Descartarlas?".
   - La nota informativa del auditor también queda cubierta: dos editores de notas del mismo
     servicio en ventanas apiladas. El último que guarda gana, pero ninguno se cierra sin
     preguntar.
4. **FIC-B1 — ¿Los greps del Gate dan rojo?** **SE CONCEDE.** Estas son las formas que reproducen
   lo que el Gate quiere medir:
   ```
   $ grep -rn "PREGUNTAS_PRECAUCION" shared electron src | wc -l                      → 3
   $ grep -c "rutaDentroDe" electron/services/fichasClinicas.ts electron/services/archivos.ts
     electron/services/archivos.ts:3
     electron/services/fichasClinicas.ts:2
   ```
   - La constante vive en `shared/fichaClinica.ts` y la usa `precaucionesDe`, que el main llama.
     La UI solo pinta el resultado de `fichas:aviso`. Hay una sola definición.
   - Los tres handlers (`miniatura`, `abrirFoto`, `quitarFoto`) pasan por `fotoValidada`, y el
     borrado físico vuelve a validar en `archivos.borrarArchivosFisicos`.
5. **FIC-B2 — ¿El esquema abierto oculta claves viejas?** **CORREGIDO.** `listarVersiones` usa
   `leerVersion`: una versión de otro `version_formulario`, o con claves que el catálogo no conoce,
   se devuelve cruda ("formato anterior") en lugar de normalizarla. Lo prueba el caso FIC-B2.
6. **FIC-B3 — ¿WEBP se decodifica?** **CONFIRMADO, y corregido.** Un WEBP válido, verificado con
   `file` ("Web/P image, VP8 encoding, 1x1"), fue rechazado por
   `nativeImage.createFromPath(...).isEmpty()` en macOS. Por eso:
   - se quitó `webp` de `EXTENSIONES_FOTO` y de `MIME_FOTO`;
   - el mensaje ahora dice "usa JPG o PNG";
   - BR-007 queda corregido en el addendum del spec.
7. **FIC-B4 — ¿Orientación EXIF en el camino de respaldo?** **ABIERTO, se verifica a mano.** El
   camino principal (`createThumbnailFromPath`) respeta la orientación. El de respaldo solo corre si
   el sistema no da miniatura. Prueba pendiente: subir una foto vertical de celular y revisar la
   miniatura.
8. **FIC-B5 — ¿Decodificación síncrona al subir?** **INFORMATIVO, aceptado.** Ocurre una vez por
   foto y a petición de la usuaria. Si algún día existe "subir varias", no se repite este patrón en
   bucle.
9. **FIC-B6 — ¿Se inicializa con una caché invalidada?** **CORREGIDO.**
   - El borrador se inicializa solo con `isSuccess && !isFetching`, y la consulta vuelve a leer al
     abrir (`refetchOnMount: "always"`).
   - Un error de carga muestra "No se pudo cargar la ficha clínica" en lugar de un formulario vacío.
10. **FIC-B7 — ¿Tratamientos cancelados (CIT-C1)?** **REGISTRADO** como regla heredada en el
    addendum del spec, junto con DES-M1.

## Censo después del cambio
- **Lectores de las tablas nuevas fuera del módulo:**
  ```
  $ grep -rln "fichasClinicas\b\|fichas_clinicas" electron/services | grep -v "fichasClinicas.ts\|reinicio.ts"
  (vacío)
  ```
- **AC-008**, ampliado a Dashboard y Clientes:
  ```
  $ grep -n "fichas_clinicas\|fichaClinica\|fichasClinicas" electron/services/exportarCsv.ts electron/services/reportes*.ts electron/services/dashboard.ts electron/services/clientes.ts
  (vacío)
  ```
- **Bitácora:** todos los `detalle:` de `fichasClinicas.ts` interpolan solo el código de la clienta
  o del servicio, el momento de la foto (antes o después) y un conteo de fotos.
- **Rutas:** ninguna firma de `fichas:*` en `shared/ipc-contract.ts` recibe una ruta, y
  `grep -rn "file://" src` → 0.
- **Condición 9:** `grep -n "update(serviciosRealizados)" electron/services/fichasClinicas.ts electron/services/archivos.ts`
  → sin salida. El diff de `serviciosRealizados.ts` solo agrega `actualizarObservacionesServicio`.
- **Condición 13:** `grep -rln 'from "./fichasClinicas"' electron/services` → sin salida. Solo
  `ipc/index.ts` importa el módulo.
- **AC-009:** `git diff -- package.json` → sin cambios. No hay dependencias nuevas.
- **Superficies intactas:**
  - `respaldos.ts` no cambió: ya comprime `Datos/` completo y AC-007a lo confirma;
  - `exportarCsv.ts` no cambió: no lee la ficha (BR-006).

## Estado del árbol de trabajo
- **Todo sin commit**, en el árbol de `main`. Carlos crea la rama `atlas/ficha-clinica` antes del
  commit.
- `npm run typecheck` y `npm run build` pasan después de las correcciones.
- **Pendiente antes del tag** (release con `0004`…`0007`):
  - las pruebas manuales de Carlos: la guiada de la Parte A, la de descuentos y la de la ficha, que
    incluye (a) y (b) de FIC-A1 y la foto vertical de FIC-B4;
  - la edición de PROJECT.md por FIC-M1;
  - la fila de `APPLIED-MIGRATIONS.md` cuando se instale en la cabina.
