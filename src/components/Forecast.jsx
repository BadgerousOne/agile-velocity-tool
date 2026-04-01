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
import React, { useState } from 'react';
import { useVelocity } from '../context/VelocityContext';
import {
  calcWeightedVelocity, calcAverageVelocity,
  getLatestEffectiveFTEs, calcCapacityAdjustedVelocity,
} from '../utils/velocityCalc';
import {
  ResponsiveContainer, LineChart, BarChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend, Cell,
} from 'recharts';
import './Forecast.css';

// Working days per month (industry standard average)
const WORKING_DAYS_PER_MONTH = 21.7;

const TIME_PERIODS = [
  { months: 3,  label: '3 Months',  color: 'var(--secondary)'    },
  { months: 6,  label: '6 Months',  color: 'var(--primary-light)' },
  { months: 9,  label: '9 Months',  color: 'var(--warning)'      },
  { months: 12, label: '1 Year',    color: 'var(--success)'      },
];

/**
 * Calculate time-period forecast.
 * allocationFactor: 1.0 = 100% (ideal), 0.8 = 80% of team capacity, etc.
 */
function calcPeriodForecast(velocity, sprintDays, months, allocationFactor = 1.0) {
  const workingDays = months * WORKING_DAYS_PER_MONTH;
  const sprintCount = workingDays / sprintDays;
  const fullSprints = Math.floor(sprintCount);
  const partialFrac = sprintCount - fullSprints;
  // Scale velocity by allocation factor vs 100%
  const effectiveVel  = parseFloat((velocity * allocationFactor).toFixed(2));
  const totalPoints   = parseFloat((effectiveVel * sprintCount).toFixed(1));
  const fullPoints    = parseFloat((effectiveVel * fullSprints).toFixed(1));
  return {
    months,
    workingDays: Math.round(workingDays),
    sprintCount: parseFloat(sprintCount.toFixed(1)),
    fullSprints,
    partialFrac,
    totalPoints,
    fullPoints,
    effectiveVel,
  };
}

