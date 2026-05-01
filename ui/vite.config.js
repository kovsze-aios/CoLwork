import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // The config lives in ui/, but `vite build --config ui/vite.config.js` runs
  // from the project root. Pin the root explicitly so index.html resolves.
  root: here,
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    outDir: resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
