// Emite (o renueva) la licencia de una clienta: firma un token con la llave privada y lo guarda
// en el registro local para que sepas quién pagó, qué plan tiene y cuándo vence.
//
// Uso:
//   node scripts/firmar-licencia.mjs
//
// Requiere haber corrido antes: node scripts/generar-llaves.mjs

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivateKey, sign } from "node:crypto";
import { createInterface } from "node:readline/promises";

const raizProyecto = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rutaPrivada = path.join(raizProyecto, "keys", "licencia-privada.pem");
const rutaRegistro = path.join(raizProyecto, "keys", "clientes-licencias.json");

if (!existsSync(rutaPrivada)) {
  console.error("No existe keys/licencia-privada.pem. Corre primero: node scripts/generar-llaves.mjs");
  process.exit(1);
}

const privateKey = createPrivateKey(readFileSync(rutaPrivada, "utf8"));

function cargarRegistro() {
  if (!existsSync(rutaRegistro)) return [];
  return JSON.parse(readFileSync(rutaRegistro, "utf8"));
}

function guardarRegistro(registro) {
  mkdirSync(path.dirname(rutaRegistro), { recursive: true });
  writeFileSync(rutaRegistro, JSON.stringify(registro, null, 2));
}

function sumarMeses(fechaIso, meses) {
  const d = new Date(`${fechaIso}T00:00:00`);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function firmarToken(payload) {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString("base64url");
  const firma = sign(null, Buffer.from(payloadJson), privateKey);
  return `${payloadB64}.${firma.toString("base64url")}`;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function preguntar(texto, porDefecto) {
  const sufijo = porDefecto ? ` [${porDefecto}]` : "";
  const respuesta = (await rl.question(`${texto}${sufijo}: `)).trim();
  return respuesta || porDefecto || "";
}

async function main() {
  console.log("=== Emitir / renovar licencia de Bellora ===\n");

  const registro = cargarRegistro();

  const cliente = await preguntar("Nombre del negocio o clienta");
  if (!cliente) {
    console.error("El nombre es obligatorio.");
    process.exitCode = 1;
    return;
  }

  const existente = registro.find((r) => r.cliente.toLowerCase() === cliente.toLowerCase());
  if (existente) {
    console.log(
      `\nYa existe un registro para "${cliente}" (matrícula: ${existente.installId}, expiraba: ${existente.expira}). Esto lo actualiza.\n`,
    );
  }

  // Por ahora la matrícula se captura a mano (te la pasa la clienta). Cuando exista la pantalla de
  // activación en la app, ahí se mostrará el valor real derivado del hardware de su equipo.
  const matricula = await preguntar("Matrícula del equipo (te la manda la clienta)", existente?.installId);
  if (!matricula) {
    console.error("La matrícula es obligatoria.");
    process.exitCode = 1;
    return;
  }

  const plan = (await preguntar("Plan: mensual o anual", existente?.plan ?? "mensual")).toLowerCase();
  if (plan !== "mensual" && plan !== "anual") {
    console.error('El plan debe ser "mensual" o "anual".');
    process.exitCode = 1;
    return;
  }

  const monto = await preguntar("Monto pagado (opcional)", "");
  const metodoPago = await preguntar("Método de pago (opcional)", "");

  const emitida = new Date().toISOString().slice(0, 10);
  const expira = sumarMeses(emitida, plan === "anual" ? 12 : 1);

  const token = firmarToken({ cliente, plan, emitida, expira, installId: matricula, v: 1 });

  const registroActualizado = registro.filter((r) => r.cliente.toLowerCase() !== cliente.toLowerCase());
  registroActualizado.push({
    cliente,
    installId: matricula,
    plan,
    emitida,
    expira,
    monto: monto || null,
    metodoPago: metodoPago || null,
  });
  guardarRegistro(registroActualizado);

  console.log("\n--- Token para enviarle a la clienta (copiar y pegar tal cual) ---\n");
  console.log(token);
  console.log(`\nVálido hasta: ${expira}`);
  console.log(`Guardado en el registro local: ${rutaRegistro}`);
  console.log("Revisa quién está al corriente con: node scripts/listar-licencias.mjs");
}

try {
  await main();
} catch (error) {
  if (error?.code === "ABORT_ERR") {
    console.log("\nCancelado. No se guardó ningún cambio.");
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  rl.close();
}
