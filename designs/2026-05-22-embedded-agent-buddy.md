# Tech Design: Embedded Agent Buddy

**Date:** 2026-05-22
**Author:** Eric Moreau
**Audience:** Engineering
**Status:** Draft
**Spec:** `specs/2026-05-22-embedded-agent-buddy.md`

## TL;DR
- A new `AgentBuddy` component mounts at the `AppContent` level, rendering a fixed-position floating button and slide-in chat panel — no routing changes required.
- It calls Ollama directly via `fetch()` and reads app state through the existing `useVelocity()` hook; no reducer changes needed.
- Structured action dispatch uses a **two-layer approach**: prompt-engineering-based JSON envelope (works on all models) with native Ollama tool-calling as a progressive enhancement.
- All state mutations require an explicit user confirmation step — the buddy proposes, the user approves, `dispatch` fires.
- **Recommended approach:** Self-contained floating overlay with prompt-engineered structured output, lean context summarization, and confirmation-gated dispatch via `useVelocity()`.

## Context

See [spec](../specs/2026-05-22-embedded-agent-buddy.md) for the full problem statement. This design is needed because three concrete architectural questions were left open: how to reliably get structured actions from Ollama models that have inconsistent tool-calling support, how to keep the state context payload within smaller models' token limits, and how the buddy component fits into the existing context/reducer architecture without modifying it.

### Locked from spec

> "The buddy does not dispatch any reducer action without a visible user confirmation step."

> "The buddy component is self-contained — it does not modify `VelocityContext` reducer logic; it calls `dispatch` via `useVelocity()` hook on confirmation only."

> Non-goal: "Supporting paid API providers (OpenAI, Anthropic, Gemini) as the buddy's backend is not in scope."

Full goals and non-goals: [spec](../specs/2026-05-22-embedded-agent-buddy.md).

---

## Proposed Approach

- `AgentBuddy` is a new component rendered inside `AppContent` (which already sits inside `VelocityProvider`), alongside `<Sidebar />` and the page router. It uses CSS `position: fixed` to float above all page content — no routing, no tab, no navigation change.
- The buddy calls `http://localhost:11434/api/chat` directly from the browser. No proxy, no backend.
- **Two-layer action protocol:** The system prompt instructs the model to wrap any suggested action in a fenced JSON block (`` ```action ... ``` ``). The buddy parser always tries this envelope first. If the Ollama endpoint also supports the native `tools` parameter (detectable at startup via a probe request), the buddy additionally sends a `tools` definition for more reliable structured output — both layers produce the same `SprintPreviewCard` UI.
- A `buildBuddyContext(state)` utility compresses app state to a ~1,500-token summary sent with every turn. Full `memberCapacity` rows, release plans, and integration credentials are omitted.
- Sprint creation tracking uses a `createdVia` field on the sprint object. `ADD_SPRINT` already accepts arbitrary initial data; passing `createdVia: 'buddy'` requires no reducer changes.
- Proactive health signals call the existing `buildHealthSignals()` from `velocityCalc.js` when the overlay opens. Signal state is component-local (dismissed per-session, not persisted).

---

## Architecture & Components

### New files

```
src/
  components/
    AgentBuddy.jsx          — floating button + slide-in panel + chat loop
    AgentBuddy.css
    SprintPreviewCard.jsx   — confirmation UI rendered inside the chat stream
    SprintPreviewCard.css
  utils/
    buddyContext.js         — buildBuddyContext(state) → lean context string
    buddyActions.js         — parseActionEnvelope(text), ACTION_DEFINITIONS
```

### Modified files

- `src/App.jsx` (`AppContent`) — add `<AgentBuddy />` as a sibling to `<Sidebar />` and `<main>`.

No changes to `VelocityContext.jsx`, the reducer, or any existing component.

### Data flow

```
User types message
       │
       ▼
AgentBuddy.jsx
  ├─ buildBuddyContext(state)  → ~1,500-token context string
  ├─ prepend system prompt (action protocol + context)
  ├─ POST /api/chat → Ollama (stream: false)
  │
  ▼
Response text
  ├─ parseActionEnvelope(text)
  │     ├─ found ```action { type: "CREATE_SPRINT", ... } ```
  │     │     └─ render <SprintPreviewCard data={...} />
  │     └─ no action → render plain text bubble
  │
  ▼  (user clicks Confirm on SprintPreviewCard)
dispatch({ type: 'ADD_SPRINT', createdVia: 'buddy' })
```

### `buildBuddyContext(state)` output

Plain text block injected into the system prompt. Includes:
- **Team:** `N members — [Name (Role), ...]`
- **Sprint duration:** `10 working days`
- **Last N sprints (up to 10):** one line each: `Sprint X | YYYY-MM-DD → YYYY-MM-DD | committed: N | completed: N | utilization: N%`
- **Metrics:** avg velocity, weighted velocity, predictability, trend, effective FTEs
- **Omitted:** full `memberCapacity` row arrays, release plans, holiday definitions, integration credentials, chat history, workspace index

