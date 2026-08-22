import React from "react";
import ReactDOM from "react-dom/client";
import { AppRouter } from "./router";
import { registerDraftFromUrl } from "./game/levels/drafts";
import "./index.css";
import "@fontsource/press-start-2p";

// /admin/levels "Play" opens the game with the draft in the URL; honour it
// before anything builds a sim.
registerDraftFromUrl(window.location.search);

function render() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppRouter />
    </React.StrictMode>,
  );
}

if (import.meta.env.DEV) {
  // Level drafts saved from /admin/levels override the authored grids while
  // developing (src/game/levels/drafts.ts). Pulled once before first render so
  // a quickstart straight into a drafted level sees the draft. Stripped from
  // production builds along with this whole branch.
  import("./game/levels/draftsClient")
    .then((m) => m.loadDevDrafts())
    .then((n) => {
      if (n > 0) console.info(`[levels] ${n} draft(s) active; toggle in /admin/levels`);
    })
    .catch(() => {})
    .finally(render);
} else {
  render();
}
