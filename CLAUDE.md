# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # start dev server at http://localhost:5173
npm run build            # production bundle → dist/
npm run build:standalone # single self-contained HTML → dist-standalone/agile-velocity-tool.html
npm run preview          # serve dist/ locally
npm run lint             # ESLint
npm test                 # Vitest in watch mode
npm run test:run         # Vitest single run (CI)
```

Run a single test file:
```bash
npx vitest run src/utils/velocityCalc.test.js
```

## Architecture

**Stack:** React 18 + Vite, no router library, Recharts for charts, Vitest + Testing Library for tests.

**Routing** is a plain `switch` on `state.activeTab` in `App.jsx`. Navigation dispatches `SET_TAB`. There are no URLs or route params.

### State management (two-layer context)

`WorkspaceContext` (outer) manages the workspace index and which workspace is active. It stores the workspace list and active ID in their own localStorage keys. `VelocityContext` (inner) holds all per-workspace data using `useReducer`. `VelocityProvider` receives a `storageKey` prop from `WorkspaceContext`; when that prop changes (workspace switch), it flushes the outgoing workspace to its slot and loads the incoming workspace's data without unmounting — preserving `activeTab`.

State is loaded synchronously in the `useReducer` lazy initializer so there is no flash of default state. The default workspace (`agile_velocity_tool_state`) gets sample data on first load; additional workspaces start from `emptyWorkspaceState`.

**All state mutations go through the reducer in `VelocityContext.jsx`.** Components call `dispatch({ type, ...payload })`. See the reducer for the full action list; important ones:
- `ADD_SPRINT` — carries forward previous sprint's allocation, resets day-off fields, auto-fills holiday PTO from the member's region, suggests committed points via weighted velocity
- `UPDATE_MEMBER` — syncs `memberName` across all sprint capacity rows when the name changes
- `REMOVE_MEMBER` — removes the member's row from every sprint
- `LOAD_STATE` — replaces entire state; runs migration + sanitization (used by import and workspace switch)
- `RECALC_SPRINT_HOLIDAYS` / `RECALC_ALL_SPRINT_HOLIDAYS` — re-derives holiday PTO without clobbering manual adjustments

### Data model key relationships

- `TeamMember.regionId` → `Region.id` → drives holiday auto-fill in sprint capacity rows
- `Sprint.memberCapacity[]` is a `MemberCapacityRow` per team member per sprint; allocation % + day-off fields live here, not on the member
- `MemberCapacityRow.ptoDays` = `holidayDays` (auto) + any manual additions; `holidayDays` and `holidayNames` are stored separately so recalculation doesn't destroy manual overrides
- `ReleasePlan.milestones[].dependsOnMilestoneIds` references sibling milestone IDs; `normalizeReleaseMilestones()` enforces referential integrity on every write

### Utility layers

- **`src/utils/velocityCalc.js`** — all capacity and velocity math: `calcEffectiveCapacity`, `calcFullCapacity`, `calcCapacityUtilization`, `calcCapacityAdjustedVelocity`, `calcWeightedVelocity`, `calcPredictability`, `calcTrend`, `buildChartData`, `runMonteCarloForecast`, `buildHealthSignals`. These are pure functions; import and test them directly.
- **`src/utils/forecastCalc.js`** — time-period and sprint-count forecasting: `calcPeriodForecast`, `buildPeriodForecasts`, `buildCumulativeChartData`.
- **`src/utils/stateSchema.js`** — schema versioning (`CURRENT_SCHEMA_VERSION = 2`), `migrateStateBySchema`, `sanitizeImportedState` (strips HTML from free-text fields to prevent XSS), `validateImportedState`, `buildExportPayload`.

`aggregateCapacity()` is exported from `VelocityContext.jsx` (not the utils) and imported by `velocityCalc.js` — avoid circular imports.

### Standalone build

`vite.standalone.js` uses `vite-plugin-singlefile` to inline all assets into one HTML file. The build script is `build-standalone.js`. The output file is designed to be opened directly in a browser with no server.

### AI Assistant

`AIAssistant.jsx` supports OpenAI, Anthropic, Google Gemini, and Ollama. API keys are stored in `sessionStorage` only (cleared on tab close) — never in localStorage or state.

### Persistence / localStorage keys

| Key | Content |
|---|---|
| `agile_velocity_tool_state` | Default workspace state |
| `agile_velocity_tool_state_ws-<id>` | Per-workspace state |
| `agile_velocity_tool_workspaces` | Workspace index array |
| `agile_velocity_active_workspace` | Active workspace ID |
