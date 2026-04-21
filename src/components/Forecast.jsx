/**
 * Forecast.jsx
 *
 * Delivery forecasting page. Projects how much backlog can be delivered
 * over time based on historical velocity and current team allocation.
 *
 * Controls:
 *  - Remaining Backlog (slider + number input, story points)
 *  - Velocity Method: Weighted (recommended) or Simple Average
 *  - Team Allocation toggle:
 *      Actual  — uses the FTE ratio from the latest sprint
 *                (e.g. 2.5/3 members = 83% effective allocation)
 *      100% Ideal — assumes full team at full allocation (old behaviour)
 *
 * Outputs:
 *  - Result cards: effective velocity, estimated sprints, backlog size, effective FTEs
 *  - Time-period forecast cards: 3 / 6 / 9 / 12 months
 *  - Story Points deliverable bar chart
 *  - Cumulative delivery line chart (12 months)
 *  - Time-period detail table with Optimistic (+20%) / Pessimistic (-20%) columns
 *  - Scenario planning table
 */
import React, { useId, useMemo, useState } from 'react';
import { useVelocity } from '../context/VelocityContext';
import {
  calcWeightedVelocity, calcAverageVelocity,
  getLatestEffectiveFTEs,
  runMonteCarloForecast,
} from '../utils/velocityCalc';
import {
  WORKING_DAYS_PER_MONTH,
  TIME_PERIODS,
  SPRINT_PERIODS,
  buildCumulativeChartData,
  buildPeriodBarData,
  buildPeriodForecasts,
} from '../utils/forecastCalc';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import {
  ResponsiveContainer, LineChart, BarChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend, Cell,
} from 'recharts';
import './Forecast.css';

const FORECAST_HORIZON_STORAGE_KEY = 'forecast_horizon_mode';
const FORECAST_PLANNING_EXPANDED_STORAGE_KEY = 'forecast_planning_expanded';
const FORECAST_INPUTS_EXPANDED_STORAGE_KEY = 'forecast_inputs_expanded';
const FORECAST_BACKLOG_EXPANDED_STORAGE_KEY = 'forecast_backlog_expanded';

// ─── Sub-components ───────────────────────────────────────────────────────────

