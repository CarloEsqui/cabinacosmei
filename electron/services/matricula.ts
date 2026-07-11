import { execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { createHash } from "node:crypto";

function idCrudoWindows(): string | null {
  try {
    const salida = execFileSync(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { encoding: "utf8" },
    );
    return salida.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function idCrudoMac(): string | null {
  try {
    const salida = execFileSync("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8" });
    return salida.match(/"IOPlatformUUID"\s*=\s*"([0-9A-F-]+)"/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function idCrudoPorMac(): string {
  for (const lista of Object.values(networkInterfaces())) {
    for (const iface of lista ?? []) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        return iface.mac;
      }
    }
  }
  return "sin-identificador-disponible";
}

/**
 * Identificador único del equipo, derivado del hardware (no un uuid guardado en un archivo): si
 * alguien copia toda la carpeta instalada a otra computadora, la matrícula recalculada ahí no
 * coincide con la de esta máquina, así que una licencia firmada para esta no sirve en la otra.
 */
export function obtenerMatricula(): string {
  const idCrudo =
    (process.platform === "win32" ? idCrudoWindows() : null) ??
    (process.platform === "darwin" ? idCrudoMac() : null) ??
    idCrudoPorMac();
  const hash = createHash("sha256").update(idCrudo).digest("hex").slice(0, 16).toUpperCase();
  return hash.match(/.{1,4}/g)!.join("-");
}
