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
import React, { useMemo } from 'react';
import { useVelocity } from '../context/VelocityContext';
import {
  calcAverageVelocity, calcWeightedVelocity,
  calcTrend, calcPredictability, buildChartData,
  sprintCapacityTotals, calcCapacityAdjustedVelocity,
  getLatestEffectiveFTEs,
  buildHealthSignals,
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
  const { sprints, teamMembers, sprintDurationDays, supportImpactFactor, releasePlans } = state;

  const avg = useMemo(() => calcAverageVelocity(sprints), [sprints]);
  const weighted = useMemo(() => calcWeightedVelocity(sprints), [sprints]);
  const trend = useMemo(() => calcTrend(sprints), [sprints]);
  const predict = useMemo(() => calcPredictability(sprints), [sprints]);
  const chartData = useMemo(
    () => buildChartData(sprints, sprintDurationDays, supportImpactFactor),
    [sprints, sprintDurationDays, supportImpactFactor]
  );
  const adjVelocity = useMemo(
    () => calcCapacityAdjustedVelocity(sprints, sprintDurationDays, supportImpactFactor),
    [sprints, sprintDurationDays, supportImpactFactor]
  );
  const latestFTEs = useMemo(() => getLatestEffectiveFTEs(sprints), [sprints]);
  const healthSignals = useMemo(
    () => buildHealthSignals(sprints, sprintDurationDays, supportImpactFactor),
    [sprints, sprintDurationDays, supportImpactFactor]
  );

  const trendMeta = TREND_META[trend];
  const lastSprint = sprints[sprints.length - 1];

  const allTotals = useMemo(() => sprints.reduce((acc, s) => {
    const t = sprintCapacityTotals(s);
    return {
      ptoDays: acc.ptoDays + t.ptoDays,
      supportDays: acc.supportDays + t.supportDays,
      otherDays: acc.otherDays + t.otherDays,
    };
  }, { ptoDays: 0, supportDays: 0, otherDays: 0 }), [sprints]);

  const lastTotals = lastSprint ? sprintCapacityTotals(lastSprint) : { ptoDays: 0, supportDays: 0, otherDays: 0 };

  const releaseGlance = useMemo(() => {
    const plans = Array.isArray(releasePlans) ? releasePlans : [];
    const today = new Date();
    return plans.map(plan => {
      const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
      const done = milestones.filter(m => m.status === 'done').length;
      const atRisk = milestones.filter(m => m.status === 'at_risk' || m.status === 'blocked').length;

      let daysUntil = null;
      let sprintsAvailable = null;
      if (plan.targetDate) {
        const target = new Date(plan.targetDate + 'T00:00:00');
        daysUntil = Math.round((target - today) / (1000 * 60 * 60 * 24));
        sprintsAvailable = parseFloat((daysUntil / sprintDurationDays).toFixed(1));
      }

      const sprintsNeeded = weighted > 0 ? Math.ceil((plan.backlogPoints || 0) / weighted) : null;
      const onTrack = sprintsAvailable != null && sprintsNeeded != null
        ? sprintsNeeded <= sprintsAvailable
        : null;

      return { ...plan, milestones, done, atRisk, daysUntil, sprintsAvailable, sprintsNeeded, onTrack };
    }).sort((a, b) => {
      if (!a.targetDate && !b.targetDate) return 0;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    });
  }, [releasePlans, weighted, sprintDurationDays]);

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Real-time view of your team&apos;s agile performance</p>
        </div>
        <span className="badge badge-primary">{teamMembers.length} Active Members</span>
      </div>

      <div className="stat-grid">
        <StatCard label="Avg Velocity" value={`${avg} pts`} sub="Simple average" accent="var(--primary-light)" />
        <StatCard label="Weighted Velocity" value={`${weighted} pts`} sub="Recency-weighted" accent="var(--secondary)" />
        <StatCard label="Adj. Velocity" value={adjVelocity != null ? `${adjVelocity} pts` : '—'} sub="At full capacity (extrapolated)" accent="var(--success)" />
        <StatCard label="Predictability" value={`${predict}%`} sub="Commitment hit rate" accent="var(--warning)" />
        <StatCard label="Trend" value={`${trendMeta.icon} ${trendMeta.label}`} sub="Last 3 sprints" accent={trendMeta.color} />
        <StatCard label="Effective FTEs" value={latestFTEs != null ? latestFTEs : (sprints.length ? teamMembers.length : '—')} sub="Latest sprint allocation" accent="var(--primary-light)" />
        <StatCard label="Total PTO Days" value={allTotals.ptoDays} sub="Across all sprints" accent="var(--warning)" />
        <StatCard label="Total Support Days" value={allTotals.supportDays} sub="Across all sprints" accent="var(--danger)" />
        <StatCard label="Total Other Days" value={allTotals.otherDays} sub="Training, on-call, etc" accent="var(--secondary)" />
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

      {healthSignals.length > 0 && (
        <div className="card last-sprint-banner">
          <span className="badge badge-primary" style={{ marginBottom: 8 }}>Health Signals</span>
          <div className="last-sprint-stats" style={{ gridTemplateColumns: '1fr' }}>
            {healthSignals.map((signal, i) => (
              <div key={i}>
                <span className="ls-label" style={{ color: signal.severity === 'high' ? 'var(--danger)' : signal.severity === 'medium' ? 'var(--warning)' : 'var(--text-secondary)' }}>
                  {signal.severity.toUpperCase()} · {signal.title}
                </span>
                <span className="ls-val">{signal.detail}</span>
              </div>
            ))}
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
            <Bar dataKey="committed" name="Committed" fill="rgba(79,70,229,0.4)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="completed" name="Completed" fill="var(--primary-light)" radius={[4, 4, 0, 0]} />
            <Line dataKey="rollingAvg" name="Rolling Avg" type="monotone" stroke="var(--secondary)" strokeWidth={2} dot={false} />
            <Line dataKey="adjVelocity" name="Adj. (Full Cap.)" type="monotone" stroke="var(--success)" strokeWidth={2} strokeDasharray="5 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {releaseGlance.length > 0 && (
        <div className="card last-sprint-banner">
          <span className="badge badge-primary" style={{ marginBottom: 8 }}>Releases</span>
          <div className="release-glance-grid">
            {releaseGlance.map(plan => (
              <div key={plan.id} className="release-glance-item">
                <div className="release-glance-name">{plan.name || 'Untitled Release'}</div>
                <div className="release-glance-meta">
                  {plan.targetDate ? (
                    <span className={`release-glance-date ${plan.daysUntil < 0 ? 'overdue' : plan.daysUntil < 30 ? 'urgent' : ''}`}>
                      {plan.daysUntil >= 0 ? `${plan.daysUntil}d away` : `${Math.abs(plan.daysUntil)}d overdue`}
                      <span className="release-glance-target">{plan.targetDate}</span>
                    </span>
                  ) : (
                    <span className="release-glance-no-date">No target date</span>
                  )}
                  {plan.onTrack === true && <span className="badge badge-success">On Track</span>}
                  {plan.onTrack === false && <span className="badge badge-danger">At Risk</span>}
                  {plan.atRisk > 0 && (
                    <span className="badge badge-warning">{plan.atRisk} milestone{plan.atRisk > 1 ? 's' : ''} blocked/at risk</span>
                  )}
                </div>
                <div className="release-glance-stats">
                  <span>{plan.backlogPoints || 0} pts backlog</span>
                  {plan.sprintsNeeded != null && <span>{plan.sprintsNeeded} sprints needed</span>}
                  {plan.sprintsAvailable != null && <span>{plan.sprintsAvailable} sprints available</span>}
                  <span>{plan.done}/{plan.milestones.length} milestones done</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