export default function Forecast() {
  const { state } = useVelocity();
  const { sprints, sprintDurationDays, supportImpactFactor } = state;

  const [backlog, setBacklog]         = useState(200);
  const [useWeighted, setUseWeighted] = useState(true);
  const [useActualAlloc, setUseActualAlloc] = useState(true);

  const avg      = calcAverageVelocity(sprints);
  const weighted = calcWeightedVelocity(sprints);
  const velocity = useWeighted ? weighted : avg;

  // Latest sprint's effective FTE ratio (e.g. 2.5 FTEs out of 3 members)
  const latestFTEs    = getLatestEffectiveFTEs(sprints);
  // Max possible FTEs if everyone were at 100%
  const memberCount   = state.teamMembers.length;
  // allocationFactor: ratio of current FTEs vs full team headcount
  const allocationFactor = (useActualAlloc && latestFTEs != null && memberCount > 0)
    ? latestFTEs / memberCount
    : 1.0;
  const allocationPct = Math.round(allocationFactor * 100);

  const sprintsNeeded = velocity > 0 ? Math.ceil(backlog / (velocity * allocationFactor)) : null;

  // ── Burndown projection ──────────────────────────────────────────────────
  const burndownData = [];
  if (velocity > 0 && sprintsNeeded) {
    const effectiveVel = velocity * allocationFactor;
    let remaining = backlog;
    burndownData.push({ sprint: 'Now', remaining, ideal: backlog });
    for (let i = 1; i <= sprintsNeeded; i++) {
      remaining = Math.max(0, remaining - effectiveVel);
      const ideal = Math.max(0, backlog - (backlog / sprintsNeeded) * i);
      burndownData.push({
        sprint: `S+${i}`,
        remaining: parseFloat(remaining.toFixed(1)),
        ideal: parseFloat(ideal.toFixed(1)),
      });
    }
  }

  // ── Scenario planning ────────────────────────────────────────────────────
  const scenarios = [
    { label: 'Optimistic (+20%)',  vel: parseFloat((velocity * allocationFactor * 1.2).toFixed(1)) },
    { label: 'Expected',           vel: parseFloat((velocity * allocationFactor).toFixed(1))        },
    { label: 'Pessimistic (-20%)', vel: parseFloat((velocity * allocationFactor * 0.8).toFixed(1)) },
  ].map(s => ({ ...s, sprints: s.vel > 0 ? Math.ceil(backlog / s.vel) : '—' }));

  // ── Time-period forecasts ─────────────────────────────────────────────────
  const periodForecasts = TIME_PERIODS.map(p => ({
    ...p,
    ...calcPeriodForecast(velocity, sprintDurationDays, p.months, allocationFactor),
  }));

  // Chart: cumulative points delivered month by month across 12 months
  const monthlyChartData = [];
  if (velocity > 0) {
    const sprintsPerMonth = WORKING_DAYS_PER_MONTH / sprintDurationDays;
    let cumulative = 0;
    for (let m = 1; m <= 12; m++) {
      cumulative += velocity * allocationFactor * sprintsPerMonth;
      const milestone = TIME_PERIODS.find(p => p.months === m);
      monthlyChartData.push({
        month: `Mo ${m}`,
        cumulative: parseFloat(cumulative.toFixed(1)),
        milestone: milestone ? milestone.label : null,
      });
    }
  }

  // Chart: points deliverable per period (bar chart)
  const periodBarData = periodForecasts.map(p => ({
    name: p.label,
    points: p.totalPoints,
    sprints: p.fullSprints,
    color: p.color,
  }));

  const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 };
  const tickStyle    = { fill: 'var(--text-secondary)', fontSize: 12 };

  return (
    <div className="forecast-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Forecast</h1>
          <p className="page-sub">Backlog delivery projections and time-horizon velocity forecasts</p>
        </div>
      </div>

      {/* Controls */}
      <div className="forecast-controls card">
        <div className="fc-control">
          <label>Remaining Backlog (story points)</label>
          <div className="fc-slider-row">
            <input type="range" min={10} max={1000} step={10} value={backlog} onChange={e => setBacklog(Number(e.target.value))} style={{ flex: 1 }} />
            <input type="number" min={1} value={backlog} onChange={e => setBacklog(Number(e.target.value))} className="fc-number-input" />
          </div>
        </div>
        <div className="fc-control">
          <label>Velocity Method</label>
          <div className="fc-toggle">
            <button className={`fc-toggle-btn ${useWeighted ? 'active' : ''}`}  onClick={() => setUseWeighted(true)}>Weighted (Recommended)</button>
            <button className={`fc-toggle-btn ${!useWeighted ? 'active' : ''}`} onClick={() => setUseWeighted(false)}>Simple Average</button>
          </div>
        </div>
        <div className="fc-control">
          <label>Team Allocation</label>
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
        </div>
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
          <div className="fr-value" style={{ color: 'var(--primary-light)' }}>{sprintsNeeded ?? '—'}</div>
          <div className="fr-sub">{sprintsNeeded ? `≈ ${(sprintsNeeded * (sprintDurationDays / 7)).toFixed(1)} weeks` : 'No data'}</div>
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

      {/* ── TIME-PERIOD FORECASTS ─────────────────────────────────────────── */}
      <div className="tp-section-header">
        <h2 className="section-title">📅 Time-Period Velocity Forecasts</h2>
        <p className="section-sub">
          {useActualAlloc && latestFTEs != null
            ? <>Using <strong>{latestFTEs} effective FTEs</strong> ({allocationPct}% allocation from latest sprint) · no PTO or support days modelled</>
            : <>Assumes <strong>100% team allocation</strong>, <strong>no PTO</strong>, and <strong>no support days</strong> — ideal capacity at current velocity.</>
          }
        </p>
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
              <div className="tp-sprints">{p.fullSprints} sprints ({p.sprintCount} total incl. partial)</div>
              <div className="tp-working-days">{p.workingDays} working days</div>

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
          <h2 className="chart-title">Story Points Deliverable by Time Period</h2>
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
          <h2 className="chart-title">Cumulative Points Delivered — Month by Month (12-Month View)</h2>
          <p className="chart-sub">
            Running total at {allocationPct}% allocation · no interruptions modelled
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: 'var(--text-primary)' }}
                itemStyle={{ color: 'var(--text-secondary)' }}
                formatter={val => [`${val} pts`, 'Cumulative']}
              />
              <ReferenceLine y={backlog} stroke="var(--warning)" strokeDasharray="5 5"
                label={{ value: `Backlog (${backlog} pts)`, fill: 'var(--warning)', fontSize: 11, position: 'insideTopRight' }} />
              {TIME_PERIODS.map(p => (
                <ReferenceLine key={p.months} x={`Mo ${p.months}`} stroke={p.color} strokeDasharray="4 4"
                  label={{ value: p.label, fill: p.color, fontSize: 10, position: 'top' }} />
              ))}
              <Line dataKey="cumulative" name="Cumulative Points" type="monotone"
                stroke="var(--primary-light)" strokeWidth={2} dot={{ r: 3, fill: 'var(--primary-light)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Period detail table */}
      <div className="card chart-section">
        <h2 className="chart-title">Time-Period Forecast Detail</h2>
        <p className="chart-sub">
          {allocationPct}% allocation · {sprintDurationDays}-day sprints · ~{WORKING_DAYS_PER_MONTH} working days/month
        </p>
        <div className="scenario-table-wrap">
          <table className="vel-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Working Days</th>
                <th>Total Sprints</th>
                <th>Full Sprints</th>
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
                  <tr key={p.months}>
                    <td style={{ fontWeight: 600, color: p.color }}>{p.label}</td>
                    <td>{p.workingDays}d</td>
                    <td>{p.sprintCount}</td>
                    <td>{p.fullSprints}</td>
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
              <tr><th>Scenario</th><th>Velocity</th><th>Sprints Needed</th><th>Approx. Weeks</th></tr>
            </thead>
            <tbody>
              {scenarios.map(s => (
                <tr key={s.label}>
                  <td>{s.label}</td>
                  <td>{s.vel} pts</td>
                  <td style={{ fontWeight: 600, color: 'var(--primary-light)' }}>{s.sprints}</td>
                  <td>{typeof s.sprints === 'number' ? `≈ ${(s.sprints * (sprintDurationDays / 7)).toFixed(1)} weeks` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
