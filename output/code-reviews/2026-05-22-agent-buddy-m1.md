# Code Review: Agent Buddy — M1 Implementation

**Date:** 2026-05-22
**Stack detected:** React 18, JavaScript (ESM), Vite, Vitest + Testing Library
**Scope reviewed:** `src/context/VelocityContext.jsx` (refactor), `src/utils/buddyContext.js` (new), `src/utils/buddyContext.test.js` (new), `src/components/AgentBuddy.jsx` (new), `src/components/AgentBuddy.css` (new), `src/App.jsx` (mount point)
**Audience:** Self-review (Eric)

---

## TL;DR
- Clean M1 delivery: all 57 pre-existing tests pass, 7 new context tests pass, no regressions
- The `computeNewSprintDefaults` extraction is well-executed but lacks its own unit test — M3 will import it directly, making a direct test important before that milestone
- One footgun introduced in `ADD_SPRINT`: the `action.overrides` spread can silently replace the sprint `id`
- **0 Blockers, 1 High, 3 Medium, 4 Low, 3 Nit**
- **Top recommendation:** Add a direct unit test for `computeNewSprintDefaults` before starting M3

---

## Strengths
- The `computeNewSprintDefaults` extraction is a clean pure-function refactor — the reducer is now simpler and the function is independently testable and importable
- `buildBuddyContext` correctly omits `memberCapacity` rows, release plans, and integration credentials — token budget is well-controlled and tested
- Error path in `handleSend` handles both network failures and Ollama API errors distinctly, without swallowing exceptions silently
- Graceful degradation is in place: setup card renders when Ollama is unreachable, input is disabled, status indicator reflects the connection state
- Context-length retry is a good defensive addition — bounds to one attempt and is transparent to the user

---

## Findings

### High

#### H1. No unit test for `computeNewSprintDefaults`
- **File:** `src/context/VelocityContext.jsx:176-229`
- **Category:** Testing
- **Issue:** The function was extracted from the reducer and contains non-trivial logic: weighted velocity calculation for `suggestedCommitted`, carry-forward allocation, holiday PTO via `countHolidaysInSprint`, and new-member row seeding. Existing `VelocityContext.test.jsx` tests exercise `ADD_SPRINT` (which now calls `computeNewSprintDefaults` internally) but do not call the function directly.
- **Why it matters:** M3's `SprintPreviewCard` will import and call `computeNewSprintDefaults` directly. If a regression is introduced in the function, the only safety net right now is the indirect `ADD_SPRINT` integration tests — a direct test would catch the failure faster and with a more precise error message.
- **Suggested fix:** Add a test file (or extend `VelocityContext.test.jsx`) with cases for: empty sprints (returns empty `startDate`), carry-forward from previous sprint's allocation, new members added after last sprint, and `suggestedCommitted` matching weighted-velocity math.

---

### Medium

#### M1. `action.overrides` can silently replace sprint `id`
- **File:** `src/context/VelocityContext.jsx:743-753`
- **Category:** Correctness
- **Issue:** The refactored `ADD_SPRINT` spreads `action.overrides` last, after `id: uuidv4()` and `...defaults`. This means any key in `overrides` — including `id` — overwrites the generated UUID. Nothing passes an `id` override today, but the mechanism is undocumented and the footgun is live.
- **Why it matters:** If M3's buddy dispatch passes `overrides: { committedPoints: N }` to adjust the sprint, a future developer adding `id` to the override for any reason would silently corrupt the sprint list with a duplicate or non-UUID id.
- **Suggested fix:** Either document the restriction explicitly, or filter `id` out of overrides before spreading:
  ```js
  const { id: _dropId, ...safeOverrides } = action.overrides || {};
  return { ...state, sprints: [...state.sprints, { id: uuidv4(), ...defaults, ...safeOverrides }] };
  ```

#### M2. Context-length retry triggers on any HTTP 400, not just context-length errors
- **File:** `src/components/AgentBuddy.jsx:107`
- **Category:** Correctness
- **Issue:** `err.message.includes('400')` is too broad. Ollama returns 400 for invalid model names, bad request payloads, and other conditions unrelated to context length. These cases will trigger an unnecessary retry with a shorter context — which will also fail with the same 400, wasting a round-trip and potentially showing a slower, confusing failure.
- **Why it matters:** A user with a mistyped model name (e.g. `llama3.99`) will see a slow double-failure instead of a fast informative error.
- **Suggested fix:** Narrow the check to the specific error text Ollama returns for context overflow. Ollama typically includes `"context window"` or `"context length"` in the body. Alternatively, only retry on errors explicitly containing `"context"`:
  ```js
  if (err.message.toLowerCase().includes('context')) { /* retry */ }
  ```

#### M3. Message list uses array index as `key`
- **File:** `src/components/AgentBuddy.jsx:156`
- **Category:** Correctness / Maintainability
- **Issue:** `key={i}` uses the array index. This is safe while messages are only ever appended, but M3 will introduce `SprintPreviewCard` renders that replace message bubbles — if a card is dismissed and replaced, React will diff incorrectly against the old index-keyed node.
- **Why it matters:** Incorrect key assignment causes React to reuse DOM nodes across mismatched content, which can produce stale UI, focus jumps, or missed animations when message types change.
- **Suggested fix:** Add an `id` field to each message object at creation time. A simple incrementing counter or `crypto.randomUUID()` works:
  ```js
  const userMsg = { id: Date.now(), role: 'user', content: text };
  // then: key={msg.id}
  ```

