# Tech Design: Electron Conversion — Self-Contained Desktop App

**Date:** 2026-05-22
**Author:** Eric
**Audience:** Engineering (solo)
**Status:** Draft
**Spec:** `specs/2026-05-22-electron-conversion.md`

---

## TL;DR
- Wrap the existing Vite/React app with `electron-vite`; add an `electron/` directory containing `main.js` (lifecycle) and `preload.js` (contextBridge)
- The main process owns the entire Ollama lifecycle: probe for an existing instance, adopt or spawn, monitor, kill on quit
- A minimal `contextBridge` surface (`window.ollamaApi`) pushes Ollama status events to the renderer — `AgentBuddy.jsx` gets one conditional change to consume it; the standalone HTML build is unaffected
- Both the Electron build and the standalone HTML build continue to work from the same `src/` with no renderer-side changes beyond the one AgentBuddy line
- **Recommended approach:** `electron-vite` + child-process Ollama management + `ipcMain`/`contextBridge` IPC

---

## Context

See [`specs/2026-05-22-electron-conversion.md`](../specs/2026-05-22-electron-conversion.md) for the full problem statement. A design is needed because there are three non-obvious architectural tradeoffs: (1) keeping both build targets live without duplicating config, (2) detecting and adopting a system Ollama vs. spawning the app's own, and (3) how much of the Ollama lifecycle to expose to the renderer vs. keeping it entirely in the main process.

### Locked from spec
> "A user on a fresh macOS machine can open the installed app and have the Agent Buddy working — without ever opening a terminal."
> "All existing features continue to work identically after conversion."
> Non-goal: "Changing any code in `src/` — all React components, context, utilities, and tests are frozen." *(One exception: one line in `AgentBuddy.jsx` — see below.)*

---

## Proposed Approach

- Add `electron/main.js` and `electron/preload.js` alongside the existing `src/`; add `electron.vite.config.js` at the project root that imports the renderer section from the existing `vite.config.js`
- The main process runs the Ollama lifecycle state machine: `idle → probing → adopting|downloading → starting → ready|error`; it pushes every state transition to the renderer via `webContents.send('ollama:status', payload)`
- On first launch, main downloads the Ollama binary to `userData/ollama/bin/` and pulls the default model with `OLLAMA_HOME=userData/ollama/home`; both downloads emit progress events that the renderer shows on a splash screen
- On subsequent launches, the binary and model are already present; `ollama serve` starts in < 2 seconds
- `AgentBuddy.jsx` replaces its HTTP probe with a subscription to `window.ollamaApi.onStatus()` when running in Electron; the existing probe runs unchanged when `window.ollamaApi` is absent (standalone HTML build)
- `vite.config.js` and `vite.standalone.js` are untouched; `npm run build:standalone` continues to work

---

## Architecture & Components

### New files

```
electron/
  main.js           — app entry point, BrowserWindow, Ollama lifecycle, IPC
  preload.js        — contextBridge: exposes window.ollamaApi to renderer
  ollama.js         — Ollama manager module (download, probe, spawn, monitor)
  firstLaunch.js    — first-launch detection + progress window logic

electron.vite.config.js   — electron-vite config (main + preload + renderer)
```

### Modified files

```
src/components/AgentBuddy.jsx   — one change: use window.ollamaApi.onStatus()
                                   when available, keep HTTP probe as fallback
package.json                    — new scripts, electron-builder config, main entry
```

### Unchanged files

```
src/               — everything else: components, context, utils, tests, CSS
vite.config.js     — browser dev / standalone build
vite.standalone.js — standalone HTML build config
```

### Ollama lifecycle state machine (`electron/ollama.js`)

```
idle
  │  app ready
  ▼
probing ──── port 11434 responds ──▶ adopting
  │                                      │ mark ownedByApp=false
  │  port closed                         ▼
  ▼                                   ready ◀───────┐
downloading (first launch only)                      │
  │  binary + model present                         restart
  ▼                                                  │
starting ────────── ollama serve exits ─────────────▶ (if ownedByApp)
  │
  ▼
ready
```

**State payloads** sent via `ollama:status`:

```js
{ state: 'starting' }
{ state: 'downloading', phase: 'binary'|'model', downloaded: number, total: number }
{ state: 'ready' }
{ state: 'error', message: string, retryable: boolean }
```

### IPC surface (`electron/preload.js`)

```js
contextBridge.exposeInMainWorld('ollamaApi', {
  onStatus:  (cb) => ipcRenderer.on('ollama:status', (_, s) => cb(s)),
  offStatus: (cb) => ipcRenderer.off('ollama:status', cb),
});
```

