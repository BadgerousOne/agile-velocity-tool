# Spec: Embedded Agent Buddy

**Date:** 2026-05-22
**Author:** Eric Moreau
**Audience:** Engineering
**Status:** Draft

## TL;DR
- The existing AI Assistant requires a paid API key and lives in an isolated tab — most users get no value from it.
- The buddy is a floating overlay accessible from any page, powered exclusively by Ollama (local, free, no API key).
- It can analyze sprint patterns, surface proactive health signals, and generate new sprints — with user approval before any state change.
- **Direction:** Build a floating chat overlay that connects to the local Ollama instance, reads the full app state as context, and dispatches a defined set of safe actions (sprint generation, analysis queries) after user confirmation.

## Problem
- The current AI Assistant is gated behind paid API keys (OpenAI, Anthropic, Gemini), making it inaccessible to most users of the standalone tool.
- It lives in its own tab — users must navigate away from Sprints, Forecast, or Dashboard to ask a question, breaking their workflow.
- It is purely advisory: it cannot act on what it knows. Users can receive a suggestion to create a sprint but must manually execute every step themselves.
- There is no proactive signal layer — the tool does not alert users to declining velocity, scope creep, or low predictability unless they notice it themselves.

## Goals
- Users can interact with a sprint-aware assistant from any page without navigating away.
- Users can generate a new sprint through natural language, review the proposed parameters, and confirm before any state change occurs.
- Users receive proactive pattern alerts (velocity drop, scope creep, low predictability) surfaced by the buddy without having to ask.
- The buddy is fully functional at zero cost — no API key, no account, no subscription required.

## Non-Goals
- The buddy does not create, edit, or reason about release plans or milestones.
- The buddy does not trigger Jira or Azure DevOps integrations.
- The buddy cannot modify workspace settings, rename workspaces, or change sprint configuration (duration, support impact factor).
- The buddy cannot rewrite or delete historical sprint data (completed sprints are read-only).
- Adaptive learning / fine-tuning from user behavior is not in scope for this phase.
- Supporting paid API providers (OpenAI, Anthropic, Gemini) as the buddy's backend is not in scope — those remain available in the existing AI Assistant tab.

## Target Users / Stakeholders
- **Primary user:** Engineering manager or team lead who runs the tool to track sprint velocity and plan delivery.
- **Secondary:** Any team member who opens the standalone HTML file and wants help understanding the data.
- **Sign-off / approver:** Eric Moreau

## Success Metrics
- **Adoption:** % of sessions where the buddy overlay is opened at least once — baseline `0%` (feature doesn't exist) → target `>40%` of active sessions (measured via session storage event counters).
- **Sprint generation via buddy:** % of new sprints created through the buddy confirmation flow vs. the manual Add Sprint button — baseline `0%` → target `>25%` (measured via a `source` field on the sprint object).
- **Zero-cost operation:** 100% of buddy interactions complete without an external API call — measured by the absence of any non-Ollama network requests from the buddy component.
- **User satisfaction with proactive alerts:** `TBD — needs instrumentation` (requires a feedback mechanism on alert cards).

## Requirements

### Functional
- A persistent floating button/icon is visible on every page of the tool.
- Clicking the button opens a chat panel overlay (does not navigate away from the current page).
- The buddy connects to the locally running Ollama instance (default: `http://localhost:11434`); if Ollama is unreachable, it displays a clear setup prompt with instructions.
- On each conversation turn, the buddy receives the full current app state as context (team members, all sprints, settings, calculated metrics).
- The buddy can respond to natural language prompts for: sprint analysis, velocity trends, capacity patterns, backlog/forecast questions, and sprint generation.
- When the user asks to create a sprint, the buddy renders a structured **Sprint Preview card** showing: name, start/end dates, suggested committed points, and member capacity rows (carried from the previous sprint). The sprint is only created after the user explicitly confirms.
- Proactive health signals (velocity drop, scope creep, low predictability, high support load) are surfaced as dismissible alert cards when the overlay is opened, powered by the existing `buildHealthSignals()` utility.
- The buddy does not dispatch any reducer action without a visible user confirmation step.

### Non-Functional
- The overlay must not block or interfere with interactions on the underlying page.
- Ollama request/response is handled client-side only — no proxy, no server.
- If a selected Ollama model does not support tool/function-calling, the buddy degrades gracefully to advisory-only mode (sprint preview is shown as a suggestion card rather than an executable action).
- The buddy component is self-contained — it does not modify `VelocityContext` reducer logic; it calls `dispatch` via `useVelocity()` hook on confirmation only.

## Constraints & Assumptions
- **Constraints:** Ollama must be running locally; this is a hard dependency. The tool is a standalone HTML file, so there is no backend to proxy Ollama requests.
- **Assumptions:** The user has Ollama installed and a model pulled (e.g., `llama3.2`, `mistral`). This is treated as a setup prerequisite, not a blocker — the buddy surfaces setup instructions if the connection fails.
- **Riskiest assumption:** Ollama models with reliable function/tool-calling are available for free. Models like Llama 3.1 and Mistral support structured output but behavior is inconsistent across versions.

## Risks
- **Ollama tool-calling inconsistency:** Not all Ollama models reliably follow a function-calling schema. *Mitigation:* Design the buddy to use structured prompt templates and parse responses, with native tool-use as an enhancement layer where supported.
- **State context size:** Passing the full app state on every turn may exceed context window limits for smaller models. *Mitigation:* Summarize state (recent N sprints, aggregated metrics) rather than serializing the entire object.
- **User trust in AI-generated actions:** Users may be uncomfortable with an AI that can modify their data. *Mitigation:* The confirmation-before-dispatch requirement is non-negotiable; include a visible "what will this do?" explanation on every Sprint Preview card.
- **Ollama not installed:** A significant portion of users may not have Ollama. *Mitigation:* Show a prominent, friendly setup guide with a one-click link to ollama.com when the connection fails.

## Open Questions
- What Ollama models should be recommended/tested for best structured-output reliability? `[NEEDS RESEARCH]`
- Should the buddy remember conversation history within a session, or start fresh each time the overlay is opened? `[OWNER: Eric]`
- Future phase: what would it take for the buddy to learn from tool usage over time (persistent memory layer, fine-tuning)? `[NEEDS RESEARCH]`
