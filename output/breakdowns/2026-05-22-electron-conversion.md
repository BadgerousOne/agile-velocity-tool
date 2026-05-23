# Task Breakdown: Electron Conversion — Self-Contained Desktop App

**Date:** 2026-05-22
**Spec:** `specs/2026-05-22-electron-conversion.md`
**Design:** `designs/2026-05-22-electron-conversion.md`
**Capacity assumed:** 1 engineer (Eric), no fixed deadline
**Critical path:** T1.1 → T1.2 → T1.4 → T2.1 → T2.2 → T2.4 → T2.5 → T3.1 → T3.3 → T3.4
**Sizing scheme:** S/M/L (S = ≤1 day, M = 2–3 days, L = 4–5 days)

---

## TL;DR
- 3 milestones, 16 tasks total
- Highest-risk task: **T2.2** — Ollama binary download + SHA-256 verification + extraction; depends on GitHub release URL format and tar behavior staying stable
- Earliest demo: end of M1 (~2 days) — full app in an Electron window, buddy works if Ollama is already installed
- `src/` is frozen except for **one line in `AgentBuddy.jsx`** (T1.5)

---

## M1: Electron Shell (~2 days)

**Demo:** Open the project with `npm run dev`, an Electron window appears with the full existing UI. If Ollama is already installed and running (or the app can start it), the buddy panel shows "Online". Running `npm run build:standalone` still produces a working standalone HTML file.

| ID | Title | Size | Depends on | Acceptance | Notes |
|----|-------|------|------------|------------|-------|
| T1.1 | Add electron-vite, electron, electron-builder packages; create `electron.vite.config.js` | S | — | `npm run dev` launches an Electron window showing the existing UI with no console errors; `npm run build:standalone` still produces a valid HTML file | The renderer section of `electron.vite.config.js` imports from `vite.config.js` — test both build paths before declaring done |
| T1.2 | Write `electron/main.js` — BrowserWindow creation, app lifecycle hooks | S | T1.1 | Window opens on `app.whenReady()`; closes cleanly on Cmd+Q; macOS dock behavior (re-open on activate) works correctly | Set `webPreferences: { contextIsolation: true, nodeIntegration: false, preload: <path> }` |
| T1.3 | Write `electron/preload.js` — `contextBridge` exposing `window.ollamaApi` | S | T1.1 | `window.ollamaApi.onStatus` and `window.ollamaApi.offStatus` are callable from the renderer DevTools console; no Node APIs are accessible from the renderer | Only these two methods exposed — nothing else |
| T1.4 | Write `electron/ollama.js` — probe 11434, adopt existing instance or spawn `ollama serve`, monitor, kill on quit | M | T1.2 | If Ollama is already running: app starts, status reaches `ready`, existing Ollama process is not killed on quit. If Ollama is installed but not running: app spawns it, status reaches `ready`. If Ollama is not installed: status reaches `error` (first-launch handling is M2) | `ownedByApp` flag controls quit behavior; probe runs before spawn; emit `ollama:status` on every state transition via `webContents.send` |
| T1.5 | Update `AgentBuddy.jsx` — use `window.ollamaApi.onStatus()` when available, HTTP probe as fallback | S | T1.3 | In Electron: buddy status indicator updates without an HTTP probe (verify by blocking `fetch` in DevTools — status still changes). In standalone HTML: existing HTTP probe fires as before | **Only renderer change in entire conversion.** Gate on `typeof window.ollamaApi !== 'undefined'` |
| T1.6 | Update `package.json` scripts — add `dev`, `dev:browser`, `build`, `build:standalone`, `build:dmg` | S | T1.1 | All six scripts run without error; `dev:browser` opens original Vite browser dev server; `dev` opens Electron; `build:standalone` output is unchanged | Preserve all existing script names to avoid breaking muscle memory |

**Parallel batches:**
- Batch 1: T1.1
- Batch 2: T1.2, T1.3, T1.6 (all depend only on T1.1)
- Batch 3: T1.4 (depends T1.2), T1.5 (depends T1.3)

