// Preload: the seam where Steam/desktop capabilities get exposed to the app
// via contextBridge. Nothing needed for the browser build; the game's
// Storage adapter (src/game/core/save.ts) can be swapped to a file-backed
// store here when the Steam build wants cloud-save-friendly persistence.

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("banjoDesktop", {
  isDesktop: true,
});
