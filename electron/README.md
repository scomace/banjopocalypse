# BANJOPOCALYPSE desktop / Steam path

The game is Electron-ready by construction:

- HashRouter (no server rewrites needed under file://)
- All asset paths relative; no absolute URLs anywhere
- No Node APIs in game/shell code
- localStorage behind a Storage adapter (src/game/core/save.ts,
  `setStorageAdapter`) so desktop builds can persist to disk
- AchievementBus hook points: victory/markVictory, boss kills, YEEHAW
  completions all flow through src/game/core/save.ts and the run layer

## Run it locally

```
npm run build
npx electron electron/main.cjs
```

(Install electron as a devDependency first: `npm i -D electron`. It is not
in package.json by default so the web deploy stays lean.)

## Packaging for Steam

1. `npm i -D electron electron-builder`
2. Add an electron-builder config (appId, win target nsis or steam depot dir)
3. `npx electron-builder --dir` produces the unpacked app for a Steam depot
4. For Steamworks integration add `steamworks.js`, init in main.cjs with the
   app id, and bridge achievements through preload.cjs
