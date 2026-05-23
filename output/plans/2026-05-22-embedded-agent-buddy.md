# Plan

**Question:** Add an embedded "agent buddy" to the agile velocity tool that can generate new sprints on command, analyze sprint patterns, and provide project planning context — and that has the ability to actively use the tool's existing functionality.

**Strategy:** This is a full-feature addition that spans product scope → architecture → implementation. Run `spec` first to lock down what the agent can do and what "using the tool's functionality" means precisely, then `tech-design` to decide how the agent integrates with the existing React/reducer architecture, and finally `task-breakdown` to sequence the build.

**Workflows to use:**

1. `spec` — The idea is clear at a high level but several decisions need to be scoped before design begins: Which AI provider does the buddy use (the existing multi-provider AIAssistant layer, or a new dedicated one)? What actions can it take on behalf of the user (read-only analysis vs. dispatching reducer actions like `ADD_SPRINT`, `UPDATE_SPRINT_MEMBER_CAPACITY`, etc.)? Where does it live in the UI (embedded panel, floating overlay, a new page tab)? What are the non-goals (e.g., does it touch releases/integrations, or only team/sprint/forecast data)? Input: the feature description above.

2. `tech-design` — Once the spec is approved, the design must answer: how does the agent call reducer actions safely, how does it receive the full app state as context, how is tool-use structured so the agent can invoke sprint generation vs. analysis vs. planning queries, and how does it coexist with the existing `AIAssistant.jsx` component. Input: the approved spec.

3. `task-breakdown` — Once the design is approved, produce milestones and tasks ready for execution. Input: the approved spec + tech design.

**Expected output:**
- `specs/embedded-agent-buddy.md` — structured one-pager (from `spec`)
- `designs/embedded-agent-buddy.md` — architecture doc with tradeoffs (from `tech-design`)
- `output/embedded-agent-buddy-tasks.md` — milestone + task table (from `task-breakdown`)

**Awaiting confirmation before executing.**
