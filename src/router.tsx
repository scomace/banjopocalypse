// BANJOPOCALYPSE router. HashRouter on purpose: works identically on
// Cloudflare Pages static hosting and under Electron's file:// without any
// server rewrite rules. Admin routes are dev tools; they stay out of the
// menu flow but ship (tiny) so the game can be tuned anywhere.

import { lazy, Suspense } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { GameShell } from "./shell/GameShell";

const AaCharAdmin = lazy(() =>
  import("./screens/admin-aachar/AaCharAdmin").then((m) => ({
    default: m.AaCharAdmin,
  })),
);
const ComicExclaimLab = lazy(() =>
  import("./screens/admin-exclaim/ComicExclaimLab").then((m) => ({
    default: m.ComicExclaimLab,
  })),
);
const BakerLab = lazy(() =>
  import("./screens/admin-baker/BakerLab").then((m) => ({
    default: m.BakerLab,
  })),
);
const SpriteGallery = lazy(() =>
  import("./screens/admin-sprites/SpriteGallery").then((m) => ({
    default: m.SpriteGallery,
  })),
);

function AdminLoading() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-slate-400">
      loading admin tool...
    </div>
  );
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<GameShell />} />
        <Route
          path="/admin/aachar"
          element={
            <div className="admin-root">
              <Suspense fallback={<AdminLoading />}>
                <AaCharAdmin />
              </Suspense>
            </div>
          }
        />
        <Route
          path="/admin/baker"
          element={
            <div className="admin-root">
              <Suspense fallback={<AdminLoading />}>
                <BakerLab />
              </Suspense>
            </div>
          }
        />
        <Route
          path="/admin/sprites"
          element={
            <div className="admin-root">
              <Suspense fallback={<AdminLoading />}>
                <SpriteGallery />
              </Suspense>
            </div>
          }
        />
        <Route
          path="/admin/exclaim"
          element={
            <div className="admin-root">
              <Suspense fallback={<AdminLoading />}>
                <ComicExclaimLab />
              </Suspense>
            </div>
          }
        />
      </Routes>
    </HashRouter>
  );
}
