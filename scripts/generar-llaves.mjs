// Genera el par de llaves Ed25519 que firma y verifica las licencias de Bellora.
// Se corre UNA sola vez (o cuando decidas rotar las llaves, lo que invalida licencias ya emitidas).
//
// Uso:
//   node scripts/generar-llaves.mjs
//
// Resultado:
//   keys/licencia-privada.pem  -> NUNCA se comparte, nunca se empaqueta en la app, nunca se sube
//                                 al repo (ya está en .gitignore). Es lo único que puede firmar
//                                 licencias válidas. Guárdala también en un lugar seguro fuera de
//                                 esta computadora (gestor de contraseñas, USB cifrado, etc.):
//                                 si se pierde, no podrás emitir ni renovar licencias nunca más.
//   keys/licencia-publica.pem -> Se pega dentro del código de la app (electron/services/licencia.ts)
//                                para que la app pueda verificar tokens. No es secreta.

import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raizProyecto = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const carpetaLlaves = path.join(raizProyecto, "keys");
const rutaPrivada = path.join(carpetaLlaves, "licencia-privada.pem");
const rutaPublica = path.join(carpetaLlaves, "licencia-publica.pem");

if (existsSync(rutaPrivada)) {
  console.error(
    `Ya existe una llave privada en ${rutaPrivada}.\n` +
      "Si generas una nueva, todas las licencias firmadas con la anterior dejarán de ser válidas.\n" +
      "Si de verdad quieres rotarla, borra ese archivo a mano primero y vuelve a correr este script.",
  );
  process.exit(1);
}

mkdirSync(carpetaLlaves, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

writeFileSync(rutaPrivada, privateKey.export({ type: "pkcs8", format: "pem" }));
writeFileSync(rutaPublica, publicKey.export({ type: "spki", format: "pem" }));

console.log("Par de llaves generado:\n");
console.log(`  Privada: ${rutaPrivada}  (secreta — no la compartas ni la subas a ningún repo)`);
console.log(`  Pública: ${rutaPublica}  (esta sí se pega en el código de la app)\n`);
console.log("Siguiente paso: haz una copia de la llave privada en un lugar seguro FUERA de esta");
console.log("computadora (gestor de contraseñas, USB cifrado, etc.) antes de seguir.");
