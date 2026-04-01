/**
 * Dashboard.jsx
 *
 * Home screen. Displays at-a-glance KPI cards and a velocity overview chart.
 *
 * KPIs shown:
 *  - Avg Velocity, Weighted Velocity, Capacity-Adjusted Velocity
 *  - Predictability, Trend, Effective FTEs
 *  - Total PTO / Support / Other days across all sprints
 *
 * Chart: Committed vs Completed bars + Rolling Avg line + Adj. Velocity dashed line.
 * Latest sprint banner shows committed, completed, FTEs, PTO, support, other.
 */
import React from 'react';
import { useVelocity } from '../context/VelocityContext';
import {
  calcAverageVelocity, calcWeightedVelocity,
  calcTrend, calcPredictability, buildChartData,
  sprintCapacityTotals, calcCapacityAdjustedVelocity,
  getLatestEffectiveFTEs,
} from '../utils/velocityCalc';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import './Dashboard.css';

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card" style={{ borderTopColor: accent }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: accent }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const TREND_META = {
  up:      { icon: '↑', label: 'Improving',  color: 'var(--success)' },
  down:    { icon: '↓', label: 'Declining',  color: 'var(--danger)'  },
  neutral: { icon: '→', label: 'Stable',     color: 'var(--warning)' },
};

export default function Dashboard() {
  const { state } = useVelocity();
  const { sprints, teamMembers, sprintDurationDays, supportImpactFactor } = state;

  const avg        = calcAverageVelocity(sprints);
  const weighted   = calcWeightedVelocity(sprints);
  const trend      = calcTrend(sprints);
  const predict    = calcPredictability(sprints);
  const chartData  = buildChartData(sprints, sprintDurationDays, supportImpactFactor);
  const trendMeta  = TREND_META[trend];

  const adjVelocity   = calcCapacityAdjustedVelocity(sprints, sprintDurationDays, supportImpactFactor);
  const latestFTEs    = getLatestEffectiveFTEs(sprints);

  const lastSprint = sprints[sprints.length - 1];

  // Derive totals from per-member capacity (with legacy fallback)
  const allTotals = sprints.reduce((acc, s) => {
    const t = sprintCapacityTotals(s);
    return { ptoDays: acc.ptoDays + t.ptoDays, supportDays: acc.supportDays + t.supportDays, otherDays: acc.otherDays + t.otherDays };
  }, { ptoDays: 0, supportDays: 0, otherDays: 0 });

  const lastTotals = lastSprint ? sprintCapacityTotals(lastSprint) : { ptoDays: 0, supportDays: 0, otherDays: 0 };

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Real-time view of your team's agile performance</p>
        </div>
        <span className="badge badge-primary">{teamMembers.length} Active Members</span>
      </div>

      <div className="stat-grid">
        <StatCard label="Avg Velocity"          value={`${avg} pts`}                  sub="Simple average"             accent="var(--primary-light)" />
        <StatCard label="Weighted Velocity"     value={`${weighted} pts`}             sub="Recency-weighted"            accent="var(--secondary)"    />
        <StatCard label="Adj. Velocity"         value={adjVelocity != null ? `${adjVelocity} pts` : '—'} sub="At full capacity (extrapolated)" accent="var(--success)" />
        <StatCard label="Predictability"        value={`${predict}%`}                 sub="Commitment hit rate"         accent="var(--warning)"      />
        <StatCard label="Trend"                 value={`${trendMeta.icon} ${trendMeta.label}`} sub="Last 3 sprints"   accent={trendMeta.color}     />
        <StatCard label="Effective FTEs"        value={latestFTEs != null ? latestFTEs : (sprints.length ? teamMembers.length : '—')} sub="Latest sprint allocation"  accent="var(--primary-light)" />
        <StatCard label="Total PTO Days"        value={allTotals.ptoDays}             sub="Across all sprints"         accent="var(--warning)"      />
        <StatCard label="Total Support Days"    value={allTotals.supportDays}         sub="Across all sprints"         accent="var(--danger)"       />
        <StatCard label="Total Other Days"      value={allTotals.otherDays}           sub="Training, on-call, etc"     accent="var(--secondary)"    />
      </div>

      {lastSprint && (
        <div className="card last-sprint-banner">
          <span className="badge badge-success" style={{ marginBottom: 8 }}>Latest Sprint</span>
          <div className="last-sprint-row">
            <div>
              <div className="last-sprint-name">{lastSprint.name}</div>
              <div className="last-sprint-dates">{lastSprint.startDate} → {lastSprint.endDate}</div>
            </div>
            <div className="last-sprint-stats">
              <div><span className="ls-label">Committed</span><span className="ls-val">{lastSprint.committedPoints} pts</span></div>
              <div><span className="ls-label">Completed</span><span className="ls-val complete">{lastSprint.completedPoints} pts</span></div>
              {latestFTEs != null && (
                <div><span className="ls-label">Eff. FTEs</span><span className="ls-val">{latestFTEs}</span></div>
              )}
              <div><span className="ls-label">PTO</span><span className="ls-val">{lastTotals.ptoDays}d</span></div>
              <div><span className="ls-label">Support</span><span className="ls-val">{lastTotals.supportDays}d</span></div>
              {lastTotals.otherDays > 0 && (
                <div><span className="ls-label">Other</span><span className="ls-val">{lastTotals.otherDays}d</span></div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card chart-card">
        <h2 className="chart-title">Sprint Velocity Overview</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
              labelStyle={{ color: 'var(--text-primary)' }}
              itemStyle={{ color: 'var(--text-secondary)' }}
            />
            <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }} />
            <Bar dataKey="committed"   name="Committed"         fill="rgba(79,70,229,0.4)"  radius={[4,4,0,0]} />
            <Bar dataKey="completed"   name="Completed"         fill="var(--primary-light)" radius={[4,4,0,0]} />
            <Line dataKey="rollingAvg" name="Rolling Avg"       type="monotone" stroke="var(--secondary)" strokeWidth={2} dot={false} />
            <Line dataKey="adjVelocity" name="Adj. (Full Cap.)" type="monotone" stroke="var(--success)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