function MonteCarloTable({ monteCarlo, sprintDurationDays }) {
  return (
    <div className="card chart-section">
      <h2 className="chart-title">Monte Carlo Confidence Bands</h2>
      <p className="chart-sub">
        Based on {monteCarlo.sampleSize} historical sprint outcome{monteCarlo.sampleSize === 1 ? '' : 's'}.
      </p>
      <div className="scenario-table-wrap">
        <table className="vel-table">
          <thead>
            <tr>
              <th>Percentile</th>
              <th>Sprints Needed</th>
              <th>Approx. Weeks</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>P50</td>
              <td>{monteCarlo.p50 ?? '—'}</td>
              <td>{typeof monteCarlo.p50 === 'number' ? `≈ ${(monteCarlo.p50 * (sprintDurationDays / 7)).toFixed(1)} weeks` : '—'}</td>
            </tr>
            <tr>
              <td>P80 (recommended planning guardrail)</td>
              <td>{monteCarlo.p80 ?? '—'}</td>
              <td>{typeof monteCarlo.p80 === 'number' ? `≈ ${(monteCarlo.p80 * (sprintDurationDays / 7)).toFixed(1)} weeks` : '—'}</td>
            </tr>
            <tr>
              <td>P90</td>
              <td>{monteCarlo.p90 ?? '—'}</td>
              <td>{typeof monteCarlo.p90 === 'number' ? `≈ ${(monteCarlo.p90 * (sprintDurationDays / 7)).toFixed(1)} weeks` : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SavedScenariosTable({
  savedScenarios, compareLeftId, compareRightId,
  setCompareLeftId, setCompareRightId,
  onLoad, onRemove, onDuplicate,
}) {
  return (
    <>
      <div className="card chart-section">
        <h2 className="chart-title">Saved What-If Scenarios</h2>
        <div className="scenario-table-wrap">
          <table className="vel-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Backlog</th>
                <th>Velocity Method</th>
                <th>Allocation</th>
                <th>Planned</th>
                <th>Mode</th>
                <th>Outcome</th>
                <th>Saved</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {savedScenarios.map(sc => (
                <tr key={sc.id}>
                  <td>{sc.name}</td>
                  <td>{sc.backlog} pts</td>
                  <td>{sc.useWeighted ? 'Weighted' : 'Average'}</td>
                  <td>{sc.useActualAlloc ? 'Actual' : '100% Ideal'}</td>
                  <td>{sc.usePlannedAlloc ? `${sc.plannedAllocPct}%` : '—'}</td>
                  <td>{sc.forecastMode === 'monte-carlo' ? 'Monte Carlo' : 'Deterministic'}</td>
                  <td>{sc.forecastMode === 'monte-carlo' ? `P80 ${sc.p80 ?? '—'} sprints` : `${sc.deterministicSprints ?? '—'} sprints`}</td>
                  <td>{sc.savedAt ? new Date(sc.savedAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => onLoad(sc)}>Load</button>
                    <button className="btn btn-danger" style={{ marginLeft: 8 }} onClick={() => onRemove(sc.id)}>Remove</button>
                    <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => onDuplicate(sc)}>Duplicate</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {savedScenarios.length >= 2 && (
        <div className="card chart-section">
          <h2 className="chart-title">Scenario Comparison</h2>
          <div className="forecast-controls" style={{ padding: 0, marginBottom: 8 }}>
            <div className="fc-control">
              <label>Scenario A</label>
              <select className="settings-select" value={compareLeftId} onChange={e => setCompareLeftId(e.target.value)}>
                <option value="">Select scenario</option>
                {savedScenarios.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
              </select>
            </div>
            <div className="fc-control">
              <label>Scenario B</label>
              <select className="settings-select" value={compareRightId} onChange={e => setCompareRightId(e.target.value)}>
                <option value="">Select scenario</option>
                {savedScenarios.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
              </select>
            </div>
          </div>
          {(() => {
            const left = savedScenarios.find(s => s.id === compareLeftId);
            const right = savedScenarios.find(s => s.id === compareRightId);
            if (!left || !right) return <p className="chart-sub">Pick two scenarios to compare outcomes.</p>;
            const leftValue = left.forecastMode === 'monte-carlo' ? left.p80 : left.deterministicSprints;
            const rightValue = right.forecastMode === 'monte-carlo' ? right.p80 : right.deterministicSprints;
            const delta = (Number(rightValue) || 0) - (Number(leftValue) || 0);
            return (
              <div className="scenario-table-wrap">
                <table className="vel-table">
                  <thead><tr><th>Metric</th><th>{left.name}</th><th>{right.name}</th><th>Delta (B - A)</th></tr></thead>
                  <tbody>
                    <tr><td>Backlog</td><td>{left.backlog}</td><td>{right.backlog}</td><td>{(right.backlog || 0) - (left.backlog || 0)}</td></tr>
                    <tr><td>Forecast Mode</td><td>{left.forecastMode}</td><td>{right.forecastMode}</td><td>—</td></tr>
                    <tr><td>Sprints Needed</td><td>{leftValue ?? '—'}</td><td>{rightValue ?? '—'}</td><td>{delta >= 0 ? `+${delta}` : `${delta}`}</td></tr>
                    <tr><td>Planned Allocation</td><td>{left.usePlannedAlloc ? `${left.plannedAllocPct}%` : 'off'}</td><td>{right.usePlannedAlloc ? `${right.plannedAllocPct}%` : 'off'}</td><td>—</td></tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}

function ReleaseDeliveryStatusTable({ releaseDeliveryStatus, velocity, allocationFactor, allocationPct, horizonMode }) {
  return (
    <div className="card chart-section">
      <h2 className="chart-title">🗺️ Release Delivery Status</h2>
      <p className="chart-sub">
        Based on current effective velocity of {parseFloat((velocity * allocationFactor).toFixed(1))} pts/sprint ({allocationPct}% allocation)
      </p>
      <div className="scenario-table-wrap">
        <table className="vel-table">
          <thead>
            <tr>
              <th>Release</th>
              <th>Backlog</th>
              <th>Target Date</th>
              <th>{horizonMode === 'time' ? 'Months Away' : 'Sprints Away'}</th>
              <th>Sprints Needed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {releaseDeliveryStatus.map(r => {
              const proximity = horizonMode === 'time'
                ? (r.monthsAway != null ? `${r.monthsAway} mo` : '—')
                : (r.sprintsAway != null ? `${r.sprintsAway} sprints` : '—');
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                  <td>{r.backlogPoints} pts</td>
                  <td>{r.targetDate || '—'}</td>
                  <td>
                    {r.daysUntil != null
                      ? <span style={{ color: r.daysUntil < 0 ? 'var(--danger)' : r.daysUntil < 30 ? 'var(--warning)' : 'var(--text-secondary)' }}>
                          {r.daysUntil < 0 ? `${Math.abs(r.daysUntil)}d overdue` : `${r.daysUntil}d`} ({proximity})
                        </span>
                      : '—'}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--primary-light)' }}>{r.sprintsNeeded ?? '—'}</td>
                  <td>
                    {r.onTrack === true && <span className="badge badge-success">✓ On Track</span>}
                    {r.onTrack === false && <span className="badge badge-danger">⚠ At Risk</span>}
                    {r.onTrack === null && <span className="badge">No target date</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HelpTip({ text }) {
  const tooltipId = useId();

  return (
    <span className="fc-help-tip-wrap">
      <button
        type="button"
        className="fc-help-tip"
        aria-label={`Help: ${text}`}
        aria-describedby={tooltipId}
      >
        i
      </button>
      <span id={tooltipId} role="tooltip" className="fc-help-popover">
        {text}
      </span>
    </span>
  );
}

export default function Forecast() {
  const { state } = useVelocity();
  const { sprints, sprintDurationDays, releasePlans } = state;

  const [backlog, setBacklog]         = useState(200);
  const [planningExpanded, setPlanningExpanded] = useLocalStorageState(
    FORECAST_PLANNING_EXPANDED_STORAGE_KEY,
    true,
    {
      parse: value => value === 'true',
      serialize: value => String(value),
    }
  );
  const [inputsExpanded, setInputsExpanded] = useLocalStorageState(
    FORECAST_INPUTS_EXPANDED_STORAGE_KEY,
    false,
    {
      parse: value => value === 'true',
      serialize: value => String(value),
    }
  );
  const [backlogExpanded, setBacklogExpanded] = useLocalStorageState(
    FORECAST_BACKLOG_EXPANDED_STORAGE_KEY,
    false,
    {
      parse: value => value === 'true',
      serialize: value => String(value),
    }
  );
  const [useWeighted, setUseWeighted] = useState(true);
  const [useActualAlloc, setUseActualAlloc] = useState(true);
  const [usePlannedAlloc, setUsePlannedAlloc] = useState(false);
  const [plannedAllocPct, setPlannedAllocPct] = useState(85);
  const [forecastMode, setForecastMode] = useState('deterministic');
  const [horizonMode, setHorizonMode] = useLocalStorageState(
    FORECAST_HORIZON_STORAGE_KEY,
    'time',
    {
      parse: value => value === 'sprints' ? 'sprints' : 'time',
      serialize: value => value,
    }
  );
  const [scenarioName, setScenarioName] = useState('');
  const [compareLeftId, setCompareLeftId] = useState('');
  const [compareRightId, setCompareRightId] = useState('');
  const [savedScenarios, setSavedScenarios] = useLocalStorageState(
    'velocity_saved_scenarios',
    [],
    {
      parse: value => {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      },
      serialize: value => JSON.stringify(value),
    }
  );

  const avg      = useMemo(() => calcAverageVelocity(sprints), [sprints]);
  const weighted = useMemo(() => calcWeightedVelocity(sprints), [sprints]);
  const velocity = useWeighted ? weighted : avg;

  // Latest sprint's effective FTE ratio (e.g. 2.5 FTEs out of 3 members)
  const latestFTEs    = useMemo(() => getLatestEffectiveFTEs(sprints), [sprints]);
  // Max possible FTEs if everyone were at 100%
  const memberCount   = state.teamMembers.length;
  // allocationFactor: ratio of current FTEs vs full team headcount
  const allocationFactor = usePlannedAlloc
    ? plannedAllocPct / 100
    : ((useActualAlloc && latestFTEs != null && memberCount > 0)
      ? latestFTEs / memberCount
      : 1.0);
  const allocationPct = Math.round(allocationFactor * 100);

  const sprintsNeeded = velocity > 0 ? Math.ceil(backlog / (velocity * allocationFactor)) : null;
  const monteCarlo = useMemo(() => runMonteCarloForecast({
    backlogPoints: backlog,
    sprints,
    allocationFactor,
  }), [backlog, sprints, allocationFactor]);

  const displayedSprintsNeeded = forecastMode === 'monte-carlo'
    ? monteCarlo.p80
    : sprintsNeeded;

  // ── Scenario planning ────────────────────────────────────────────────────
  const scenarios = useMemo(() => [
    { label: 'Optimistic (+20%)',  vel: parseFloat((velocity * allocationFactor * 1.2).toFixed(1)) },
    { label: 'Expected',           vel: parseFloat((velocity * allocationFactor).toFixed(1))        },
    { label: 'Pessimistic (-20%)', vel: parseFloat((velocity * allocationFactor * 0.8).toFixed(1)) },
  ].map(s => ({ ...s, sprints: s.vel > 0 ? Math.ceil(backlog / s.vel) : '—' })), [velocity, allocationFactor, backlog]);

  // ── Time-period forecasts ─────────────────────────────────────────────────
  const periodForecasts = useMemo(() => buildPeriodForecasts({
    horizonMode,
    velocity,
    sprintDurationDays,
    allocationFactor,
  }), [horizonMode, velocity, sprintDurationDays, allocationFactor]);

  // Chart: cumulative points delivered month by month across 12 months
  const monthlyChartData = useMemo(() => buildCumulativeChartData({
    horizonMode,
    velocity,
    sprintDurationDays,
    allocationFactor,
  }), [horizonMode, velocity, sprintDurationDays, allocationFactor]);

  // Chart: points deliverable per period (bar chart)
  const periodBarData = useMemo(() => buildPeriodBarData(periodForecasts), [periodForecasts]);

  const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 };
  const tickStyle    = { fill: 'var(--text-secondary)', fontSize: 12 };

  // ── Release reference lines ───────────────────────────────────────────────
  const today = useMemo(() => new Date(), []);
  const releaseDeliveryStatus = useMemo(() => {
    const plans = Array.isArray(releasePlans) ? releasePlans : [];
    const effVel = velocity * allocationFactor;
    return plans
      .filter(p => p.backlogPoints > 0)
      .map(p => {
        const sprintsNeeded = effVel > 0 ? Math.ceil((p.backlogPoints || 0) / effVel) : null;
        let daysUntil = null, monthsAway = null, sprintsAway = null;
        if (p.targetDate) {
          const target = new Date(p.targetDate + 'T00:00:00');
          daysUntil = Math.round((target - today) / (1000 * 60 * 60 * 24));
          monthsAway = parseFloat((daysUntil / (365.25 / 12)).toFixed(1));
          sprintsAway = parseFloat((daysUntil / sprintDurationDays).toFixed(1));
        }
        const onTrack = sprintsAway != null && sprintsNeeded != null
          ? sprintsNeeded <= sprintsAway
          : null;
        return { ...p, sprintsNeeded, daysUntil, monthsAway, sprintsAway, onTrack };
      })
      .sort((a, b) => {
        if (!a.targetDate && !b.targetDate) return 0;
        if (!a.targetDate) return 1;
        if (!b.targetDate) return -1;
        return a.targetDate.localeCompare(b.targetDate);
      });
  }, [releasePlans, velocity, allocationFactor, sprintDurationDays, today]);

  // Accept releases up to one full unit past the chart edge so targets that
  // fall just beyond the visible window still appear pinned to the last tick.
  const chartReleaseLines = useMemo(() => releaseDeliveryStatus.filter(r =>
    horizonMode === 'time'
      ? r.monthsAway != null && r.monthsAway >= 0.5 && r.monthsAway <= 13
      : r.sprintsAway != null && r.sprintsAway >= 0.5 && r.sprintsAway <= 13
  ), [releaseDeliveryStatus, horizonMode]);

  return (
    <div className="forecast-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Forecast</h1>
          <p className="page-sub">Backlog delivery projections and time-horizon velocity forecasts</p>
        </div>
      </div>

      <div className="forecast-planning-group">
        <div className="forecast-planning-head">
          <div className="forecast-planning-head-row">
            <div>
              <span className="badge badge-primary">Planning Controls</span>
              <p className="page-sub">Adjust assumptions, then capture reusable scenarios for comparison.</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary fc-section-toggle"
              aria-expanded={planningExpanded}
              aria-controls="forecast-planning-panel"
              onClick={() => setPlanningExpanded(v => !v)}
            >
              {planningExpanded ? 'Hide Planning' : 'Show Planning'}
            </button>
          </div>
          {!planningExpanded && (
            <p className="fc-section-summary">
              Backlog: <strong>{backlog} pts</strong> · Velocity: <strong>{useWeighted ? 'Weighted' : 'Average'}</strong> · Mode: <strong>{forecastMode === 'monte-carlo' ? 'Monte Carlo' : 'Deterministic'}</strong> · Allocation: <strong>{usePlannedAlloc ? `${plannedAllocPct}% planned` : (useActualAlloc ? 'Actual' : '100% ideal')}</strong> · Scenarios: <strong>{savedScenarios.length}</strong>
            </p>
          )}
        </div>
        {planningExpanded && (
          <div id="forecast-planning-panel" className="forecast-planning-panel">
            {/* Controls */}
            <div className="forecast-controls card forecast-planning-card">
              <div className="fc-section-head">
                <div className="fc-section-head-row">
                  <div>
                    <h2 className="chart-title">Forecast Inputs</h2>
                    <p className="chart-sub">Set backlog, forecasting behavior, and allocation assumptions.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary fc-section-toggle"
                    aria-expanded={inputsExpanded}
                    aria-controls="forecast-inputs-panel"
                    onClick={() => setInputsExpanded(v => !v)}
                  >
                    {inputsExpanded ? 'Hide Inputs' : 'Show Inputs'}
                  </button>
                </div>
                {!inputsExpanded && (
                  <p className="fc-section-summary">
                    Backlog: <strong>{backlog} pts</strong> · Velocity: <strong>{useWeighted ? 'Weighted' : 'Average'}</strong> · Mode: <strong>{forecastMode === 'monte-carlo' ? 'Monte Carlo' : 'Deterministic'}</strong> · Allocation: <strong>{usePlannedAlloc ? `${plannedAllocPct}% planned` : (useActualAlloc ? 'Actual' : '100% ideal')}</strong>
                  </p>
                )}
              </div>

              {inputsExpanded && (
                <div id="forecast-inputs-panel" className="fc-section-panel">
                  <div className="fc-control">
                    <div className="fc-collapsible-header">
                      <label>Remaining Backlog (story points)</label>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setBacklogExpanded(v => !v)}
                      >
                        {backlogExpanded ? 'Hide' : 'Edit'} ({backlog} pts)
                      </button>
                    </div>
                    {backlogExpanded && (
                      <div className="fc-slider-row">
                        <input type="range" min={10} max={1000} step={10} value={backlog} onChange={e => setBacklog(Number(e.target.value))} style={{ flex: 1 }} />
                        <input type="number" min={1} value={backlog} onChange={e => setBacklog(Number(e.target.value))} className="fc-number-input" />
                      </div>
                    )}
                  </div>
                  <div className="fc-control">
                    <label className="fc-label-with-tip">
                      Velocity Method
                      <HelpTip text="Weighted emphasizes recent sprints. Simple Average treats all sprints equally." />
                    </label>
                    <div className="fc-toggle">
                      <button className={`fc-toggle-btn ${useWeighted ? 'active' : ''}`}  onClick={() => setUseWeighted(true)}>Weighted (Recommended)</button>
                      <button className={`fc-toggle-btn ${!useWeighted ? 'active' : ''}`} onClick={() => setUseWeighted(false)}>Simple Average</button>
                    </div>
                  </div>
                  <div className="fc-control">
                    <label className="fc-label-with-tip">
                      Forecast Mode
                      <HelpTip text="Deterministic uses one expected value. Monte Carlo simulates many runs and shows confidence percentiles (P50/P80/P90)." />
                    </label>
                    <div className="fc-toggle">
                      <button
                        className={`fc-toggle-btn ${forecastMode === 'deterministic' ? 'active' : ''}`}
                        onClick={() => setForecastMode('deterministic')}
                      >
                        Deterministic
                      </button>
                      <button
                        className={`fc-toggle-btn ${forecastMode === 'monte-carlo' ? 'active' : ''}`}
                        onClick={() => setForecastMode('monte-carlo')}
                      >
                        Monte Carlo
                      </button>
                    </div>
                  </div>
                  <div className="fc-control">
                    <label className="fc-label-with-tip">
                      Team Allocation
                      <HelpTip text="Actual uses latest sprint effective FTEs. 100% Ideal assumes full dedicated capacity. Planned lets you model future allocation changes." />
                    </label>
                    <div className="fc-toggle">
                      <button
                        className={`fc-toggle-btn ${useActualAlloc ? 'active' : ''}`}
                        onClick={() => setUseActualAlloc(true)}
                        title={latestFTEs != null ? `${latestFTEs} FTEs from latest sprint` : 'No sprint data yet'}
                      >
                        Actual ({latestFTEs != null ? `${allocationPct}%` : 'N/A'})
                      </button>
                      <button className={`fc-toggle-btn ${!useActualAlloc ? 'active' : ''}`} onClick={() => setUseActualAlloc(false)}>
                        100% (Ideal)
                      </button>
                    </div>
                    {useActualAlloc && latestFTEs != null && (
                      <div className="fc-alloc-note">
                        Using <strong>{latestFTEs} FTEs</strong> from latest sprint
                        ({allocationPct}% of {memberCount}-person team)
                      </div>
                    )}
                    <div className="fc-alloc-note" style={{ marginTop: 8 }}>
                      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={usePlannedAlloc} onChange={e => setUsePlannedAlloc(e.target.checked)} />
                        Use planned future allocation
                      </label>
                      {usePlannedAlloc && (
                        <div style={{ marginTop: 8 }}>
                          <input
                            type="range"
                            min={30}
                            max={120}
                            step={5}
                            value={plannedAllocPct}
                            onChange={e => setPlannedAllocPct(Number(e.target.value))}
                          />
                          <span className="settings-range-val" style={{ marginLeft: 8 }}>{plannedAllocPct}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="forecast-controls card forecast-planning-card forecast-planning-card-secondary">
              <div className="fc-section-head fc-section-head-compact">
                <h2 className="chart-title">Scenario Manager</h2>
                <p className="chart-sub">Save the current planning setup so you can reload, duplicate, and compare it later.</p>
              </div>
              <div className="fc-control" style={{ flex: 2 }}>
                <label>Save What-If Scenario</label>
                <div className="fc-slider-row">
                  <input
                    type="text"
                    value={scenarioName}
                    onChange={e => setScenarioName(e.target.value)}
                    placeholder="e.g. Q3 with 80% allocation"
                    className="fc-number-input"
                    style={{ minWidth: 260 }}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const name = scenarioName.trim();
                      if (!name) return;
                      const entry = {
                        id: `${Date.now()}`,
                        name,
                        savedAt: new Date().toISOString(),
                        backlog,
                        useWeighted,
                        useActualAlloc,
                        usePlannedAlloc,
                        plannedAllocPct,
                        forecastMode,
                        p80: monteCarlo.p80,
                        deterministicSprints: sprintsNeeded,
                      };
                      setSavedScenarios(curr => [entry, ...curr].slice(0, 15));
                      setScenarioName('');
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Backlog result row */}
      <div className="forecast-result-row">
        <div className="card forecast-result-card">
          <div className="fr-label">Using Velocity</div>
          <div className="fr-value" style={{ color: 'var(--secondary)' }}>{velocity} pts/sprint</div>
          {allocationFactor < 1 && (
            <div className="fr-sub" style={{ color: 'var(--warning)' }}>
              × {allocationPct}% allocation = {parseFloat((velocity * allocationFactor).toFixed(1))} pts effective
            </div>
          )}
        </div>
        <div className="card forecast-result-card highlight">
          <div className="fr-label">Estimated Sprints</div>
          <div className="fr-value" style={{ color: 'var(--primary-light)' }}>{displayedSprintsNeeded ?? '—'}</div>
          <div className="fr-sub">
            {forecastMode === 'monte-carlo'
              ? (monteCarlo.p80 ? `P80 confidence · ≈ ${(monteCarlo.p80 * (sprintDurationDays / 7)).toFixed(1)} weeks` : 'Insufficient history')
              : (sprintsNeeded ? `≈ ${(sprintsNeeded * (sprintDurationDays / 7)).toFixed(1)} weeks` : 'No data')
            }
          </div>
        </div>
        <div className="card forecast-result-card">
          <div className="fr-label">Backlog Size</div>
          <div className="fr-value" style={{ color: 'var(--warning)' }}>{backlog} pts</div>
        </div>
        {latestFTEs != null && (
          <div className="card forecast-result-card">
            <div className="fr-label">Effective FTEs</div>
            <div className="fr-value" style={{ color: allocationFactor < 1 ? 'var(--warning)' : 'var(--success)' }}>
              {latestFTEs}
            </div>
            <div className="fr-sub">Latest sprint · {memberCount} headcount</div>
          </div>
        )}
      </div>

      {forecastMode === 'monte-carlo' && (
        <MonteCarloTable monteCarlo={monteCarlo} sprintDurationDays={sprintDurationDays} />
      )}

      {savedScenarios.length > 0 && (
        <SavedScenariosTable
          savedScenarios={savedScenarios}
          compareLeftId={compareLeftId}
          compareRightId={compareRightId}
          setCompareLeftId={setCompareLeftId}
          setCompareRightId={setCompareRightId}
          onLoad={sc => {
            setBacklog(sc.backlog);
            setUseWeighted(!!sc.useWeighted);
            setUseActualAlloc(!!sc.useActualAlloc);
            setUsePlannedAlloc(!!sc.usePlannedAlloc);
            setPlannedAllocPct(Number(sc.plannedAllocPct || 85));
            setForecastMode(sc.forecastMode || 'deterministic');
          }}
          onRemove={id => setSavedScenarios(curr => curr.filter(v => v.id !== id))}
          onDuplicate={sc => {
            const clone = { ...sc, id: `${Date.now()}`, name: `${sc.name} (copy)`, savedAt: new Date().toISOString() };
            setSavedScenarios(curr => [clone, ...curr].slice(0, 15));
          }}
        />
      )}

      {/* ── RELEASE DELIVERY STATUS ─────────────────────────────────────── */}
      {releaseDeliveryStatus.length > 0 && (
        <ReleaseDeliveryStatusTable
          releaseDeliveryStatus={releaseDeliveryStatus}
          velocity={velocity}
          allocationFactor={allocationFactor}
          allocationPct={allocationPct}
          horizonMode={horizonMode}
        />
      )}

      {/* ── TIME-PERIOD FORECASTS ─────────────────────────────────────────── */}
      <div className="tp-section-header">
        <h2 className="section-title">📅 Forecast Horizons</h2>
        <p className="section-sub">
          {useActualAlloc && latestFTEs != null
            ? <>Using <strong>{latestFTEs} effective FTEs</strong> ({allocationPct}% allocation from latest sprint) · no PTO or support days modelled</>
            : <>Assumes <strong>100% team allocation</strong>, <strong>no PTO</strong>, and <strong>no support days</strong> — ideal capacity at current velocity.</>
          }
        </p>
        <div className="fc-toggle">
          <button className={`fc-toggle-btn ${horizonMode === 'time' ? 'active' : ''}`} onClick={() => setHorizonMode('time')}>
            Time-Based
          </button>
          <button className={`fc-toggle-btn ${horizonMode === 'sprints' ? 'active' : ''}`} onClick={() => setHorizonMode('sprints')}>
            Sprint-Based
          </button>
        </div>
      </div>

      {/* Period cards */}
      <div className="tp-grid">
        {periodForecasts.map(p => {
          const pctOfBacklog = backlog > 0 ? Math.min(100, Math.round((p.totalPoints / backlog) * 100)) : 0;
          const done = p.totalPoints >= backlog;
          return (
            <div key={p.months} className="tp-card card" style={{ borderTopColor: p.color }}>
              <div className="tp-period" style={{ color: p.color }}>{p.label}</div>
              <div className="tp-points">{p.totalPoints.toLocaleString()}<span className="tp-pts-label"> pts</span></div>
              <div className="tp-sprints">
                {horizonMode === 'time'
                  ? `${p.fullSprints} sprints (${p.sprintCount} total incl. partial)`
                  : `${p.sprintCount} sprints · ≈ ${p.months} months`
                }
              </div>
              <div className="tp-working-days">
                {horizonMode === 'time'
                  ? `${p.workingDays} working days`
                  : `${p.workingDays} working days · ≈ ${p.weeks} weeks`
                }
              </div>

              {/* Progress toward current backlog */}
              <div className="tp-backlog-row">
                <div className="tp-backlog-label">vs {backlog} pt backlog</div>
                <div className="tp-backlog-bar-wrap">
                  <div className="tp-backlog-bar-track">
                    <div className="tp-backlog-bar-fill" style={{ width: `${pctOfBacklog}%`, background: done ? 'var(--success)' : p.color }} />
                  </div>
                  <span className="tp-backlog-pct" style={{ color: done ? 'var(--success)' : p.color }}>
                    {done ? '✓ Done' : `${pctOfBacklog}%`}
                  </span>
                </div>
              </div>

              {done && (
                <div className="tp-surplus">
                  🎉 +{(p.totalPoints - backlog).toFixed(0)} pts surplus
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Points deliverable bar chart */}
      {velocity > 0 && (
        <div className="card chart-section">
          <h2 className="chart-title">Story Points Deliverable by {horizonMode === 'time' ? 'Time Period' : 'Sprint Count'}</h2>
          <p className="chart-sub">
            At {parseFloat((velocity * allocationFactor).toFixed(1))} pts/sprint effective
            ({allocationPct}% allocation · {sprintDurationDays}-day sprints)
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={periodBarData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-secondary)' }}
                formatter={(val, name) => [val, name === 'points' ? 'Story Points' : 'Sprints']}
              />
              <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }} />
              <Bar dataKey="points" name="Story Points" radius={[6, 6, 0, 0]}>
                {periodBarData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
              <ReferenceLine y={backlog} stroke="var(--warning)" strokeDasharray="5 5"
                label={{ value: `Backlog (${backlog})`, fill: 'var(--warning)', fontSize: 11, position: 'insideTopRight' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cumulative monthly delivery chart */}
      {velocity > 0 && monthlyChartData.length > 0 && (
        <div className="card chart-section">
          <h2 className="chart-title">Cumulative Points Delivered — {horizonMode === 'time' ? 'Month by Month (12-Month View)' : 'Sprint by Sprint (12-Sprint View)'}</h2>
          <p className="chart-sub">
            Running total at {allocationPct}% allocation · no interruptions modelled
            {chartReleaseLines.length > 0 && <span> · <span style={{ color: 'var(--danger)' }}>●</span> release target dates shown</span>}
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-secondary)' }}
                formatter={val => [`${val} pts`, 'Cumulative']}
              />
              <ReferenceLine y={backlog} stroke="var(--warning)" strokeDasharray="5 5"
                label={{ value: `Backlog (${backlog} pts)`, fill: 'var(--warning)', fontSize: 11, position: 'insideTopRight' }} />
              {(horizonMode === 'time' ? TIME_PERIODS : SPRINT_PERIODS).map(p => (
                <ReferenceLine key={horizonMode === 'time' ? p.months : p.sprints} x={horizonMode === 'time' ? `Mo ${p.months}` : `S${p.sprints}`} stroke={p.color} strokeDasharray="4 4"
                  label={{ value: p.label, fill: p.color, fontSize: 10, position: 'top' }} />
              ))}
              {chartReleaseLines.map(r => (
                <ReferenceLine
                  key={r.id}
                  x={horizonMode === 'time'
                    ? `Mo ${Math.min(12, Math.max(1, Math.round(r.monthsAway)))}`
                    : `S${Math.min(12, Math.max(1, Math.round(r.sprintsAway)))}`}
                  stroke="var(--danger)"
                  strokeDasharray="3 3"
                  label={{ value: r.name, fill: 'var(--danger)', fontSize: 10, position: 'insideTopLeft' }}
                />
              ))}
              <Line dataKey="cumulative" name="Cumulative Points" type="monotone"
                stroke="var(--primary-light)" strokeWidth={2} dot={{ r: 3, fill: 'var(--primary-light)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Period detail table */}
      <div className="card chart-section">
        <h2 className="chart-title">{horizonMode === 'time' ? 'Time-Period Forecast Detail' : 'Sprint-Based Forecast Detail'}</h2>
        <p className="chart-sub">
          {allocationPct}% allocation · {sprintDurationDays}-day sprints · ~{WORKING_DAYS_PER_MONTH} working days/month
        </p>
        <div className="scenario-table-wrap">
          <table className="vel-table">
            <thead>
              <tr>
                <th>{horizonMode === 'time' ? 'Period' : 'Sprint Horizon'}</th>
                <th>Working Days</th>
                <th>{horizonMode === 'time' ? 'Total Sprints' : 'Approx. Months'}</th>
                <th>{horizonMode === 'time' ? 'Full Sprints' : 'Sprint Count'}</th>
                <th>Points (Expected)</th>
                <th>Points (Optimistic +20%)</th>
                <th>Points (Pessimistic -20%)</th>
                <th>Backlog Coverage</th>
              </tr>
            </thead>
            <tbody>
              {periodForecasts.map(p => {
                const effVel     = velocity * allocationFactor;
                const optPoints  = parseFloat((effVel * 1.2 * p.sprintCount).toFixed(1));
                const pessPoints = parseFloat((effVel * 0.8 * p.sprintCount).toFixed(1));
                const pct        = backlog > 0 ? Math.min(100, Math.round((p.totalPoints / backlog) * 100)) : 0;
                const done       = p.totalPoints >= backlog;
                return (
                  <tr key={horizonMode === 'time' ? p.months : p.sprintCount}>
                    <td style={{ fontWeight: 600, color: p.color }}>{p.label}</td>
                    <td>{p.workingDays}d</td>
                    <td>{horizonMode === 'time' ? p.sprintCount : p.months}</td>
                    <td>{horizonMode === 'time' ? p.fullSprints : p.sprintCount}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary-light)' }}>{p.totalPoints}</td>
                    <td style={{ color: 'var(--success)' }}>{optPoints}</td>
                    <td style={{ color: 'var(--danger)' }}>{pessPoints}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: done ? 'var(--success)' : 'var(--text-secondary)' }}>
                        {done ? '✓ Complete' : `${pct}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scenario Planning */}
      <div className="card chart-section">
        <h2 className="chart-title">Backlog Scenario Planning</h2>
        <div className="scenario-table-wrap">
          <table className="vel-table">
            <thead>
              <tr><th>Scenario</th><th>Velocity</th><th>Sprints Needed</th><th>{horizonMode === 'time' ? 'Approx. Weeks' : 'Approx. Months'}</th></tr>
            </thead>
            <tbody>
              {scenarios.map(s => (
                <tr key={s.label}>
                  <td>{s.label}</td>
                  <td>{s.vel} pts</td>
                  <td style={{ fontWeight: 600, color: 'var(--primary-light)' }}>{s.sprints}</td>
                  <td>
                    {typeof s.sprints === 'number'
                      ? (horizonMode === 'time'
                        ? `≈ ${(s.sprints * (sprintDurationDays / 7)).toFixed(1)} weeks`
                        : `≈ ${((s.sprints * sprintDurationDays) / WORKING_DAYS_PER_MONTH).toFixed(1)} months`)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
