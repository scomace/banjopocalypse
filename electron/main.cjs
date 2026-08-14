// BANJOPOCALYPSE desktop wrapper. Loads the built SPA from dist/ over
// file:// (HashRouter makes routes work without a server). Steam later:
// add steamworks.js init here and forward AchievementBus events over IPC.

const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 590,
    backgroundColor: "#120d08",
    autoHideMenuBar: true,
    title: "BANJOPOCALYPSE",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
