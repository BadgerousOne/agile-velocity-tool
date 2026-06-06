# Execution Log

**Owner:** Orchestrator
**Format:** One entry per shipped workstream, most recent first.

---

## 2026-06-06 — WS-20260606-004 — Align Ollama URL config between Electron main and Settings UI

**Type:** refactor · **Priority:** P2 · **Initiated by:** user
**Merged:** `7e09885` on `main` · **PR:** #5 · **Issue:** #3 (closed)
**Build:** passing · **Tests:** 105 passing

**What shipped:**
- `setOllamaUrl()` in `ollama.js` — module-level URL var consumed by `probePort()` and watchdog
- `ipcMain.handle('ollama:setUrl')` in `main.js` — forwards renderer URL to main process
- `window.ollamaApi.setUrl()` in `preload.js` — IPC bridge from renderer
- `App.jsx` mount effect — sends stored URL before the first watchdog tick
- CSP `connect-src` — added `http://localhost:11434` (was missing; blocked default renderer calls in prod)

**Duration:** Idea promoted → shipped in 1 session (~1 hour pipeline)

**Open items carried forward:**
- Mid-session URL changes don't propagate to the watchdog until restart (documented, acceptable)
- Non-localhost Ollama URLs not covered by the static CSP (out of scope)

---

## 2026-06-06 — WS-20260606-003 — Jira and Azure DevOps native sprint sync

**Type:** feature · **Priority:** P2 · **Initiated by:** user
**Merged:** `19da99d` on `main` · **PR:** #2 · **Issue:** #1 (closed)
**Build:** passing · **Tests:** 105 passing (20 new)

**What shipped:**
- Native sprint sync for Jira (board → sprint → issue points) and Azure DevOps (iterations → work item batch query)
- `IMPORT_SYNCED_SPRINTS` reducer with duplicate detection and chronological sort
- Sync preview UI with per-sprint new/duplicate badges before import
- Typed error handling: auth / CORS / empty — with Electron mode guidance for ADO CORS

**Duration:** Idea promoted → shipped in 1 session

**Cycle time:**
| Stage | Duration |
|-------|---------|
| DISCOVERY | ~1 hr |
| DESIGN | ~1 hr |
| PLANNING | ~30 min |
| ENGINEERING | ~2 hr |
| TESTING | ~15 min |
| REVIEW | ~15 min |
| DELIVERY | ~15 min |

**Open items carried forward:**
- Integration credentials remain in localStorage (pre-existing; flagged for a future WS)
- Azure DevOps: CORS in browser mode is a known limitation; Electron mode required for reliable sync
- Multi-board selection (currently auto-selects first board) is a follow-on enhancement

---

## 2026-06-06 — WS-20260606-002 — Agent Buddy user discovery and health signals

**Type:** feature · **Priority:** P1
**Merged:** `987f8f6` on `main`

**What shipped:** Discovery nudge in Settings, first-run guided experience, FAB health signal badge.

---

## 2026-06-06 — WS-20260606-001 — Electron first-launch UX and macOS DMG distribution

**Type:** feature · **Priority:** P1
**Merged:** `1db58b9` on `main`

**What shipped:** Splash screen with model pull progress, bundled Ollama binary, 30s watchdog, DMG packaging.