---

### Low

#### L1. `probeOllama` effect has no cleanup
- **File:** `src/components/AgentBuddy.jsx:69-73`
- **Category:** Correctness
- **Issue:** If the panel opens and immediately closes before the probe `fetch` completes, `setOllamaOnline` will be called after the component has moved on (re-opened with `null` state). In React 18 this is harmless (the update is processed normally), but it can cause a stale probe from a previous open to set status incorrectly on a new open.
- **Suggested fix:** Use an `AbortController` to cancel the probe on cleanup:
  ```js
  useEffect(() => {
    if (!open) return;
    setOllamaOnline(null);
    const ac = new AbortController();
    probeOllama(ollamaUrl, ac.signal).then(online => { if (!ac.signal.aborted) setOllamaOnline(online); });
    return () => ac.abort();
  }, [open, ollamaUrl]);
  ```

#### L2. Offline UX is inconsistent mid-conversation
- **File:** `src/components/AgentBuddy.jsx:154`
- **Category:** UX
- **Issue:** `SetupCard` only renders when `ollamaOnline === false && messages.length === 0`. If Ollama goes offline mid-conversation, the user gets a raw error bubble instead of the helpful setup card. The two code paths (fresh open vs. mid-conversation failure) give very different experiences.
- **Suggested fix:** Show the setup card in a collapsed/inline form in the error bubble itself when `isNetwork` is true, or always render the setup card at the top of the message list when `ollamaOnline === false`, regardless of message count.

#### L3. `role="dialog"` missing `aria-modal` and focus trap
- **File:** `src/components/AgentBuddy.jsx:145`
- **Category:** Accessibility
- **Issue:** The panel has `role="dialog"` but no `aria-modal="true"`, no `aria-labelledby` pointing to the title element, and no focus trap. Screen readers will announce it as a dialog but allow focus to escape behind it.
- **Suggested fix:** Add `aria-modal="true"` and `aria-labelledby="buddy-panel-title"` with a matching `id` on the title span. Full focus trapping can wait for M4 polish.

#### L4. `ollamaUrl` and `model` as inert `useState`
- **File:** `src/components/AgentBuddy.jsx:62-63`
- **Category:** Maintainability
- **Issue:** Both values are stored via `useState` but have no setter called anywhere in M1. They read like reactive state but behave like constants.
- **Suggested fix:** Leave as `useState` (M4 will wire setters from Settings), but initialize from `localStorage` now so the M4 settings hookup is a one-liner:
  ```js
  const [ollamaUrl] = useState(() => localStorage.getItem('buddy_ollama_url') || DEFAULT_OLLAMA_URL);
  const [model]     = useState(() => localStorage.getItem('buddy_model')      || DEFAULT_MODEL);
  ```

---

### Nits

#### N1. Unused `MEMBER_IDS` constant in test
- **File:** `src/utils/buddyContext.test.js:4`
- `const MEMBER_IDS = ['m1', 'm2', 'm3'];` is declared but never referenced. Delete it.

#### N2. Invalid date string in test fixture for Sprint 10
- **File:** `src/utils/buddyContext.test.js:9`
- `startDate: \`2025-0${n}-01\`` produces `2025-010-01` for `n=10` — not a valid ISO date. Doesn't break tests (the string is never parsed), but is a misleading fixture.
- Suggested fix: `startDate: \`2025-${String(n).padStart(2, '0')}-01\``

#### N3. `handleSend` recreated on every render
- **File:** `src/components/AgentBuddy.jsx:85`
- Not a performance problem at this component's scale, but wrapping in `useCallback` would match the pattern used in the rest of the codebase and prevent unnecessary re-renders of child elements that receive it as a prop (none currently, but `SprintPreviewCard` in M3 will).

---

## Cross-cutting Observations
- **No JS/React-specific review addendum exists** at `~/.claude/workflows/code-review/javascript.md`. Common React pitfalls (stale closures, index keys, missing `useCallback`/`useMemo`, effect cleanup) came up in this review — a saved addendum would catch these automatically next time.
- **Feature flag via `localStorage.getItem` on render** is the right temporary approach for M1, but it will need to move to a `useState` + `storage` event listener pattern in M4 to respond to Settings changes without a reload.

---

## Suggested Next Steps
1. **Fix H1** — add a unit test for `computeNewSprintDefaults` before starting M3 (it's the foundation for SprintPreviewCard)
2. **Fix M1** — filter `id` out of `action.overrides` in `ADD_SPRINT`
3. **Fix M2** — narrow the context-length retry to `includes('context')`
4. **Fix M3** — add a stable `id` field to message objects
5. Low/Nit fixes can be batched into M2 or M4 work without blocking progress

---

## Appendix: Files Reviewed
- `src/context/VelocityContext.jsx` (lines 168–229, 742–753)
- `src/utils/buddyContext.js`
- `src/utils/buddyContext.test.js`
- `src/components/AgentBuddy.jsx`
- `src/components/AgentBuddy.css`
- `src/App.jsx`
