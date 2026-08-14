import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aacharPlugin } from "./scripts/vite-aachar-plugin";

export default defineConfig({
  // aacharPlugin backs the /admin/aachar editor (dev serve only). It writes to
  // public/aachar/ ONLY, never into the module graph, so saving never triggers
  // a reload. Ported from accountingsurvivor with its three save guards intact.
  plugins: [react(), aacharPlugin()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: true,
    port: 5199,
  },
  build: {
    chunkSizeWarningLimit: 4000,
  },
});
