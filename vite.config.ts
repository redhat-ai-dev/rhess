import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  build: {
    outDir: resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@ui": resolve(__dirname, "src/ui"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/.well-known": "http://localhost:3000",
      "/healthz": "http://localhost:3000",
      "/readyz": "http://localhost:3000",
    },
  },
});
