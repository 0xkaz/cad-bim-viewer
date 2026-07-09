import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vite";

function webIfcWasmPlugin(): Plugin {
  const wasmDir = path.resolve(__dirname, "node_modules/web-ifc");
  const publicWasmDir = path.resolve(__dirname, "public/wasm");
  const wasmFiles = ["web-ifc.wasm", "web-ifc-mt.wasm"];

  return {
    name: "web-ifc-wasm",
    buildStart() {
      // Copy WASM files to public/wasm so they are served and bundled
      fs.mkdirSync(publicWasmDir, { recursive: true });
      for (const file of wasmFiles) {
        const src = path.join(wasmDir, file);
        const dest = path.join(publicWasmDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/wasm", (req, res, next) => {
        const fileName = path.basename(req.url ?? "");
        const filePath = path.join(wasmDir, fileName);
        if (fs.existsSync(filePath)) {
          res.setHeader("Content-Type", "application/wasm");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          fs.createReadStream(filePath).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), webIfcWasmPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 6000,
  },
});