Nothing else is exposed. Node integration in the renderer is off. Context isolation is on.

### `AgentBuddy.jsx` — the one renderer change

```js
// Replace the HTTP probe useEffect with:
useEffect(() => {
  if (!open) return;
  if (window.ollamaApi) {
    // Electron path: subscribe to main-process status events
    setOllamaOnline(null);
    const handler = ({ state }) => setOllamaOnline(state === 'ready');
    window.ollamaApi.onStatus(handler);
    return () => window.ollamaApi.offStatus(handler);
  }
  // Standalone / browser path: existing HTTP probe (unchanged)
  setOllamaOnline(null);
  const ac = new AbortController();
  probeOllama(ollamaUrl, ac.signal).then(online => {
    if (!ac.signal.aborted) setOllamaOnline(online);
  });
  return () => ac.abort();
}, [open, ollamaUrl]);
```

### Ollama binary management (`electron/ollama.js`)

```js
const OLLAMA_VERSION = '0.3.14';   // pinned; update consciously
const ARCH_MAP = { arm64: 'arm64', x64: 'amd64' };
const arch = ARCH_MAP[process.arch] ?? 'amd64';
const DOWNLOAD_URL =
  `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin-${arch}.tgz`;

// Paths
const ollamaDir  = path.join(app.getPath('userData'), 'ollama');
const binaryPath = path.join(ollamaDir, 'bin', 'ollama');
const ollamaHome = path.join(ollamaDir, 'home');   // OLLAMA_HOME env var
```

The binary is downloaded with `https.get`, extracted with the built-in `tar` (`child_process.execFile('/usr/bin/tar', ['-xzf', tgzPath, '-C', binDir])`), and marked executable with `fs.chmod`. SHA-256 of the download is checked against the value published in the GitHub release's `sha256sum` file before extraction.

### Dual build scripts (`package.json`)

```json
"scripts": {
  "dev":              "electron-vite dev",
  "dev:browser":      "vite",
  "build":            "electron-vite build",
  "build:standalone": "vite build --config vite.standalone.js",
  "build:dmg":        "npm run build && electron-builder",
  "preview":          "vite preview",
  "test":             "vitest",
  "test:run":         "vitest run"
}
```

`electron.vite.config.js` structure:

```js
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import baseViteConfig from './vite.config.js';

export default defineConfig({
  main:     { build: { lib: { entry: 'electron/main.js' } } },
  preload:  { build: { lib: { entry: 'electron/preload.js' } } },
  renderer: { ...baseViteConfig, plugins: [react()] },
});
```

---

## Alternatives & Tradeoffs

| Option | Summary | Pros | Cons | Why not |
|--------|---------|------|------|---------|
| **A. Manual Electron + Vite (no electron-vite)** | Wire `electron` and `vite` separately via `concurrently` and `wait-on` | Full control, no abstraction | Must manually manage dev server URL injection into Electron, asset path rewriting, and HMR restarts; ongoing friction in every dev session | `electron-vite` handles exactly these problems; the overhead of doing it manually buys nothing for a solo project |
| **B. Local Node/Express server** | Node server manages Ollama, serves the React bundle | Simpler than Electron; no packaging | Still requires the user to run `npm start` in a terminal; opens in a browser tab, not a native window; no `.dmg`; does not satisfy the "zero terminal interaction" spec goal | Concretely fails the primary success metric: fresh-machine user still needs to touch a terminal |
| **C. Bundle Ollama binary in the .dmg** | Ship Ollama inside the installer | No network required for the binary | Adds ~200 MB to every installer download; binary must be updated with every Ollama release by rebuilding the .dmg; arm64/x64 installers must be separate | Adds permanent maintenance weight for a one-time UX improvement that a 3-second download also solves; the model download is unavoidable regardless |

---

## Failure Modes & Edge Cases

| Failure | Expected behavior |
|---------|-------------------|
| Binary download fails (network error) | Show error with Retry button; app is fully usable for all non-buddy features |
| Binary SHA-256 mismatch | Delete the download, show error, do not execute the binary |
| Model pull interrupted mid-download | `ollama pull` resumes automatically on retry (Ollama handles partial downloads); show Retry button |
| Port 11434 in use by non-Ollama process | Probe returns a non-Ollama response; skip adopt, spawn fails on port conflict; show error: "Port 11434 is in use by another application" |
| Ollama crashes post-launch | `child_process` `exit` event fires; main waits 1 second, restarts once, sends `ollama:status { state: 'starting' }`; if restart also exits, sends `state: 'error'` |
| User quits app while model is downloading | Cancel the `ollama pull` child process cleanly; partial model file stays in `ollamaHome` and will be resumed on next launch |
| System Ollama running (adopt path) | `ownedByApp = false`; app uses it, does not kill on quit; version may differ from pinned — acceptable |

