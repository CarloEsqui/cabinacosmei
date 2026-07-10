// Rasteriza build/icon.svg a build/icon.png (1024x1024). electron-builder deriva de ahí
// el .ico (Windows) y .icns (macOS) automáticamente al empaquetar.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const dirActual = path.dirname(fileURLToPath(import.meta.url));
const rutaSvg = path.join(dirActual, "..", "build", "icon.svg");
const rutaPng = path.join(dirActual, "..", "build", "icon.png");

const svg = fs.readFileSync(rutaSvg, "utf-8");
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } });
const png = resvg.render().asPng();

fs.writeFileSync(rutaPng, png);
console.log(`Ícono generado en ${rutaPng}`);
