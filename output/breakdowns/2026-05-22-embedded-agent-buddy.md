# Task Breakdown: Embedded Agent Buddy

**Date:** 2026-05-22
**Spec:** `specs/2026-05-22-embedded-agent-buddy.md`
**Design:** `designs/2026-05-22-embedded-agent-buddy.md`
**Capacity assumed:** 1 engineer (Eric), no fixed deadline
**Critical path:** M1 → M2 → M3 → M4
**Sizing scheme:** S/M/L (S = ≤1 day, M = 2–3 days, L = 4–5 days)

---

## TL;DR
- 4 milestones, 17 tasks total
- Highest-risk task: **T3.5** — native Ollama tool-calling probe; behavior varies across model versions and may need to be timeboxed or deferred
- Earliest demo: end of M1 (~4 days) — floating button opens, Ollama responds to plain text

---

## M1: Walking Skeleton (~4 days)
**Demo:** Open the tool with `buddy_enabled=true` in localStorage, click the floating button, type "hello", receive a plain text response from a local Ollama model. If Ollama isn't running, a setup card appears with instructions.

| ID | Title | Size | Depends on | Acceptance | Notes |
|----|-------|------|------------|------------|-------|
| T1.1 | Extract `computeNewSprintDefaults(state)` from reducer | S | — | Function exists in `VelocityContext.jsx` as an exported pure helper; existing `ADD_SPRINT` reducer case calls it and produces identical sprint output to before the refactor; existing Sprints tests still pass | Prerequisite for M3's SprintPreviewCard. Pure extraction — no behavior change. If any test breaks, the refactor is wrong. |
| T1.2 | Implement `buildBuddyContext(state)` utility | S | — | Unit test confirms output for a 3-member / 10-sprint fixture is under 2,000 tokens (estimate via `str.length / 4`); output includes team roster, last 10 sprints (name/dates/committed/completed/utilization), and calculated metrics; full `memberCapacity` arrays and release plans are absent from the output | Lives in `src/utils/buddyContext.js`. Test file: `buddyContext.test.js`. |
| T1.3 | `AgentBuddy.jsx` — floating button + collapsible panel shell | M | — | A floating button is visible on every page when `localStorage.getItem('buddy_enabled') === 'true'`; clicking opens a slide-in panel; clicking again (or a close button) collapses it; panel does not obscure sidebar nav or prevent clicking on the underlying page | Feature flag check is a single `if` at the top of the component — easy to remove in M4. CSS `position: fixed`, high z-index. |
| T1.4 | Ollama connection — `callOllamaBuddy()`, version probe, setup card | M | — | `callOllamaBuddy(model, messages)` returns a response string when Ollama is running; when Ollama is unreachable (`fetch` rejects or returns non-2xx), the panel renders a setup card with copy-pasteable instructions (`ollama serve`, `ollama pull llama3.2`); version probe fires once on panel open and logs whether native tool-calling is available | Lives in `AgentBuddy.jsx` or extracted helper. No retry loop — fail fast, show card. |
| T1.5 | Wire send/receive into panel + mount in AppContent | S | T1.3, T1.4 | User types a message, presses Enter or Send, sees a loading indicator, then the Ollama response appears as a chat bubble; `<AgentBuddy />` renders in `AppContent` alongside `<Sidebar />`; no existing page layout shifts | Mount point: `App.jsx` `AppContent` function, after `<Sidebar />`. Plain `role: 'user'` / `role: 'assistant'` messages only at this stage — no system prompt yet. |

**Parallel batches:**
- Batch 1: T1.1, T1.2, T1.3, T1.4 (all independent)
- Batch 2: T1.5 (depends T1.3 + T1.4)

---

## M2: Context-Aware Analysis (~3 days)
**Demo:** Ask the buddy "what's our velocity trend?" and get a response that accurately reflects the sprint data (correct numbers, correct trend direction). Open the overlay and see dismissible health-signal alert cards above the chat input without typing anything.