---

## M2: First-Launch Setup (~3–4 days)

**Demo:** On a machine with nothing installed — no Ollama binary, no models — open the Electron app. A splash window appears showing two sequential progress bars: "Downloading Ollama (X MB / 200 MB)" then "Downloading model llama3.2 (X GB / 2.2 GB)". When both complete, the splash closes, the main window opens, and the buddy panel immediately shows "Online" with no terminal interaction at any point.

| ID | Title | Size | Depends on | Acceptance | Notes |
|----|-------|------|------------|------------|-------|
| T2.1 | Write `electron/firstLaunch.js` — detect binary presence at `userData/ollama/bin/ollama` and model presence via `ollama list` | S | T1.2 | Returns `{ needsBinary: true, needsModel: true }` on a clean machine; returns `{ needsBinary: false, needsModel: false }` after setup is complete; function is independently unit-testable with a mock `userData` path | Use `fs.existsSync` for binary; use `child_process.execFile(binaryPath, ['list'])` for model check |
| T2.2 | Implement Ollama binary download + SHA-256 verification + extraction in `electron/ollama.js` | M | T2.1 | Given a clean `userData`, calling `downloadBinary()` produces an executable at `userData/ollama/bin/ollama`; SHA-256 of the downloaded tgz matches the value fetched from the GitHub release's checksum file; a corrupt download is rejected and deleted | **Highest-risk task.** Pin `OLLAMA_VERSION = '0.3.14'` as a named constant. Detect `process.arch` (`arm64` → `arm64`, `x64` → `amd64`). Emit `ollama:status { state: 'downloading', phase: 'binary', downloaded, total }` during fetch |
| T2.3 | Create splash `BrowserWindow` with progress UI (`electron/splash.html` + inline CSS) | M | T1.2 | Splash window opens before main window; shows app name, current phase label, a progress bar, and downloaded/total byte counts; updates in real time as `ollama:status` events arrive; closes programmatically when setup is complete | Self-contained HTML file (no bundler needed for splash). Use `ipcRenderer.on('ollama:status', ...)` directly in splash — no contextBridge needed since splash is internal only. Center window on screen |
| T2.4 | Implement model pull — spawn `ollama pull llama3.2`, parse stdout progress, emit status events | M | T2.2 | Given the Ollama binary is present, calling `pullModel('llama3.2')` emits `ollama:status { state: 'downloading', phase: 'model', downloaded, total }` events as the model downloads; resolves when `ollama list` confirms the model is present | `ollama pull` writes progress lines like `pulling manifest`, `pulling <hash>: X% ▕...▏ X GB`. Parse with a regex; fall back to indeterminate progress if format doesn't match |
| T2.5 | Wire first-launch flow in `main.js` — orchestrate splash, firstLaunch checks, download, pull, main window | S | T2.1, T2.2, T2.3, T2.4 | Full happy path works end-to-end on a clean machine (verified manually); if user quits during download, the child processes are cleaned up and no zombie processes remain; on re-launch after interrupted download, flow resumes from the correct step | Open splash first; hide main window until setup complete; call `firstLaunch.check()` → conditionally call `downloadBinary()` → conditionally call `pullModel()` → close splash → show main window → start `ollama serve` |

**Parallel batches:**
- Batch 1: T2.1, T2.3 (independent; both depend only on completed M1)
- Batch 2: T2.2 (depends T2.1)
- Batch 3: T2.4 (depends T2.2)
- Batch 4: T2.5 (depends T2.1, T2.2, T2.3, T2.4)

---

## M3: Distribution & Polish (~2 days)

**Demo:** `npm run build:dmg` completes without errors and produces `dist/agile-velocity-tool-universal.dmg`. Mounting the DMG and dragging the app to Applications, then opening it on a clean macOS 13 machine (no dev tools, no Ollama, no Node) results in the first-launch flow completing and the buddy working — without touching a terminal. `npm run build:standalone` still produces a working HTML file.