Estimated token count for a 3-member team with 10 sprints: ~1,200–1,800 tokens, leaving ample room for conversation history and response budget in any model with a ≥4K context window.

### System prompt structure

```
You are an Agile sprint assistant embedded in a velocity tracking tool.
You have access to the team's sprint history and metrics (below).
You can suggest actions. If you want to suggest creating a sprint, respond with:

```action
{ "type": "CREATE_SPRINT", "name": "Sprint N", "startDate": "YYYY-MM-DD",
  "suggestedCommittedPoints": N, "notes": "..." }
```

Only include one action block per response. Always explain what you're suggesting before the action block.

=== TEAM CONTEXT ===
[buildBuddyContext output]
```

### Tool-calling probe

On first render, `AgentBuddy` sends a lightweight probe request to `GET http://localhost:11434/api/version`. If the Ollama version is ≥ 0.3.0 (when `tools` support was added), the buddy attaches `tools: [ACTION_DEFINITIONS]` to subsequent requests. The `ACTION_DEFINITIONS` array mirrors the same schema as the JSON envelope — no duplicate parsing logic. If the probe fails or version is too old, the buddy runs in prompt-engineering-only mode silently.

### Sprint source tracking

`ADD_SPRINT` in the reducer spreads arbitrary fields from initial data onto the new sprint object. Passing `createdVia: 'buddy'` from the confirmation handler adds the field without touching the reducer. Sessions track a running count in `sessionStorage` (`buddy_sprints_created`, `manual_sprints_created`) incremented at dispatch time — no persistent state, no new reducer actions.

---

## Alternatives & Tradeoffs

| Option | Summary | Pros | Cons | Why not |
|--------|---------|------|------|---------|
| A. Native Ollama `tools` API only | Require tool-calling support; skip prompt engineering | Cleaner response parsing; less prompt complexity | Breaks on Llama 3.2, Phi3, older Mistral versions that ignore the `tools` param; user sees silent failures | Ollama tool-calling adoption is still inconsistent across model families as of mid-2026; a design that requires it fails silently for a large share of free models the spec targets |
| B. Extend existing `AIAssistant` tab | Add Ollama-only action mode inside the current tab | Reuses provider infrastructure; no new component | Fundamentally tab-bound — the component unmounts when the user navigates away; spec requires overlay accessible from every page; conversation state is lost on tab switch | Violates the core UX requirement in the spec; extending it would require embedding it in the root layout anyway, at which point you've built a floating overlay that just happens to share code with the tab |
| C. In-browser model (WebLLM / transformers.js) | Bundle a WASM model; zero network dependency | Truly offline; no Ollama install required | ~500MB+ bundle incompatible with the standalone HTML file goal; first-load latency is 30-60s; model quality too limited for structured output | Bundle size alone disqualifies it — the standalone build is a primary deliverable and must remain a single lightweight file |

---

## Data Model & APIs

### Sprint object — new optional field

```js
{
  // ... existing fields unchanged ...
  createdVia: 'manual' | 'buddy',  // optional; absent on pre-existing sprints
}
```

Absent on all existing sprints; treated as `'manual'` by any code that reads it. No migration needed — `sanitizeImportedState` passes unknown fields through.

### Action envelope (prompt-engineering layer)

```json
{ "type": "CREATE_SPRINT",
  "name": "string",
  "startDate": "YYYY-MM-DD",
  "suggestedCommittedPoints": "number",
  "notes": "string | null" }
```

`parseActionEnvelope(text)` extracts the fenced block with a regex, attempts `JSON.parse`, validates the `type` field against a whitelist (`["CREATE_SPRINT"]` for v1), and returns `null` on any failure (buddy falls back to plain text response).

### Ollama API contract (client-side)