| ID | Title | Size | Depends on | Acceptance | Notes |
|----|-------|------|------------|------------|-------|
| T2.1 | Inject `buildBuddyContext()` into system prompt per turn | S | T1.2, T1.5 | System message prepended to every Ollama request contains the team context string; asking "how many sprints do we have?" returns a number that matches `state.sprints.length`; asking "what's our weighted velocity?" returns a value within ±0.5 of `calcWeightedVelocity(state.sprints)` | System prompt template lives as a constant in `AgentBuddy.jsx`. Context is rebuilt from current state on each send — no stale data. |
| T2.2 | Conversation history — rolling 10-turn window | S | T1.5 | After 11 exchanges, the oldest user+assistant pair is dropped from the payload sent to Ollama; the UI still shows the full history; no context-length errors occur in a 15-message session with a default model | Display history = full array in component state. Payload history = `messages.slice(-20)` (10 pairs × 2 roles) plus the system message. |
| T2.3 | Health signal alert cards on overlay open | M | T1.3 | When the overlay opens and `buildHealthSignals()` returns ≥1 alert, styled dismissible cards appear above the chat input; dismissing a card removes it for the rest of the session; re-opening the overlay in the same session does not re-show dismissed alerts; when no alerts exist, no card area is rendered | Dismissed state in `useState` (array of dismissed alert titles). `buildHealthSignals()` is imported from `velocityCalc.js` — no new logic. Alert severity maps to card color (high=red, medium=amber, low=blue). |
| T2.4 | Context-length retry — fallback to last 5 sprints | S | T2.1 | When Ollama returns an error containing "context" or a 400 status, the request is retried once with `buildBuddyContext(state, { maxSprints: 5 })`; if the retry also fails, the error message is shown to the user; successful retry is invisible to the user | Add `maxSprints` param to `buildBuddyContext`. One retry only — no loop. |

**Parallel batches:**
- Batch 1: T2.1, T2.2 (both depend only on T1.x, independent of each other)
- Batch 2: T2.3 (depends T1.3 only — can start after M1 Batch 1)
- Batch 3: T2.4 (depends T2.1)

---

## M3: Sprint Preview & Dispatch (~4 days)
**Demo:** Type "create a new sprint" in the buddy. A `SprintPreviewCard` appears in the chat showing the proposed sprint name, dates, suggested committed points, and member rows carried from the previous sprint. Clicking Confirm creates the sprint and it immediately appears in the Sprints tab. Clicking Cancel dismisses the card with no state change.

| ID | Title | Size | Depends on | Acceptance | Notes |
|----|-------|------|------------|------------|-------|
| T3.1 | `parseActionEnvelope()` + action whitelist | S | — | Unit tests confirm: fenced ` ```action {...} ``` ` block is extracted and parsed; a `type` not in the whitelist (`["CREATE_SPRINT"]`) returns `null`; malformed JSON returns `null`; text with no action block returns `null`; valid `CREATE_SPRINT` payload returns the parsed object | Lives in `src/utils/buddyActions.js`. Test file: `buddyActions.test.js`. Whitelist is a `Set` constant — easy to extend in future phases. |
| T3.2 | `SprintPreviewCard.jsx` — preview UI with confirm/cancel | M | T1.1 | Component renders name, start date, end date, suggested committed points, and a member capacity table (name + allocation % from previous sprint); Confirm button is disabled while a dispatch is in flight; Cancel fires an `onCancel` callback with no side effects; component is independently renderable with mock props (no context dependency) | Uses `computeNewSprintDefaults(state)` (T1.1) to populate defaults. Pure presentational component — receives data as props, emits callbacks. |
| T3.3 | Action detection → render SprintPreviewCard in chat | S | T3.1, T3.2 | When the buddy response contains a valid `CREATE_SPRINT` envelope, a `SprintPreviewCard` renders in place of a plain text bubble for that message; the explanatory text above the action block still renders as prose; plain responses without an action block continue to render as before | `parseActionEnvelope` runs on every assistant response. If result is non-null and type is `CREATE_SPRINT`, swap bubble for card. |
| T3.4 | Confirm dispatch + session counters | S | T3.3 | Clicking Confirm dispatches `ADD_SPRINT` with `createdVia: 'buddy'`; the new sprint appears in the Sprints tab immediately; `sessionStorage.getItem('buddy_sprints_created')` increments by 1; clicking the manual Add Sprint button increments `manual_sprints_created`; the SprintPreviewCard is replaced by a success message after dispatch | Counter increments for manual sprints added in `Sprints.jsx` at the existing Add Sprint handler. `createdVia` field passes through `sanitizeImportedState` unchanged. |
| T3.5 | Native Ollama tool-calling progressive enhancement | M | T3.1, T1.4 | When the version probe (T1.4) detected tool-calling support, subsequent requests include `tools: [ACTION_DEFINITIONS]`; action responses parsed from the `tool_calls` response field are processed by the same whitelist and produce the same `SprintPreviewCard` as the envelope approach; if the model ignores `tools`, behavior falls back to envelope parsing silently | Timebox to 2 days. If Ollama tool-calling proves unreliable across models, defer to a follow-up and ship M3 without it. ACTION_DEFINITIONS mirrors the envelope schema. |

