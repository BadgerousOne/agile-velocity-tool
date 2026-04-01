# ⚡ Agile Velocity Tool

A modern, full-featured Agile Velocity tracking tool built with **React + Vite**. Tracks team capacity, sprint velocity, and forecasts delivery timelines — with a built-in AI Agile Coach.

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
  - [AI Assistant](#ai-assistant)
  - [Settings](#settings)
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
| 🏃 **Sprints** | Track committed vs completed points, per-member PTO/support/other days, allocation % per sprint |
| 📈 **Velocity Analytics** | Trend charts, capacity utilization chart, sprint-over-sprint delta, history table with FTEs and utilization % |
| 🔭 **Forecast** | Backlog burndown, scenario planning, time-period forecasts (3/6/9/12 months) using actual team allocation |
| 🤖 **AI Assistant** | Multi-provider Agile Coach (OpenAI, Claude, Gemini, Ollama) with full sprint context injection |
| ⚙️ **Settings** | Sprint duration, support impact factor, JSON export/import, data reset |

---

## Getting Started

### Prerequisites

- **Node.js v18+** — installed at `C:\Program Files\nodejs\`

### Running the App

Open a terminal and run:

```bash
cd C:\Users\emoreau\AI\agile-velocity-tool
npm install       # first time only
npm run dev
```

Then open **http://localhost:5173** in your browser.

### Other Scripts

```bash
npm run build     # compile production bundle → dist/
npm run preview   # serve the production build locally
```

---

## Project Structure

```
agile-velocity-tool/
├── index.html
├── vite.config.js          # Vite + React plugin config
├── package.json
├── public/
└── src/
    ├── main.jsx            # React entry point
    ├── App.jsx             # Root layout: Sidebar + page router
    ├── App.css
    ├── index.css           # Global CSS variables and base styles
    ├── components/
    │   ├── Sidebar.jsx / .css       # Navigation sidebar
    │   ├── Dashboard.jsx / .css     # KPI overview + velocity chart
    │   ├── TeamMembers.jsx / .css   # Team roster management
    │   ├── Sprints.jsx / .css       # Sprint tracking + per-member capacity
    │   ├── VelocityChart.jsx / .css # Analytics + capacity utilization charts
    │   ├── Forecast.jsx / .css      # Delivery forecasting
    │   ├── AIAssistant.jsx / .css   # AI Agile Coach chat
    │   └── Settings.jsx / .css      # Global config + data management
    ├── context/
    │   └── VelocityContext.jsx      # Global state (useReducer + localStorage)
    ├── hooks/                       # (reserved for custom hooks)
    └── utils/
        └── velocityCalc.js          # All velocity/capacity calculation functions
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

---

### Velocity Analytics

**File:** `src/components/VelocityChart.jsx`

Deep-dive analytics with four charts and a history table.

**KPI Row:** Simple Avg · Weighted Avg · Adj. Velocity · Effective FTEs · Predictability · Trend

**Charts:**
1. **Velocity Trend** — Committed vs Completed bars, Rolling Avg line, Adj. (Full Cap.) dashed line
2. **Capacity Utilization** — % of allocation-adjusted capacity unaffected by interruptions per sprint, colour coded:
   - 🟢 ≥ 90% — high utilization
   - 🟡 ≥ 70% — moderate impact
   - 🔴 < 70% — significant interruptions
3. **Sprint-over-Sprint Delta** — velocity change between consecutive sprints
4. **Capacity Impact** — PTO / Support / Other days per sprint vs completed points

**Sprint History Table columns:** Sprint · Committed · Completed · % Done · Eff. FTEs · Utilization · Adj. Velocity · PTO · Support · Other · Rolling Avg

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
| Sprint Duration | Working days per sprint — used in capacity and forecast calculations | 14 days |
| Support Impact Factor | Fraction of capacity retained on support days. At 80%, each support day costs 20% of a person-day | 80% |

**Data Management:**
- **Export JSON** — downloads the full app state as `agile-velocity-data.json`
- **Import JSON** — loads a previously exported file, replacing current state
- **Reset All Data** — clears localStorage and reloads with default sample data

---

## Data Model

### Team Member

```js
{
  id: string,        // UUID
  name: string,      // Display name
  role: string,      // e.g. 'Developer', 'QA Engineer', 'Designer'
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

**File:** `src/context/VelocityContext.jsx`

Global state is managed with React's `useReducer`. The context is provided by `<VelocityProvider>` in `App.jsx` and consumed anywhere via the `useVelocity()` hook.

### Reducer Actions

| Action | Payload | Description |
|---|---|---|
| `LOAD_STATE` | `payload: state` | Replace entire state (used by import and initial localStorage load) |
| `SET_TAB` | `tab: string` | Navigate to a page |
| `ADD_MEMBER` | — | Add a new blank team member. Does **not** modify existing sprints |
| `UPDATE_MEMBER` | `id, data` | Update member fields. If `name` changes, syncs it across all sprint capacity rows |
| `REMOVE_MEMBER` | `id` | Remove member and their capacity rows from all sprints |
| `ADD_SPRINT` | — | Add a new sprint, carrying forward previous sprint's allocation values and merging any new team members |
| `UPDATE_SPRINT` | `id, data` | Update sprint fields (name, dates, points, notes) |
| `REMOVE_SPRINT` | `id` | Delete a sprint |
| `UPDATE_SPRINT_MEMBER_CAPACITY` | `sprintId, memberId, data` | Update a single member's capacity row within a specific sprint |
| `SET_SPRINT_DURATION` | `value: number` | Update global sprint duration in working days |
| `SET_SUPPORT_IMPACT` | `value: number` | Update support impact factor (0–1) |
| `ADD_CHAT_MESSAGE` | `message` | Append a message to AI chat history |
| `CLEAR_CHAT` | — | Clear AI chat history |

---

## Data Persistence

All app data is persisted to **browser localStorage** under the key `agile_velocity_tool_state`.

State is loaded **synchronously** on first render via the `useReducer` lazy initializer — eliminating any race condition between loading saved data and the default state. State is saved automatically on every change via a `useEffect`.

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

