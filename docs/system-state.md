# System State — Agile Velocity Tool

**Owner:** Orchestrator
**Last synced:** 2026-06-06
**Sync source:** /Users/eric/Repositories/agile-velocity-tool
**Update trigger:** Each platform session start; immediately after any event is processed

---

## Idea Backlog

| Idea | Source | Captured | Priority hint | Status |
|------|--------|----------|---------------|--------|
| Complete Electron first-launch UX and macOS DMG distribution | onboarding analysis | 2026-06-06 | P1 | promoted → WS-20260606-001 |
| Agent Buddy: user discovery, onboarding flow, and persistent health signal notifications | onboarding analysis | 2026-06-06 | P1 | promoted → WS-20260606-002 |
| Jira and Azure DevOps native sprint sync (move beyond CSV workaround) | onboarding analysis | 2026-06-06 | P2 | promoted → WS-20260606-003 |
| Align Ollama URL configuration between Electron main process and Settings UI | onboarding analysis | 2026-06-06 | P2 | open |
| Buddy conversation history persistence across page reloads | onboarding analysis | 2026-06-06 | P3 | open |

**Legend:**
- `open` — captured; not yet evaluated for promotion
- `promoted` — idea converted to workstream
- `closed` — evaluated and closed without promotion

---

## Active Workstream Summary

| Workstream ID | Title | Priority | Stage | Status | Last event |
|--------------|-------|----------|-------|--------|------------|
| WS-20260606-001 | Electron first-launch UX and macOS DMG distribution | P1 | COMPLETE | COMPLETE | 2026-06-06 |
| WS-20260606-002 | Agent Buddy user discovery, onboarding, and persistent health signals | P1 | DISCOVERY | ACTIVE | 2026-06-06 |
| WS-20260606-003 | Jira and Azure DevOps native sprint sync | P2 | DISCOVERY | ACTIVE | 2026-06-06 |

---

## Active Blockers

*No active blockers.*

---

## Onboarding Notes (2026-06-06)

Project brought into the platform via `onboard existing project`. Key context:

- **Stack:** React 18 + Vite + Electron (electron-vite), Recharts, Vitest
- **Primary distribution:** Electron desktop app (macOS universal DMG)
- **AI features:** Agent Buddy (local Ollama, bundled binary) + AI Assistant tab (cloud APIs)
- **CLAUDE.md:** Initialized and up to date
- **Test coverage:** Pure utility functions well-covered; component and Electron layer coverage sparse

**Analysis summary:** Agent Buddy is ~80% complete. Electron shell backbone is in place but first-launch UX and DMG packaging remain the highest-priority gaps. Jira/Azure integrations are UI scaffolds with no actual data sync. Core sprint/velocity/forecast features are stable.