- **Chat:** `POST http://localhost:11434/api/chat` with `{ model, messages, stream: false, tools? }`
- **Version probe:** `GET http://localhost:11434/api/version`
- No auth, no CORS headers needed (Ollama's default server allows localhost origins).

---

## Failure Modes & Edge Cases

| Failure | Expected behavior |
|---|---|
| Ollama not running | On open, buddy shows a setup card: "Ollama isn't running. Start it with `ollama serve`, then refresh." Chat input is disabled. |
| Ollama running but no model pulled | `/api/chat` returns 404 or model-not-found error. Buddy surfaces: "Model `llama3.2` not found. Run `ollama pull llama3.2`." |
| Model returns malformed action JSON | `parseActionEnvelope` returns `null`; response renders as plain text. User sees the suggestion in prose and can act manually. |
| Model ignores action protocol entirely | Same as above — graceful degradation to advisory mode. No silent failure. |
| Context too large for model | Ollama returns a context-length error. Buddy catches it and retries with `buildBuddyContext` limited to last 5 sprints instead of 10. |
| User confirms sprint while another dispatch is in flight | Confirm button is disabled while any `dispatch` is pending (tracked via `useState`). |
| Overlay open during workspace switch | `AgentBuddy` reads state via `useVelocity()` which updates on workspace switch — context refreshes automatically. Conversation history is reset to avoid cross-workspace confusion. |

---

## Security & Privacy

The buddy makes requests only to `http://localhost:11434` — a loopback address the user controls. No sprint data, team member names, or capacity information leaves the local machine. No auth tokens are involved. No material security concerns beyond the existing AIAssistant tab, which already makes direct browser fetch calls to external AI providers.

---

## Migration / Backward Compatibility

The only data change is the optional `createdVia` field on new sprints. Existing sprint objects lack this field and continue to work unchanged. `sanitizeImportedState` in `stateSchema.js` passes unknown fields through, so exported JSON files containing `createdVia` remain importable on older versions of the tool (field is silently ignored).

---

## Dependencies

- **Upstream:** Ollama local server (`≥0.1.x` for chat endpoint; `≥0.3.0` for native tool-calling). User-managed; not bundled.
- **Upstream:** `buildHealthSignals()` from `src/utils/velocityCalc.js` — already exists, no changes.
- **Upstream:** `useVelocity()` / `VelocityContext` — read-only access plus `dispatch`; no changes to the provider.
- **Downstream:** None — no existing component depends on `AgentBuddy`.

---

## Observability & Testing Strategy

**Metrics (session-scoped, no server):**
- `sessionStorage` counters: `buddy_sessions_opened`, `buddy_sprints_created`, `manual_sprints_created` — read by a future analytics sweep or logged to console in dev mode.
- Verify spec metric "zero-cost operation" via browser DevTools Network tab: filter for non-localhost requests during buddy interactions — expected: none.

**Testing approach:**
- **Unit:** `buildBuddyContext(state)` — assert token-budget compliance with a mock state of 10 sprints and 5 members. `parseActionEnvelope(text)` — assert correct extraction, whitelist rejection, and null on malformed JSON.
- **Component:** `AgentBuddy` with a mocked `fetch` — test setup-card rendering when Ollama is unreachable, plain-text rendering when no action block is present, and `SprintPreviewCard` rendering + dispatch on confirm.
- **Not tested:** Actual LLM output quality (non-deterministic), Ollama version detection across all model families.

---

## Rollout Plan

- **Phase 1 — Hidden by default:** Ship `AgentBuddy` behind a `localStorage` flag (`buddy_enabled: true`). No UI exposure to end users. Lets developer verify Ollama connectivity and action parsing in the real app.
- **Phase 2 — Opt-in:** Add a toggle in Settings ("Enable Agent Buddy — requires Ollama"). The floating button appears only when enabled.
- **Phase 3 — On by default:** Remove the toggle; buddy always renders but shows the Ollama setup card if unreachable.

Each phase owner: Eric Moreau.

---

## Risks

- **Conversation history grows unbounded per session.** If a user has a long chat, the accumulated `messages` array will push the total prompt past the model's context window. *Mitigation:* Cap conversation history at the last 10 turns in the payload sent to Ollama; keep the full history in UI state for display only.
- **Fixed `localhost:11434` breaks non-default Ollama setups.** Some users run Ollama on a different port or host. *Mitigation:* Expose a configurable Ollama URL in Settings (Phase 2), defaulting to `http://localhost:11434`.
- **`ADD_SPRINT` carry-forward logic is duplicated.** The buddy needs to compute the sprint preview client-side before the user confirms. Currently that logic lives inside the reducer. *Mitigation:* Extract the sprint preview computation from the `ADD_SPRINT` reducer case into a pure `computeNewSprintDefaults(state)` helper (in `VelocityContext.jsx`) exported for use by both the reducer and the buddy. This is a small refactor but required for the preview card to show accurate data.
- **Floating overlay obscures content on small screens.** The fixed-position panel may cover key data on narrow viewports. *Mitigation:* Make the panel collapsible to a button-only state; default to collapsed on viewports narrower than 768px.

---

## Open Questions

- Should conversation history persist across page reloads within a session (e.g., in `sessionStorage`)? Or reset each time the overlay is closed? The spec leaves this to the owner. `[OWNER: Eric]`
- The `computeNewSprintDefaults(state)` refactor touches `VelocityContext.jsx`. Should this be a separate PR prerequisite, or bundled with the buddy implementation? `[OWNER: Eric]`
- Which Ollama models should be listed as "recommended" in the setup card? Needs a quick structured-output reliability test across `llama3.1`, `llama3.2`, `mistral`, `qwen2.5`. `[NEEDS RESEARCH]`

## Appendix

- Linked spec: `specs/2026-05-22-embedded-agent-buddy.md`
- Existing Ollama integration reference: `src/components/AIAssistant.jsx` — `callOllama()` and `extractActionFromMessage()` are reusable patterns.
- Ollama tool-calling docs: https://ollama.com/blog/tool-support
