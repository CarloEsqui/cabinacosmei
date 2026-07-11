// Muestra de un vistazo quién está al corriente, quién está por vencer y quién ya venció.
//
// Uso:
//   node scripts/listar-licencias.mjs

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raizProyecto = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rutaRegistro = path.join(raizProyecto, "keys", "clientes-licencias.json");

if (!existsSync(rutaRegistro)) {
  console.log("Todavía no has emitido ninguna licencia. Corre: node scripts/firmar-licencia.mjs");
  process.exit(0);
}

const registro = JSON.parse(readFileSync(rutaRegistro, "utf8"));
const hoy = new Date().toISOString().slice(0, 10);

function estadoDe(expira) {
  const diasRestantes = Math.round((new Date(expira) - new Date(hoy)) / 86_400_000);
  if (diasRestantes < 0) return `VENCIDA (hace ${-diasRestantes}d)`;
  if (diasRestantes <= 7) return `por vencer (${diasRestantes}d)`;
  return `activa (${diasRestantes}d)`;
}

const filas = registro
  .slice()
  .sort((a, b) => a.expira.localeCompare(b.expira))
  .map((r) => ({
    Cliente: r.cliente,
    Plan: r.plan,
    Expira: r.expira,
    Estado: estadoDe(r.expira),
    Monto: r.monto ?? "—",
  }));

console.table(filas);
