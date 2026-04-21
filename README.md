# ⚡ Agile Velocity Tool

A modern, full-featured Agile Velocity tracking tool built with **React + Vite**. Tracks team capacity, sprint velocity, and forecasts delivery timelines — with release planning, multi-workspace support, and a built-in AI Agile Coach.

---

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Pages & Components](#pages--components)
  - [Dashboard](#dashboard)
  - [Team Members](#team-members)
  - [Sprints](#sprints)
  - [Velocity Analytics](#velocity-analytics)
  - [Forecast](#forecast)
  - [Releases](#releases)
  - [Integrations](#integrations)
  - [AI Assistant](#ai-assistant)
  - [Settings](#settings)
- [Multi-Workspace Support](#multi-workspace-support)
- [Data Model](#data-model)
- [Capacity Calculations](#capacity-calculations)
- [State Management](#state-management)
- [Data Persistence](#data-persistence)
- [AI Providers](#ai-providers)
- [Settings Reference](#settings-reference)

---

## Features

| Feature | Description |
|---|---|
| 📊 **Dashboard** | Real-time KPIs: avg velocity, weighted velocity, capacity-adjusted velocity, predictability, trend, effective FTEs |
| 👥 **Team Members** | Add/remove members, assign roles, view per-sprint allocation history sparkline |
| 🏃 **Sprints** | Track committed vs completed points, per-member PTO/support/other days, allocation % per sprint, reorder incomplete sprints |
| 📈 **Velocity Analytics** | Compact or expanded chart views: velocity trend, capacity utilization, sprint delta, burnup, capacity impact, sprint history table |
| 🔭 **Forecast** | Backlog burndown, scenario planning, time-period forecasts (3/6/9/12 months) using actual team allocation |
| 🗓 **Releases** | Release plans with milestones, milestone dependencies, status tracking, and Monte Carlo delivery forecasts |
| 🔌 **Integrations** | Connect Jira or Azure DevOps to pull sprint/backlog data directly into the tool |
| 🤖 **AI Assistant** | Multi-provider Agile Coach (OpenAI, Claude, Gemini, Ollama) with full sprint context injection |
| ⚙️ **Settings** | Sprint duration, support impact factor, regions & holidays, workspace management, JSON export/import |
| 🏢 **Multi-Workspace** | Run multiple independent team workspaces — each with its own sprint data, members, and settings |
| 📄 **Standalone Build** | Single self-contained HTML file — no server, no install, just open in any browser |

---

## Getting Started

### Prerequisites

- **Node.js v18+**

### Running the App

```bash
npm install       # first time only
npm run dev
```

Then open **http://localhost:5173** in your browser.

### Other Scripts

```bash
npm run build              # compile production bundle → dist/
npm run preview            # serve the production build locally
npm run build:standalone   # build a single self-contained HTML file → dist-standalone/agile-velocity-tool.html
npm test                   # run the Vitest test suite
```

The standalone file (`dist-standalone/agile-velocity-tool.html`) can be shared directly with anyone — just double-click to open. No server or installation required.

---

## Project Structure

```
agile-velocity-tool/
├── index.html
├── vite.config.js              # Vite + React plugin config
├── vite.standalone.js          # Vite config for single-file build
├── build-standalone.js         # Build script for standalone HTML
├── package.json
├── public/
└── src/
    ├── main.jsx                # React entry point
    ├── App.jsx                 # Root layout: Sidebar + page router + workspace wiring
    ├── App.css
    ├── index.css               # Global CSS variables and base styles
    ├── components/
    │   ├── Sidebar.jsx / .css       # Navigation sidebar + workspace switcher
    │   ├── Dashboard.jsx / .css     # KPI overview + velocity chart
    │   ├── TeamMembers.jsx / .css   # Team roster management
    │   ├── Sprints.jsx / .css       # Sprint tracking + per-member capacity
    │   ├── VelocityChart.jsx / .css # Analytics charts (compact + expanded views)
    │   ├── Forecast.jsx / .css      # Delivery forecasting
    │   ├── Releases.jsx / .css      # Release planning + milestones
    │   ├── Integrations.jsx / .css  # Jira / Azure DevOps connections
    │   ├── AIAssistant.jsx / .css   # AI Agile Coach chat
    │   └── Settings.jsx / .css      # Config, regions, workspaces, data management
    ├── context/
    │   ├── VelocityContext.jsx      # Per-workspace global state (useReducer + localStorage)
    │   └── WorkspaceContext.jsx     # Workspace index + active workspace selection
    ├── hooks/
    │   └── useLocalStorageState.js  # Persistent UI preference hook
    └── utils/
        ├── velocityCalc.js          # Velocity/capacity calculation functions
        ├── forecastCalc.js          # Forecast and Monte Carlo calculation functions
        └── stateSchema.js           # State shape validation and migration helpers
```

---

## Pages & Components

### Dashboard

**File:** `src/components/Dashboard.jsx`

The home screen. Shows at-a-glance KPIs and a velocity overview chart.

**KPI Cards:**
| Card | Description |
|---|---|
| Avg Velocity | Simple mean of completed points across all sprints |
| Weighted Velocity | Recency-weighted mean — more recent sprints count more |
| Adj. Velocity | Capacity-adjusted: what velocity *would* be at 100% allocation |
| Predictability | % of sprints where committed points were fully delivered |
| Trend | Direction of velocity over last 3 sprints (↑ / → / ↓) |
| Effective FTEs | Current allocation-weighted headcount from the latest sprint |
| Total PTO/Support/Other Days | Cumulative across all sprints |

**Chart:** Committed vs Completed bars, Rolling Average line, and a dashed Adjusted Velocity line.

---

### Team Members

**File:** `src/components/TeamMembers.jsx`

Manage the team roster. Members added here appear in **new sprints only** — existing sprints are not modified.

- Add / remove members
- Set name and role (Developer, QA Engineer, Designer, etc.)
- View **allocation history sparkline** — per-sprint bars showing ramp-up progress
- Current allocation (from latest sprint) shown as a read-only pill

> **Note:** Allocation % is set **per sprint** in the Sprints tab, not globally here. This allows tracking ramp-up over time (e.g. 25% → 50% → 75% → 100%).

---

### Sprints

**File:** `src/components/Sprints.jsx`

The core data entry page. Each sprint is an expandable card with two tabs:

**📋 Sprint Details tab:**
- Sprint name, start/end dates
- Committed points, completed points
- Free-text retrospective notes

**👥 Capacity Impact tab — Per-Member table:**

| Column | Description |
|---|---|
| Team Member | Name + avatar |
| Allocation % | Slider (0–100%, step 5) — how much of this sprint the member is dedicated |
| PTO Days | Days off for vacation/sick leave |
| Support Days | Days spent on support/on-call rotation |
| Other Days | Any other interruption (training, on-call, etc.) |
| Other Label | Free-text label for the Other Days category |
| Avail. Days | `(allocation% × sprintDays) − totalOff` — colour coded green/yellow/red |
| Total Off | Sum of PTO + Support + Other days |

Sprint header shows capacity impact chips (PTO/Support/Other totals) at a glance without expanding.

**Adding a new sprint** carries forward the previous sprint's allocation values (so ramp-up % persists) and resets all day-off fields to zero. Any team members added after the last sprint are automatically included.

**Team Day Off button** (–1 Team Day Off): decrements the Other Days count by 1 for every member who has Other Days remaining — useful for recording a shared team event in a single click.

**Reordering incomplete sprints:** Sprints with no completed points can be moved up or down in the list using ▲/▼ buttons in the sprint header. Completed sprints cannot be reordered. Reorder controls are hidden when a search filter is active.

---

### Velocity Analytics

**File:** `src/components/VelocityChart.jsx`

Deep-dive analytics with multiple charts and a sprint history table. Supports **Compact** and **Expanded** view modes.

**KPI Row:** Simple Avg · Weighted Avg · Adj. Velocity · Effective FTEs · Predictability · Trend

**View Modes:**
- **Compact** (default) — displays one chart at a time. Select a chart from the tab strip at the top. Defaults to Velocity Trend.
- **Expanded** — displays all charts stacked vertically for side-by-side comparison.

Toggle between modes using the **Compact / Expanded** buttons in the page header. The selected mode and active chart are remembered across sessions.

**Charts:**
1. **Velocity Trend** — Committed vs Completed bars, Rolling Avg line, Adj. (Full Cap.) dashed line
2. **Capacity Utilization** — % of allocation-adjusted capacity unaffected by interruptions per sprint, colour coded:
   - 🟢 ≥ 90% — high utilization
   - 🟡 ≥ 70% — moderate impact
   - 🔴 < 70% — significant interruptions
3. **Sprint-over-Sprint Delta** — velocity change between consecutive sprints
4. **Burnup Chart** — cumulative completed points over time
5. **Capacity Impact** — PTO / Support / Other days per sprint vs completed points
6. **Sprint History** — tabular view with: Sprint · Committed · Completed · % Done · Eff. FTEs · Utilization · Adj. Velocity · PTO · Support · Other · Rolling Avg

---

### Forecast

**File:** `src/components/Forecast.jsx`

Projects how much backlog can be delivered over time.

**Controls:**
- **Remaining Backlog** — slider + number input (story points)
- **Velocity Method** — Weighted (recommended) or Simple Average
- **Team Allocation** — toggle between:
  - *Actual* — uses the FTE ratio from the latest sprint (e.g. 2.5/3 members = 83%)
  - *100% Ideal* — assumes full team at full allocation

**Result Cards:** Effective velocity · Estimated sprints · Backlog size · Effective FTEs

**Time-Period Forecast Cards (3 / 6 / 9 / 12 months):**
Each card shows total points deliverable, sprint count, working days, and a progress bar vs the current backlog size.

**Charts:**
- Story Points deliverable per time period (bar chart)
- Cumulative points delivered month-by-month over 12 months (line chart)

**Tables:**
- Time-period detail with Optimistic (+20%) and Pessimistic (-20%) columns
- Scenario planning table (Optimistic / Expected / Pessimistic sprints needed)

---

### Releases

**File:** `src/components/Releases.jsx`

Plan and track release epics with milestones, dependency chains, and AI-powered delivery forecasts.

**Release Plans:**
- Create multiple release plans with a name, total backlog points, target date, and notes
- Each plan shows an estimated delivery window based on current weighted velocity using a **Monte Carlo simulation** (P50 / P85 / P95 confidence intervals)

**Milestones:**
- Add milestones to each release (e.g. Alpha, Beta, RC, GA, QA Sign-off)
- Per milestone: name, target date, gate criteria, status, notes
- **Milestone status options:** Not Started · On Track · At Risk · Blocked · Done
- **Dependency linking:** each milestone can declare which other milestones it depends on, with a searchable picker

**Multi-Workspace:** When multiple workspaces exist, a **Copy to workspace…** dropdown appears on each release plan — lets you copy the plan (with milestones) to another workspace without overwriting if a release with the same name already exists there.

---

### Integrations

**File:** `src/components/Integrations.jsx`

Connect the tool to external project management systems.

**Supported providers:**
- **Jira** — connect via base URL + username + API token. Tests connectivity against the Jira REST API (`/rest/api/3/myself`). Configure field mappings for sprint, story points, and status fields.
- **Azure DevOps** — connect via organization name + Personal Access Token. Tests connectivity and reports the number of visible projects.

Integration credentials are stored in the app state (localStorage) for convenience. Field mapping configuration allows the tool to correctly interpret your board's custom fields.

> **Note:** Data import from these integrations is connection-tested in the UI. Full bi-directional sync is a planned enhancement.

---

### AI Assistant

**File:** `src/components/AIAssistant.jsx`

An Agile Coach chatbot with full awareness of your sprint data. Supports four AI providers:

| Provider | Models | Cost | Key Required |
|---|---|---|---|
| 🟢 OpenAI | GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo | Paid | Yes — platform.openai.com |
| 🟠 Anthropic Claude | Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus | Paid | Yes — console.anthropic.com |
| 🔵 Google Gemini | Gemini 1.5 Flash, 1.5 Pro, 2.0 Flash | Free tier | Yes — aistudio.google.com |
| 🏠 Ollama (Local) | Llama 3.2, Mistral, Gemma2, Phi3, Qwen2.5, etc. | Free | No — runs locally |

The assistant is automatically injected with a system prompt containing:
- Team size and member names
- Sprint history (committed, completed, PTO/support/other days per sprint)
- Calculated velocity metrics (avg, weighted, predictability, trend)

API keys are stored in **browser sessionStorage only** — they are never saved to localStorage and are cleared when the tab is closed.

---

### Settings

**File:** `src/components/Settings.jsx`

| Setting | Description | Default |
|---|---|---|
| Sprint Duration | Working days per sprint — used in capacity and forecast calculations | 10 days |
| Support Impact Factor | Fraction of capacity retained on support days. At 80%, each support day costs 20% of a person-day | 80% |

**Regions & Holidays:**
Define geographic regions (e.g. United States, United Kingdom) and assign public holidays to each. Holidays are used to automatically account for non-working days in capacity calculations. Each region shows which team members belong to it and how many holidays are configured. When multiple workspaces exist, a **Copy to workspace…** option lets you replicate a region to another workspace.

**Workspace Management:**
- Create new workspaces (each starts with a clean slate — no inherited data)
- Rename any workspace, including the default
- Switch between workspaces
- Delete non-default workspaces (when only one remains, the management panel hides itself)

**Data Management:**
- **Export JSON** — downloads the full workspace state as `agile-velocity-data.json`
- **Import JSON** — loads a previously exported file, replacing current state
- **Reset All Data** — clears localStorage and reloads with default sample data

---

## Multi-Workspace Support

The tool supports multiple independent workspaces — useful for managing multiple teams or projects from one tool.

**Workspace switcher:** When more than one workspace exists, a dropdown appears at the top of the sidebar. Selecting a workspace instantly switches all data (team members, sprints, metrics, settings) to that workspace while keeping you on the current page.

**Workspace management panel:** Shown in the sidebar when multiple workspaces exist. Lets you rename or delete workspaces inline.

**Data isolation:** Each workspace has its own localStorage key. Creating a new workspace starts with a completely empty state — no data is inherited from other workspaces.

**Cross-workspace copy:** Releases and regions can be copied to other workspaces from their respective pages, with duplicate name detection to prevent accidental overwrites.

---

## Data Model

### Team Member

```js
{
  id: string,        // UUID
  name: string,      // Display name
  role: string,      // e.g. 'Developer', 'QA Engineer', 'Designer'
  regionId: string,  // references Region.id (optional)
}
```

### Sprint

```js
{
  id: string,
  name: string,              // e.g. 'Sprint 6'
  startDate: string,         // ISO date 'YYYY-MM-DD'
  endDate: string,
  committedPoints: number,
  completedPoints: number,
  notes: string,
  memberCapacity: MemberCapacityRow[]
}
```

### MemberCapacityRow

One row per team member, per sprint. This is where allocation and all day-off data lives.

```js
{
  memberId: string,      // references TeamMember.id
  memberName: string,    // denormalized for display (synced on rename)
  allocation: number,    // 0–100 (percent of sprint dedicated to this team)
  ptoDays: number,       // vacation / sick days
  supportDays: number,   // on-call / support rotation days
  otherDays: number,     // training, meetings, etc.
  otherLabel: string,    // free-text description for otherDays
}
```

### Release Plan

```js
{
  id: string,
  name: string,
  backlogPoints: number,
  targetDate: string,    // ISO date
  notes: string,
  milestones: Milestone[]
}
```

### Milestone

```js
{
  id: string,
  name: string,
  targetDate: string,
  gate: string,                        // gate criteria (free text)
  status: string,                      // 'not_started' | 'on_track' | 'at_risk' | 'blocked' | 'done'
  notes: string,
  dependsOnMilestoneIds: string[],     // IDs of milestones this one depends on
}
```

### Region

```js
{
  id: string,
  name: string,
  holidays: Holiday[]
}
```

### Holiday

```js
{
  id: string,
  regionId: string,
  name: string,       // e.g. 'Christmas Day'
  date: string,       // ISO date 'YYYY-MM-DD'
}
```

---

## Capacity Calculations

All functions live in `src/utils/velocityCalc.js`.

### `calcEffectiveCapacity(memberCapacity, sprintDays, supportImpactFactor)`
Returns total **effective person-days** for a sprint after accounting for allocation, PTO, support, and other interruptions.

```
effectiveDays = max(0, (allocation/100 × sprintDays) − ptoDays − (supportDays × (1 − supportImpactFactor)) − otherDays)
```
Summed across all members.

### `calcFullCapacity(memberCapacity, sprintDays)`
Returns the **allocation-adjusted maximum** person-days with zero interruptions.
```
fullDays = (allocation/100 × sprintDays)  [summed across members]
```

### `calcCapacityUtilization(memberCapacity, sprintDays, supportImpactFactor)`
Returns `(effectiveDays / fullDays) × 100` as a percentage. 100% = no interruptions at all.

### `calcCapacityAdjustedVelocity(sprints, sprintDays, supportImpactFactor)`
Extrapolates what velocity **would have been** if the team had been at full capacity every sprint:
```
adjustedVelocity = (completedPoints / effectiveDays) × fullDays  [averaged across sprints]
```

### `calcAverageVelocity(sprints)`
Simple mean of `completedPoints` across all sprints.

### `calcWeightedVelocity(sprints)`
Recency-weighted mean — sprint at index `i` has weight `i+1`, so the most recent sprint counts most.

### `calcPredictability(sprints)`
Average of `min(1, completedPoints / committedPoints)` across sprints with committed > 0, expressed as %.

### `calcTrend(sprints)`
Compares first and last of the last 3 sprints. Returns `'up'` (delta > 2), `'down'` (delta < -2), or `'neutral'`.

### `buildChartData(sprints, sprintDays, supportImpactFactor)`
Returns a per-sprint array enriched with: `rollingAvg`, `ptoDays`, `supportDays`, `otherDays`, `effectiveFTEs`, `effectiveDays`, `fullDays`, `utilization`, `adjVelocity`.

---

## State Management

**Files:** `src/context/VelocityContext.jsx`, `src/context/WorkspaceContext.jsx`

Global state is managed with React's `useReducer`. `VelocityContext` holds all per-workspace data and is provided by `<VelocityProvider>` (which accepts a `storageKey` prop). `WorkspaceContext` manages the workspace index and which workspace is active — it lives outside `VelocityProvider` and drives the `storageKey` prop.

### Reducer Actions

| Action | Payload | Description |
|---|---|---|
| `LOAD_STATE` | `payload: state` | Replace entire state (used by import and workspace switching) |
| `SET_TAB` | `tab: string` | Navigate to a page |
| `ADD_MEMBER` | — | Add a new blank team member |
| `UPDATE_MEMBER` | `id, data` | Update member fields. If `name` changes, syncs it across all sprint capacity rows |
| `REMOVE_MEMBER` | `id` | Remove member and their capacity rows from all sprints |
| `ADD_SPRINT` | — | Add a new sprint, carrying forward previous sprint's allocation values |
| `UPDATE_SPRINT` | `id, data` | Update sprint fields (name, dates, points, notes) |
| `REMOVE_SPRINT` | `id` | Delete a sprint |
| `MOVE_SPRINT` | `id, direction` | Move an incomplete sprint up or down in the list |
| `UPDATE_SPRINT_MEMBER_CAPACITY` | `sprintId, memberId, data` | Update a single member's capacity row within a sprint |
| `ADD_RELEASE` | — | Add a new blank release plan |
| `UPDATE_RELEASE` | `id, data` | Update release plan fields |
| `REMOVE_RELEASE` | `id` | Delete a release plan |
| `UPDATE_RELEASE_MILESTONE` | `releaseId, milestoneId, data` | Update a single milestone within a release |
| `ADD_REGION` | — | Add a new blank region |
| `UPDATE_REGION` | `id, data` | Update region fields |
| `REMOVE_REGION` | `id` | Delete a region and its holidays |
| `ADD_HOLIDAY` | `regionId` | Add a new blank holiday to a region |
| `UPDATE_HOLIDAY` | `id, data` | Update a holiday |
| `REMOVE_HOLIDAY` | `id` | Delete a holiday |
| `SET_SPRINT_DURATION` | `value: number` | Update global sprint duration in working days |
| `SET_SUPPORT_IMPACT` | `value: number` | Update support impact factor (0–1) |
| `ADD_CHAT_MESSAGE` | `message` | Append a message to AI chat history |
| `CLEAR_CHAT` | — | Clear AI chat history |

---

## Data Persistence

Each workspace's data is persisted to **browser localStorage** under its own unique key (e.g. `agile_velocity_tool_state`, `agile_velocity_tool_ws_<id>`). The workspace index and active workspace selection are stored under separate keys.

State is loaded synchronously on first render via the `useReducer` lazy initializer — eliminating any race condition between loading saved data and the default state. State is saved automatically on every change via a `useEffect`.

Switching workspaces preserves your current page — only the data changes, not the navigation.

**AI API keys** are stored in `sessionStorage` only and are cleared when the browser tab is closed.

To back up or transfer data, use **Settings → Export JSON**. To restore, use **Settings → Import JSON**.

---

## AI Providers

### Ollama (Free, Local)
1. Install from [ollama.com](https://ollama.com)
2. Run `ollama serve` in a terminal
3. Pull a model: `ollama pull llama3.2`
4. Select Ollama in the AI Assistant tab — no API key needed

### Google Gemini (Free Tier)
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Create a free API key
3. Paste it into the AI Assistant tab

### OpenAI
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create an API key
3. Paste it into the AI Assistant tab

### Anthropic Claude
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Paste it into the AI Assistant tab
