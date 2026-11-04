# Applied migrations

Registro de qué migraciones están aplicadas en cada entorno — el único lugar para responder
"¿qué está corriendo la cabina de verdad?".

Particularidad de este proyecto: no hay servidor. `migrate()` (electron/db/index.ts) aplica
`drizzle/` sola al abrir la app, en cada instalación. "Entorno" = cada instalación real; la
fila se agrega cuando se confirma que la instalación abrió con el release que trae la migración
(la tabla `__drizzle_migrations` de su `cabina.sqlite3` es la verificación).

Reglas:
- Una fila por migración **por instalación**, agregada **después** de verificar (una fila es un
  hecho, no una intención).
- `Verified` cita la comprobación: conteo de filas en `__drizzle_migrations` o existencia del
  objeto, sobre un respaldo de la instalación (solo lectura, sin copiar datos al repo).
- Nunca renumerar ni reordenar. Aplicación fuera de orden es un hallazgo.
- `PROJECT.md → database.applied_log` apunta a este archivo.

| # | Migration | Environment | Applied on | By | Verified |
|---|---|---|---|---|---|
| 0000 | `0000_lively_nuke.sql` | cabina (única instalación) | [pending: verificar] | auto-update | [pending: leer `__drizzle_migrations` de un respaldo — owner: Carlos] |
| 0001 | `0001_flashy_midnight.sql` | cabina (única instalación) | [pending: verificar] | auto-update | [pending] |
| 0002 | `0002_hallazgos_estado.sql` | cabina (única instalación) | [pending: verificar] | auto-update | [pending] |
| 0003 | `0003_presentacion_producto.sql` | cabina (única instalación) | [pending: verificar] | auto-update | [pending] |
