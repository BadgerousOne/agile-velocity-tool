# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Electron app in dev mode (renderer at http://localhost:5173, DevTools auto-open)
npm run dev:browser      # Browser-only dev server at http://localhost:5173 (no Electron)
npm run build            # Electron production bundle → out/
npm run build:standalone # Single self-contained HTML → dist-standalone/agile-velocity-tool.html
npm run build:dmg        # Full macOS DMG: vendor setup + Electron build + electron-builder
npm run vendor:setup     # Download Ollama binary into vendor/ (required before build:dmg)
npm run preview          # Serve dist/ locally
npm run lint             # ESLint
npm run test:run         # Vitest single run (CI)
npm test                 # Vitest in watch mode
```

Run a single test file:
```bash
npx vitest run src/utils/velocityCalc.test.js
```

## Architecture

**Stack:** React 18 + Vite + Electron (electron-vite), Recharts for charts, Vitest + Testing Library for tests.

The app ships in three modes:
1. **Electron desktop app** — primary distribution; bundles an Ollama binary for Agent Buddy
2. **Browser dev mode** (`dev:browser`) — full UI without Electron-specific features
3. **Standalone HTML** — single self-contained file for offline use, no AI features

**Routing** is a plain `switch` on `state.activeTab` in [App.jsx](src/App.jsx). Navigation dispatches `SET_TAB`. There are no URLs or route params.

### Electron layer (`electron/`)

- `main.js` — app lifecycle: splash window (first-launch model pull only), main window, CSP headers (prod only), Ollama start/stop wired to `app` events
- `ollama.js` — manages the bundled Ollama binary: `prepareBinary()` (chmod + xattr quarantine removal), `start()`/`stop()`, `pullModel()`, a 30 s watchdog that restarts if the port goes silent, and a simple event bus (`onStatus`/`getCurrentStatus`) that pushes `{ state }` objects to IPC listeners
- `preload.js` — exposes `window.ollamaApi = { onStatus, offStatus }` via `contextBridge`; the renderer checks `typeof window.ollamaApi !== 'undefined'` to detect Electron vs. browser
- `firstLaunch.js` — flag-file check to skip the model-pull splash on subsequent launches

`electron.vite.config.js` builds `main` and `preload` as CJS (`index.cjs`) and the renderer as a standard Vite bundle rooted at `index.html`.

Ollama binary lives at `vendor/ollama` (universal macOS binary). It is unpacked from the asar at `resources/app.asar.unpacked/vendor/ollama` in production.

### State management (two-layer context)

`WorkspaceContext` (outer) manages the workspace index and active workspace ID, stored in their own localStorage keys. `VelocityContext` (inner) holds all per-workspace data using `useReducer`. `VelocityProvider` receives a `storageKey` prop; when that prop changes (workspace switch), it flushes the outgoing workspace and loads the incoming one without unmounting — preserving `activeTab`.

State is loaded synchronously in the `useReducer` lazy initializer so there is no flash of default state. The default workspace (`agile_velocity_tool_state`) gets sample data on first load; additional workspaces start from `emptyWorkspaceState`.

**All state mutations go through the reducer in [VelocityContext.jsx](src/context/VelocityContext.jsx).** Components call `dispatch({ type, ...payload })`. Important actions:
- `ADD_SPRINT` — carries forward previous sprint's allocation, resets day-off fields, auto-fills holiday PTO from the member's region, suggests committed points via weighted velocity
- `UPDATE_MEMBER` — syncs `memberName` across all sprint capacity rows when the name changes
- `REMOVE_MEMBER` — removes the member's row from every sprint
- `LOAD_STATE` — replaces entire state; runs migration + sanitization (used by import and workspace switch)
- `RECALC_SPRINT_HOLIDAYS` / `RECALC_ALL_SPRINT_HOLIDAYS` — re-derives holiday PTO without clobbering manual adjustments

### Data model key relationships

- `TeamMember.regionId` → `Region.id` → drives holiday auto-fill in sprint capacity rows
- `Sprint.memberCapacity[]` is a `MemberCapacityRow` per team member per sprint; allocation % + day-off fields live here, not on the member
- `MemberCapacityRow.ptoDays` = `holidayDays` (auto) + any manual additions; `holidayDays` and `holidayNames` stored separately so recalculation doesn't destroy manual overrides
- `ReleasePlan.milestones[].dependsOnMilestoneIds` references sibling milestone IDs; `normalizeReleaseMilestones()` enforces referential integrity on every write

### Utility layers

- **[src/utils/velocityCalc.js](src/utils/velocityCalc.js)** — all capacity and velocity math: `calcEffectiveCapacity`, `calcFullCapacity`, `calcCapacityUtilization`, `calcCapacityAdjustedVelocity`, `calcWeightedVelocity`, `calcPredictability`, `calcTrend`, `buildChartData`, `runMonteCarloForecast`, `buildHealthSignals`. Pure functions; import and test them directly.
- **[src/utils/forecastCalc.js](src/utils/forecastCalc.js)** — time-period and sprint-count forecasting: `calcPeriodForecast`, `buildPeriodForecasts`, `buildCumulativeChartData`.
- **[src/utils/stateSchema.js](src/utils/stateSchema.js)** — schema versioning (`CURRENT_SCHEMA_VERSION = 2`), `migrateStateBySchema`, `sanitizeImportedState` (strips HTML from free-text fields to prevent XSS), `validateImportedState`, `buildExportPayload`.
- **[src/utils/buddyContext.js](src/utils/buddyContext.js)** — builds a compact token-efficient string from app state for the Agent Buddy system prompt; omits memberCapacity rows, release plans, and credentials.
- **[src/utils/buddyActions.js](src/utils/buddyActions.js)** — `ACTION_DEFINITIONS` (Ollama tool-call schema), `parseActionEnvelope` (parses `\`\`\`action` fences), `stripActionFence`.

