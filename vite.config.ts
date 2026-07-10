import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rolldownOptions: {
              external: ["better-sqlite3"],
            },
            watch: {
              // El propio watcher interno del plugin (Rollup/Rolldown) debe ignorar su carpeta
              // de salida; si no, ve su archivo recién compilado como "cambio" y entra en bucle.
              exclude: ["dist-electron/**", "dist/**", "node_modules/**"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            watch: {
              exclude: ["dist-electron/**", "dist/**", "node_modules/**"],
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    watch: {
      // Evita que Vite re-triggeree la compilación al detectar sus propios archivos de salida.
      ignored: ["**/dist-electron/**", "**/dist/**", "**/release/**", "**/drizzle/**"],
    },
  },
  optimizeDeps: {
    // "scheduler" es una dependencia interna (CJS) de react-dom; si no se pre-empaqueta junto con
    // react-dom, react-dom intenta hacer require("scheduler") en tiempo de ejecución dentro del
    // navegador, donde no existe `require`, y la app falla al montar.
    include: ["react-dom", "scheduler"],
  },
});
