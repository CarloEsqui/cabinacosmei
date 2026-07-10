// Reconstruye módulos nativos (better-sqlite3) contra el ABI de Electron.
//
// En macOS con solo "Command Line Tools" (sin Xcode.app completo), clang no añade
// automáticamente `-isysroot` al compilar C++, por lo que no encuentra headers de
// libc++ como <climits>. Exportamos CPLUS_INCLUDE_PATH/SDKROOT apuntando al SDK activo
// para que la recompilación funcione sin depender de instalar Xcode completo.
import { execSync } from "node:child_process";

function shell(cmd) {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

const env = { ...process.env };

if (process.platform === "darwin") {
  const sdkPath = shell("xcrun --show-sdk-path");
  env.SDKROOT = sdkPath;
  env.CPLUS_INCLUDE_PATH = `${sdkPath}/usr/include/c++/v1`;
}

execSync("npx electron-builder install-app-deps", { stdio: "inherit", env });