---

## Security & Privacy

- Context isolation is on; Node integration in renderer is off — the renderer cannot access Node APIs directly
- `window.ollamaApi` exposes only two event-listener methods; no file system, no shell access from the renderer
- Ollama binary download is verified against the GitHub release SHA-256 before execution — prevents tampered binaries from running
- Ollama listens on `127.0.0.1:11434` only; no external network exposure
- No PII leaves the machine; all sprint data stays in `localStorage`; model inference is local

---

## Migration / Backward Compatibility

- `localStorage` data is untouched; users who were previously using the standalone HTML build can open the Electron app and their data is already there (same origin, same localStorage namespace)
- The standalone HTML build continues to ship unchanged; its users are unaffected by this conversion
- `AgentBuddy.jsx` has one code change (the probe useEffect); when `window.ollamaApi` is absent (standalone build), the existing HTTP probe runs — no regression

---

## Dependencies

**New packages:**
- `electron` ^28.0.0 — desktop app shell; macOS 13+ minimum is satisfied by Electron 28
- `electron-vite` ^2.0.0 — build tooling wrapper
- `electron-builder` ^24.0.0 — `.dmg` packaging

**Existing packages:** unchanged. All 85 renderer tests continue to run against the same `src/` via `vitest`.

---

## Observability & Testing Strategy

- **Existing tests:** all 85 pass unchanged (they run against `src/` via Vitest, which has no Electron dependency)
- **Main process:** no unit tests in scope; the lifecycle logic is tested by running the app. Add `console.log`/`electron-log` calls at each state transition for debuggability
- **Integration smoke test (manual):** fresh `userData` directory → launch → verify first-launch progress screen appears → verify buddy is online after pull completes
- **Regression check:** `npm run build:standalone` must produce a working HTML file after the conversion; add this to the `build:dmg` CI step

**Verifying spec success metrics:**
- "0 terminal interactions" — verified by the smoke test on a fresh machine
- "< 5s to buddy online on subsequent launches" — time from app open to `ollama:status { state: 'ready' }` in the main process log
- "85 tests passing" — `npm run test:run` in CI

---

## Rollout Plan

Three sequential milestones (see task breakdown):
1. **M1 — Electron shell:** app launches, existing UI works in Electron window, Ollama spawned if already installed
2. **M2 — First-launch setup:** binary download + model pull with progress UI; fully self-contained on fresh machine
3. **M3 — Distribution:** `electron-builder` DMG, app icon, window polish, smoke test on clean machine

No feature flags needed — the conversion is all-or-nothing; the standalone build is the rollback path during development.

---

## Risks

- **Pinned Ollama version becomes stale:** If Ollama's download URL structure changes (GitHub releases have been stable for years, but it's not guaranteed), the bootstrap breaks. Mitigation: add a version constant at the top of `ollama.js` with a comment to check for updates quarterly
- **`electron.vite.config.js` re-exporting `vite.config.js`** may require massaging if `vite.config.js` uses `defineConfig` in a way that doesn't compose cleanly. Mitigation: test this in M1 before any other work; fix before proceeding
- **Model pull takes > 10 minutes on slow connection** and the user force-quits the app. Ollama stores partial downloads and `ollama pull` resumes them, but this behavior depends on Ollama's internal implementation. Mitigation: document "safe to quit and reopen" in the first-launch UI
- **arm64 / x64 binary mismatch** if `process.arch` is incorrect (e.g., Rosetta). Mitigation: log `process.arch` on launch; test on both Apple Silicon and Intel before release

---

## Open Questions

- ~~First-launch progress screen: splash or main-window overlay?~~ **Resolved:** Separate splash `BrowserWindow`.
- ~~Universal `.dmg` or separate arm64/x64 installers?~~ **Resolved:** Single universal `.dmg`.

---

## Appendix

- Linked spec: `specs/2026-05-22-electron-conversion.md`
- Prior Agent Buddy design: `designs/2026-05-22-embedded-agent-buddy.md`
- `electron-vite` docs: https://electron-vite.org
- `electron-builder` docs: https://www.electron.build
- Ollama GitHub releases: https://github.com/ollama/ollama/releases
