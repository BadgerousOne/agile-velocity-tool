# Changelog

All notable changes to the Agile Velocity Tool are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [2026-06-06]

### Fixed — WS-20260606-004: Align Ollama URL config between Electron main and Settings UI

- Watchdog no longer hard-codes `127.0.0.1:11434` — it now uses the URL configured in Settings (`buddy_ollama_url`), communicated from the renderer to the main process via IPC on every launch
- Production CSP `connect-src` now includes `http://localhost:11434` alongside `http://127.0.0.1:11434`, fixing a bug where all default renderer Ollama API calls were blocked in packaged builds
- New IPC method: `window.ollamaApi.setUrl(url)` (no-op in browser mode via `?.` guard)



### Added — WS-20260606-003: Jira and Azure DevOps native sprint sync

- **Sync Sprints** button in each provider card (visible when connected) — fetches live sprint data without any CSV export step
- Jira sync: discovers board automatically from project key, fetches closed + active sprints, aggregates story points from issues (supports both `story_points` and `customfield_10016`)
- Azure DevOps sync: fetches iterations and work items, batches point queries in groups of 200, detects Done/Closed/Resolved/Completed states
- Sprint preview table before import: shows name, dates, committed/completed points, and duplicate detection (New / Already imported badges)
- `IMPORT_SYNCED_SPRINTS` reducer: merges new sprints sorted by start date, skips duplicates by name or date range, auto-recalculates holiday PTO
- Clear inline error messages for auth failures (401/403), CORS/network blocks (with Electron mode guidance), and empty results
- 20 new tests; full suite: 105 passing

### Added — WS-20260606-002: Agent Buddy user discovery and health signals

- Discovery nudge in Settings for users who have never enabled Agent Buddy
- First-run guided welcome message when the buddy is enabled for the first time
- Health signal badge on the buddy FAB — visible without opening the panel

### Added — WS-20260606-001: Electron first-launch UX and macOS DMG distribution

- Splash screen with progress bar for first-launch Ollama model pull
- Ollama binary bundled in app (no download at first launch)
- 30-second watchdog that restarts Ollama if the port goes silent
- macOS universal DMG packaging via `npm run build:dmg`
- Preload unpacked from asar; binary permissions set at startup