**Parallel batches:**
- Batch 1: T3.1 (no deps beyond prior milestones)
- Batch 2: T3.2 (depends T1.1), T3.1 can run with T3.2 in parallel
- Batch 3: T3.3 (depends T3.1 + T3.2)
- Batch 4: T3.4 (depends T3.3)
- Batch 5: T3.5 (depends T3.1 + T1.4 — can start after T3.1 and run alongside T3.2/T3.3)

---

## M4: Settings Integration & Polish (~3 days)
**Demo:** Navigate to Settings and find an "Agent Buddy" section with an enable/disable toggle and an Ollama URL field. Toggle it off — the floating button disappears. Open the tool on a narrow viewport (<768px) — the buddy collapses to button-only by default. Switch workspaces — the buddy conversation resets.

| ID | Title | Size | Depends on | Acceptance | Notes |
|----|-------|------|------------|------------|-------|
| T4.1 | Settings toggle (opt-in) + configurable Ollama URL | M | T1.3 | Settings page has an "Agent Buddy" section; toggle persists to localStorage (replaces the dev-only `buddy_enabled` flag from M1); Ollama URL field defaults to `http://localhost:11434`, persists to localStorage, and is used by `callOllamaBuddy()` on next send; toggling off hides the floating button immediately without page reload | Dispatch a new `SET_BUDDY_CONFIG` action or store config in its own localStorage key outside the workspace state (buddy config is cross-workspace). Keep it simple: `localStorage.setItem('buddy_config', JSON.stringify({enabled, ollamaUrl}))`. |
| T4.2 | Small-screen collapse behavior | S | T1.3 | On viewports narrower than 768px, the panel opens in a collapsed/minimized state by default (button only); user can expand manually; on viewports ≥768px, behavior is unchanged | CSS media query + `useState` for expanded/collapsed. |
| T4.3 | Workspace-switch conversation reset | S | T1.5 | When the active workspace changes (detected via `useWorkspaces().activeWorkspaceId`), `chatHistory` in `AgentBuddy` resets to `[]` and any open `SprintPreviewCard` is dismissed; the overlay stays open if it was open | Add a `useEffect` on `activeWorkspaceId`. |
| T4.4 | Component tests for key buddy flows | M | T3.4 | Tests cover: (1) setup card renders when `fetch` to Ollama rejects; (2) plain text response renders as a chat bubble; (3) `CREATE_SPRINT` response renders `SprintPreviewCard`; (4) Confirm dispatches `ADD_SPRINT` and increments sessionStorage counter; (5) Cancel leaves state unchanged | Use `@testing-library/react` + `vi.fn()` for `fetch`. Mock `useVelocity()`. These are the acceptance gates for the full feature. |

**Parallel batches:**
- Batch 1: T4.1, T4.2, T4.3 (all independent of each other, all depend only on prior milestone outputs)
- Batch 2: T4.4 (depends on T3.4 being complete — tests cover full dispatch flow)

---

## Risks & Open Questions

- **T3.5 timebox:** Native Ollama tool-calling behavior is inconsistent across model versions. If 2 days of investigation doesn't yield reliable results across `llama3.2` and `mistral`, ship M3 without it and revisit when Ollama tool-calling stabilizes. The prompt-engineering layer is the guaranteed path.
- **Buddy config storage (T4.1):** Storing `buddy_config` outside workspace state means it survives workspace switches (intentional). If it ever needs to be per-workspace, it would need to move into the reducer — flag this as a future decision if the use case arises.
- **`computeNewSprintDefaults` refactor (T1.1):** This touches the reducer's `ADD_SPRINT` case. Run the full Vitest suite after T1.1 before starting T1.3 to confirm no regression. `[OWNER: Eric]`
- **Model recommendation:** The design flags `llama3.2`, `llama3.1`, `mistral`, and `qwen2.5` as candidates for structured-output testing. Which model to recommend in the setup card is unresolved. `[NEEDS RESEARCH — can be done during T1.4 or T3.5]`

## Appendix
- Linked spec: `specs/2026-05-22-embedded-agent-buddy.md`
- Linked design: `designs/2026-05-22-embedded-agent-buddy.md`
- Existing Ollama reference in codebase: `src/components/AIAssistant.jsx` — `callOllama()` and `extractActionFromMessage()` patterns are reusable