`aggregateCapacity()` is exported from `VelocityContext.jsx` (not the utils) and imported by `velocityCalc.js` — avoid circular imports.

### Agent Buddy (`AgentBuddy.jsx`)

A floating chat panel backed by a local Ollama instance. Key behaviors:
- Feature-flagged via `localStorage.getItem('buddy_enabled')`; toggled in Settings, signals via `buddy-config-changed` custom event
- In Electron: listens to `window.ollamaApi.onStatus` (IPC from main process) instead of HTTP-probing Ollama
- In browser: HTTP-probes `localhost:11434/api/version`, then probes tool-calling support with a dummy request to determine whether to use native Ollama tool calls (T3.5 path) or `\`\`\`action` fence parsing (T3.1 path)
- When enabled, the "AI Assistant" tab is hidden from the sidebar (Sidebar.jsx checks `buddy_enabled`)
- When the LLM proposes `CREATE_SPRINT`, the panel renders a `SprintPreviewCard` for user confirmation before dispatching `ADD_SPRINT`

### AI Assistant (`AIAssistant.jsx`)

Supports OpenAI, Anthropic, Google Gemini, and Ollama. API keys stored in `sessionStorage` only — never in localStorage or state.

### Standalone build

`vite.standalone.js` uses `vite-plugin-singlefile` to inline all assets into one HTML file. `build-standalone.js` is the build script.

### Persistence / localStorage keys

| Key | Content |
|---|---|
| `agile_velocity_tool_state` | Default workspace state |
| `agile_velocity_tool_state_ws-<id>` | Per-workspace state |
| `agile_velocity_tool_workspaces` | Workspace index array |
| `agile_velocity_active_workspace` | Active workspace ID |
| `buddy_enabled` | `'true'` when Agent Buddy is on |
| `buddy_ollama_url` | Ollama base URL (default `http://localhost:11434`) |
| `buddy_model` | Model name (default `llama3.2`) |
