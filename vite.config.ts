import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aacharPlugin } from "./scripts/vite-aachar-plugin";
import { levelDraftsPlugin } from "./scripts/vite-level-drafts-plugin";
import { sfxTrimPlugin } from "./scripts/vite-sfx-trim-plugin";

export default defineConfig({
  // aacharPlugin backs the /admin/aachar editor (dev serve only). It writes to
  // public/aachar/ ONLY, never into the module graph, so saving never triggers
  // a reload. Ported from accountingsurvivor with its three save guards intact.
  // levelDraftsPlugin backs /admin/levels the same way: drafts land in
  // src/game/levels/drafts/ (versioned, but not imported by anything).
  // sfxTrimPlugin backs /admin/sfx: it writes src/game/audio/sfx-trim.json,
  // which IS imported (the balance ships), so a save hot-updates the engine.
  plugins: [react(), aacharPlugin(), levelDraftsPlugin(), sfxTrimPlugin()],
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