| ID | Title | Size | Depends on | Acceptance | Notes |
|----|-------|------|------------|------------|-------|
| T3.1 | Configure `electron-builder` in `package.json` — target `dmg`, arch `universal`, `appId`, `productName`, output path | S | — | `npm run build:dmg` exits 0 and produces a `.dmg` file in `dist/`; the `.dmg` mounts and the `.app` bundle opens | `arch: ['universal']` in electron-builder config builds a fat binary containing both arm64 and x64 slices. Set `mac.minimumSystemVersion: '13.0'` |
| T3.2 | Create app icon — `build/icon.icns` (macOS) and `build/icon.png` (fallback) | S | — | The app icon appears in the Dock and in Finder; the DMG background shows the app icon correctly | 1024×1024 source PNG; use `electron-icon-builder` or manually export `.icns`. Can use a simple placeholder icon if a designed asset isn't ready |
| T3.3 | Configure `BrowserWindow` security hardening — CSP header, disable `webSecurity` false, verify `contextIsolation` on | S | T3.1 | DevTools Security panel shows no CSP violations; `window.require` is undefined in renderer console; `window.ollamaApi` is the only injected global | Add CSP via `session.defaultSession.webRequest.onHeadersReceived`; verify entitlements allow `child-process` for spawning Ollama |
| T3.4 | Smoke test on clean macOS 13 machine | M | T3.1, T3.2, T3.3 | All acceptance criteria from spec met: (1) no terminal opened at any point; (2) first-launch flow completes; (3) buddy shows "Online"; (4) sprint CRUD, velocity charts, forecasting, releases all work; (5) switching workspaces resets buddy conversation; (6) `buddy_enabled` toggle in Settings shows/hides the FAB | Test on Apple Silicon. If Intel machine unavailable, verify the x64 slice runs correctly under Rosetta. Document any failures as bugs before declaring M3 done |
| T3.5 | Verify standalone build is unaffected — run both `build:dmg` and `build:standalone` in sequence | S | T3.1 | `npm run build:standalone` produces `dist-standalone/agile-velocity-tool.html` after `npm run build:dmg` has run; opening the HTML in a browser shows the full app; no assets are missing; file size is within 10% of pre-conversion baseline | Run both in a single shell session to confirm they don't share output dirs or clobber each other's artifacts |

**Parallel batches:**
- Batch 1: T3.1, T3.2 (independent)
- Batch 2: T3.3, T3.5 (both depend on T3.1; can run in parallel)
- Batch 3: T3.4 (depends T3.1, T3.2, T3.3, T3.5 — final gate)

---

## Risks & Open Questions

- **Ollama download URL format changes:** GitHub release asset names or the checksum file format could change with a new Ollama release. Mitigation: `OLLAMA_VERSION` is a named constant in `ollama.js`; add a comment to verify the URL pattern when bumping the version
- **`electron.vite.config.js` re-exporting `vite.config.js`:** If `vite.config.js` uses patterns that don't compose cleanly into electron-vite's renderer config (e.g. `root` or `build.outDir` set explicitly), T1.1 will require config surgery. Mitigation: T1.1 must be completed and both build paths verified before starting any other task
- **`ollama pull` output format:** Progress parsing in T2.4 depends on Ollama's stdout format, which is not a documented API. Mitigation: implement with a regex and a fallback to indeterminate progress bar; test against the pinned Ollama version
- **Universal binary build time:** `electron-builder` universal builds run the Vite build twice (once per arch) and may take 5–10 minutes. Mitigation: acceptable for release builds; `dev` uses native arch only and stays fast
- **Open:** Should a "Check for Ollama updates" mechanism be added in a future phase, or should the pinned version be bumped manually? `[OWNER: Eric — defer to post-M3]`

---

## Appendix
- Linked spec: `specs/2026-05-22-electron-conversion.md`
- Linked design: `designs/2026-05-22-electron-conversion.md`
- Prior Agent Buddy breakdown: `output/breakdowns/2026-05-22-embedded-agent-buddy.md`
