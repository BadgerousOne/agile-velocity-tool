# Spec: Electron Conversion — Self-Contained Desktop App

**Date:** 2026-05-22
**Author:** Eric
**Audience:** Engineering (solo)
**Status:** Draft

## TL;DR
- The agile velocity tool currently requires users to install and start Ollama manually before the Agent Buddy feature works — blocking the "zero external services" goal
- Converting to Electron allows the app to own the full Ollama lifecycle: download the binary, start the server, pull a model, and keep everything running — all invisibly
- The existing React source (`src/`) is entirely unchanged; the Electron main process is the only new layer
- First-launch UX: download progress screen (binary ~200 MB, model ~2.2 GB); subsequent launches: Ollama is online within ~2 seconds of app open
- **Direction:** Wrap the existing Vite/React app with `electron-vite`; manage Ollama as a child process in the main process; distribute as a macOS `.dmg`

## Problem
- The Agent Buddy feature depends on Ollama running at `http://localhost:11434`. Today this requires: installing Ollama, running `ollama serve`, and pulling a model — three terminal steps before the buddy is usable
- Any user opening the tool for the first time sees a "Ollama isn't running" setup card rather than a working assistant
- The standalone HTML build has no hook point for process management at all — Ollama is permanently a manual step in that distribution
- The tool is meant to be self-sufficient; requiring a separate process managed by the user contradicts that goal

## Goals
- A user on a fresh macOS machine can open the installed app and have the Agent Buddy working — without ever opening a terminal
- Ollama starts automatically every time the app opens, and stops when the app closes
- The first-launch experience downloads all required components (Ollama binary, default model) automatically with visible progress
- All existing features (sprints, velocity charts, forecasting, releases, AI assistant, buddy) continue to work identically after conversion
- The app is distributable as a `.dmg` that installs and runs on macOS without any developer tools present

## Non-Goals
- Bundling the LLM model inside the installer (models are 2+ GB; users download on first launch)
- Windows or Linux builds in this phase
- App Store distribution or notarization for wide public release
- Changing any code in `src/` — all React components, context, utilities, and tests are frozen
- Cloud or remote Ollama support (localhost only)
- Auto-update for the app itself

## Target Users / Stakeholders
- **Primary user:** Eric — engineering manager, sole user of this tool, macOS
- **Sign-off:** Eric

## Success Metrics
- **Time to first buddy response (fresh machine):** baseline `never works without manual setup` → target `< 5 min including model download on first launch`
- **Time to buddy online (subsequent launches):** baseline `manual` → target `< 5 seconds after app window opens`
- **Terminal interactions required:** baseline `3 (install, serve, pull)` → target `0`
- **Existing test suite:** baseline `85 passing` → target `85 passing, no regressions` (measured via `npm run test:run`)

## Requirements

### Functional
- On first launch, app detects whether the Ollama binary is present; if not, downloads it to the app's `userData` directory with a progress indicator
- On first launch, app detects whether the default model (`llama3.2`) is pulled; if not, pulls it via `ollama pull` with a progress indicator showing downloaded / total bytes
- On every launch after first, the app starts `ollama serve` as a managed child process before the main window is fully shown
- If Ollama is already running (system-level service), the app detects the existing instance and adopts it rather than spawning a second one
- Ollama process is killed (or disowned if system-managed) when the app quits
- If Ollama crashes post-launch, the main process restarts it and notifies the renderer via IPC
- The renderer exposes an Ollama status signal via `contextBridge` so `AgentBuddy` can reflect real status without an extra HTTP probe on panel open
- The app window uses the same HTML/CSS/JS as today; no visual changes

### Non-Functional
- Installer (`.dmg`) size: < 250 MB before model download
- App launch to main window visible: < 3 seconds on subsequent launches
- Ollama child process is not accessible to the renderer via Node APIs (context isolation on)
- `userData` paths for Ollama binary and model cache are documented in `CLAUDE.md`

## Constraints & Assumptions
- **Constraints:** Solo engineer; macOS arm64 + x64 both need to work (Apple Silicon and Intel); existing `src/` is frozen
- **Assumptions:**
  - Ollama's binary is available for direct download from `ollama.com/download` without authentication — *riskiest assumption; if the download URL or format changes, the bootstrap flow breaks*
  - `llama3.2` (3B) runs acceptably on the minimum target hardware (M1 MacBook or equivalent Intel with 8 GB RAM)
  - Users have a network connection on first launch; there is no offline-first install path

## Risks
- **Ollama download URL changes:** The bootstrap download URL is hardcoded. Mitigation: pin to a specific release URL; check for updates to the URL periodically
- **Model download on slow connection:** 2.2 GB can take 10–30+ minutes. Mitigation: show accurate progress with time estimate; allow resuming if interrupted
- **Port conflict (Ollama already installed):** Spawning a second `ollama serve` when one is already running will fail. Mitigation: probe `localhost:11434` before spawning; adopt existing instance
- **macOS Gatekeeper:** Unsigned `.dmg` requires right-click → Open on first run. Mitigation: acceptable for personal use; document the workaround; sign with Apple Developer account if distribution widens
- **electron-vite config conflicts with existing vite.standalone.js:** The standalone build pipeline may need to be preserved separately. Mitigation: keep both build targets; test both in CI

## Open Questions
- ~~Should the standalone HTML build be preserved?~~ **Resolved:** Keep both build targets.
- ~~Minimum macOS version?~~ **Resolved:** macOS 13 (Ventura) → Electron 28+ is the floor.
- ~~`electron-store` migration in M3?~~ **Resolved:** Deferred; `localStorage` stays for now.

## Appendix
- Prior design discussion: see conversation context (2026-05-22)
- Existing spec: `specs/2026-05-22-embedded-agent-buddy.md`
- Existing design: `designs/2026-05-22-embedded-agent-buddy.md`
- Task breakdown (Agent Buddy): `output/breakdowns/2026-05-22-embedded-agent-buddy.md`
