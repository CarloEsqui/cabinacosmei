import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createPublicKey, verify } from "node:crypto";
import { obtenerMatricula } from "./matricula";
import { fechaLocalIso } from "../../shared/fechas";
import type { EstadoLicencia } from "../../shared/types";

// Llave pública de Bellora — no es secreta, solo sirve para VERIFICAR licencias, nunca para
// firmarlas. Generada con scripts/generar-llaves.mjs; la privada correspondiente vive fuera del
// repo y solo la usa scripts/firmar-licencia.mjs.
const LLAVE_PUBLICA_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlk69IDaBErAmYzRWIlh0YABw6LTLgP8/kIbs4BpmhxA=
-----END PUBLIC KEY-----
`;

// Con cuántos días de anticipación empieza el aviso "por vencer", según el plan: el mensual con 7
// días basta; el anual conviene avisarlo con un mes de anticipación (el banner se mantiene visible
// hasta el vencimiento, pasando por los hitos de 15 y 7 días conforme se acerca).
const DIAS_AVISO_MENSUAL = 7;
const DIAS_AVISO_ANUAL = 30;
const DIAS_GRACIA = 3;

function diasAvisoPorVencer(plan: "mensual" | "anual"): number {
  return plan === "anual" ? DIAS_AVISO_ANUAL : DIAS_AVISO_MENSUAL;
}

let rutaArchivo: string | null = null;

function rutaLicencia(): string {
  if (!rutaArchivo) rutaArchivo = path.join(app.getPath("userData"), "licencia.json");
  return rutaArchivo;
}

interface AlmacenLicencia {
  token: string;
  ultimaFechaVista: string;
}

function leerAlmacen(): AlmacenLicencia | null {
  try {
    return JSON.parse(fs.readFileSync(rutaLicencia(), "utf8"));
  } catch {
    return null;
  }
}

// Guarda la licencia en un archivo aparte de la base de datos a propósito: "Restablecer de
// fábrica" o restaurar un respaldo en otra máquina no debe desactivar ni arrastrar la licencia,
// porque es un dato del EQUIPO, no del negocio.
function guardarAlmacen(almacen: AlmacenLicencia): void {
  fs.mkdirSync(path.dirname(rutaLicencia()), { recursive: true });
  fs.writeFileSync(rutaLicencia(), JSON.stringify(almacen, null, 2));
}

interface PayloadLicencia {
  cliente: string;
  plan: "mensual" | "anual";
  emitida: string;
  expira: string;
  installId: string;
  v: number;
}

function verificarToken(token: string): PayloadLicencia | null {
  try {
    const [payloadB64, firmaB64] = token.trim().split(".");
    if (!payloadB64 || !firmaB64) return null;
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const firma = Buffer.from(firmaB64, "base64url");
    const publicKey = createPublicKey(LLAVE_PUBLICA_PEM);
    if (!verify(null, Buffer.from(payloadJson), publicKey, firma)) return null;

    const payload = JSON.parse(payloadJson) as Partial<PayloadLicencia>;
    if (!payload.cliente || !payload.plan || !payload.expira || !payload.installId) return null;
    return payload as PayloadLicencia;
  } catch {
    return null;
  }
}

function calcularEstado(payload: PayloadLicencia | null, ultimaFechaVista: string | undefined): EstadoLicencia {
  const matricula = obtenerMatricula();
  const hoy = fechaLocalIso();

  if (!payload) {
    return { estado: "no_activada", cliente: null, plan: null, expira: null, diasRestantes: null, matricula };
  }

  const base = { cliente: payload.cliente, plan: payload.plan, expira: payload.expira, matricula };

  if (payload.installId !== matricula) {
    return { ...base, estado: "invalida", diasRestantes: null };
  }

  // Anti-retroceso de reloj: si "hoy" quedó antes de la fecha más alta ya vista alguna vez, el
  // reloj del sistema se movió hacia atrás — no confiar en él para evitar burlar la expiración
  // atrasando la fecha del equipo a propósito.
  if (ultimaFechaVista && hoy < ultimaFechaVista) {
    return { ...base, estado: "invalida", diasRestantes: null };
  }

  const diasRestantes = Math.round(
    (new Date(payload.expira).getTime() - new Date(hoy).getTime()) / 86_400_000,
  );

  let estado: EstadoLicencia["estado"];
  if (diasRestantes <= -DIAS_GRACIA) estado = "vencida";
  else if (diasRestantes <= diasAvisoPorVencer(payload.plan)) estado = "por_vencer";
  else estado = "activa";

  return { ...base, estado, diasRestantes };
}

export function estadoLicencia(): EstadoLicencia {
  const almacen = leerAlmacen();
  const payload = almacen ? verificarToken(almacen.token) : null;
  const estado = calcularEstado(payload, almacen?.ultimaFechaVista);

  const hoy = fechaLocalIso();
  if (almacen && (!almacen.ultimaFechaVista || hoy > almacen.ultimaFechaVista)) {
    guardarAlmacen({ ...almacen, ultimaFechaVista: hoy });
  }

  return estado;
}

export function instalarToken(token: string): EstadoLicencia {
  const payload = verificarToken(token);
  if (!payload) {
    throw new Error("El token no es válido. Revisa que lo hayas copiado completo, sin espacios de más.");
  }
  if (payload.installId !== obtenerMatricula()) {
    throw new Error("Esta licencia fue emitida para otro equipo (la matrícula no coincide).");
  }
  guardarAlmacen({ token: token.trim(), ultimaFechaVista: fechaLocalIso() });
  return estadoLicencia();
}
