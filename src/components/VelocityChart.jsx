/**
 * VelocityChart.jsx
 *
 * Deep-dive analytics page. Four charts + a sprint history table.
 *
 * Charts:
 *  1. Velocity Trend — Committed vs Completed bars, Rolling Avg, Adj. (Full Cap.) dashed line
 *  2. Capacity Utilization — % of allocation-adjusted capacity unaffected by interruptions,
 *     colour-coded green (≥90%) / yellow (≥70%) / red (<70%), with Adj. Velocity + Eff. FTEs overlay
 *  3. Sprint-over-Sprint Delta — velocity change between consecutive sprints
 *  4. Capacity Impact — PTO / Support / Other days per sprint vs completed points
 *
 * History Table columns:
 *  Sprint · Committed · Completed · % Done · Eff. FTEs · Utilization · Adj. Velocity
 *  · PTO · Support · Other · Rolling Avg
 */
import React, { useMemo } from 'react';
import { useVelocity } from '../context/VelocityContext';
import {
  calcAverageVelocity, calcWeightedVelocity, calcTrend,
  calcPredictability, buildChartData, sprintCapacityTotals,
  calcCapacityAdjustedVelocity, getLatestEffectiveFTEs,
} from '../utils/velocityCalc';
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ReferenceLine,
} from 'recharts';
import './VelocityChart.css';

export default function VelocityChart() {
  const { state } = useVelocity();
  const { sprints, sprintDurationDays, supportImpactFactor } = state;

  const chartData  = useMemo(
    () => buildChartData(sprints, sprintDurationDays, supportImpactFactor),
    [sprints, sprintDurationDays, supportImpactFactor]
  );
  const avg        = useMemo(() => calcAverageVelocity(sprints), [sprints]);
  const weighted   = useMemo(() => calcWeightedVelocity(sprints), [sprints]);
  const trend      = useMemo(() => calcTrend(sprints), [sprints]);
  const predict    = useMemo(() => calcPredictability(sprints), [sprints]);
  const adjVel     = useMemo(
    () => calcCapacityAdjustedVelocity(sprints, sprintDurationDays, supportImpactFactor),
    [sprints, sprintDurationDays, supportImpactFactor]
  );
  const latestFTEs = useMemo(() => getLatestEffectiveFTEs(sprints), [sprints]);

  // Sprint-over-sprint delta
  const deltaData = useMemo(() => sprints.map((s, i) => ({
    name: s.name,
    delta: i === 0 ? 0 : s.completedPoints - sprints[i - 1].completedPoints,
    completed: s.completedPoints,
  })), [sprints]);

  // Capacity impact data
  const capacityData = useMemo(() => sprints.map(s => {
    const t = sprintCapacityTotals(s);
    return {
      name: s.name,
      ptoDays:     t.ptoDays,
      supportDays: t.supportDays,
      otherDays:   t.otherDays,
      completed:   s.completedPoints,
    };
  }), [sprints]);

  // Capacity utilization data
  const utilizationData = useMemo(() => chartData.map(d => ({
    name:        d.name,
    utilization: d.utilization,
    effectiveFTEs: d.effectiveFTEs,
    completed:   d.completed,
    adjVelocity: d.adjVelocity,
  })), [chartData]);

  const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 };
  const labelStyle   = { color: 'var(--text-primary)' };
  const itemStyle    = { color: 'var(--text-secondary)' };
  const tickStyle    = { fill: 'var(--text-secondary)', fontSize: 12 };
  const legendStyle  = { color: 'var(--text-secondary)', fontSize: 12 };

  return (
    <div className="velocity-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Velocity Analytics</h1>
          <p className="page-sub">Historical performance, trends, and capacity impact analysis</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="vel-kpi-row">
        {[
          { label: 'Simple Average',   value: `${avg} pts`,     color: 'var(--primary-light)', desc: 'Avg across all sprints' },
          { label: 'Weighted Average', value: `${weighted} pts`,color: 'var(--secondary)',      desc: 'Recency-weighted' },
          { label: 'Adj. Velocity',    value: adjVel != null ? `${adjVel} pts` : '—', color: 'var(--success)', desc: 'Extrapolated at full capacity' },
          { label: 'Effective FTEs',   value: latestFTEs != null ? latestFTEs : '—', color: 'var(--primary-light)', desc: 'Latest sprint allocation' },
          { label: 'Predictability',   value: `${predict}%`,    color: 'var(--warning)',        desc: 'Commitment hit rate' },
          {
            label: 'Trend',
            value: trend === 'up' ? '↑ Improving' : trend === 'down' ? '↓ Declining' : '→ Stable',
            color: trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--warning)',
            desc: 'Last 3 sprints',
          },
        ].map(k => (
          <div key={k.label} className="vel-kpi card">
            <div className="vel-kpi-label">{k.label}</div>
            <div className="vel-kpi-value" style={{ color: k.color }}>{k.value}</div>
            <div className="vel-kpi-desc">{k.desc}</div>
          </div>
        ))}
      </div>

      {/* Velocity Trend Chart */}
      <div className="card chart-section">
        <h2 className="chart-title">Velocity Trend — Committed vs Completed</h2>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={tickStyle} />
            <YAxis tick={tickStyle} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
            <Legend wrapperStyle={legendStyle} />
            <Bar dataKey="committed"   name="Committed"         fill="rgba(79,70,229,0.35)" radius={[4,4,0,0]} />
            <Bar dataKey="completed"   name="Completed"         fill="var(--primary-light)" radius={[4,4,0,0]} />
            <Line dataKey="rollingAvg"  name="Rolling Avg"      type="monotone" stroke="var(--secondary)"  strokeWidth={2} dot={{ r: 4, fill: 'var(--secondary)' }} />
            <Line dataKey="adjVelocity" name="Adj. (Full Cap.)" type="monotone" stroke="var(--success)"    strokeWidth={2} strokeDasharray="5 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Capacity Utilization Chart */}
      <div className="card chart-section">
        <h2 className="chart-title">Capacity Utilization — Effective vs Full Allocation</h2>
        <p className="chart-sub">Percentage of allocation-adjusted capacity unaffected by PTO, support, or other days. Lower = more interruptions.</p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={utilizationData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={tickStyle} />
            <YAxis yAxisId="left"  domain={[0, 100]} tickFormatter={v => `${v}%`} tick={tickStyle} />
            <YAxis yAxisId="right" orientation="right" tick={tickStyle} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={labelStyle}
              itemStyle={itemStyle}
              formatter={(val, name) => {
                if (name === 'Utilization %') return [`${val}%`, name];
                if (name === 'Eff. FTEs')     return [val, name];
                if (name === 'Adj. Velocity') return [`${val} pts`, name];
                return [val, name];
              }}
            />
            <Legend wrapperStyle={legendStyle} />
            <ReferenceLine yAxisId="left" y={100} stroke="var(--success)" strokeDasharray="4 3"
              label={{ value: '100% (Full Cap.)', fill: 'var(--success)', fontSize: 10, position: 'insideTopRight' }} />
            <Bar  yAxisId="left"  dataKey="utilization"   name="Utilization %" radius={[4,4,0,0]}>
              {utilizationData.map((d, i) => (
                <Cell key={i} fill={
                  d.utilization == null      ? 'var(--border)' :
                  d.utilization >= 90        ? 'var(--success)' :
                  d.utilization >= 70        ? 'var(--warning)' :
                                               'var(--danger)'
                } />
              ))}
            </Bar>
            <Line yAxisId="right" dataKey="adjVelocity"  name="Adj. Velocity"  type="monotone" stroke="var(--secondary)"    strokeWidth={2} strokeDasharray="5 3" dot={false} />
            <Line yAxisId="right" dataKey="effectiveFTEs" name="Eff. FTEs"     type="monotone" stroke="var(--primary-light)" strokeWidth={2} dot={{ r: 3, fill: 'var(--primary-light)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Sprint-over-Sprint Delta */}
      <div className="card chart-section">
        <h2 className="chart-title">Sprint-over-Sprint Velocity Delta</h2>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={deltaData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={tickStyle} />
            <YAxis tick={tickStyle} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
            <Legend wrapperStyle={legendStyle} />
            <Bar dataKey="delta" name="Δ Points" radius={[4,4,0,0]} fill="var(--secondary)" />
            <Line dataKey="completed" name="Completed" type="monotone" stroke="var(--primary-light)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Capacity Impact */}
      <div className="card chart-section">
        <h2 className="chart-title">Capacity Impact — PTO, Support &amp; Other Days per Sprint</h2>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={capacityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={tickStyle} />
            <YAxis yAxisId="left"  tick={tickStyle} />
            <YAxis yAxisId="right" orientation="right" tick={tickStyle} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
            <Legend wrapperStyle={legendStyle} />
            <Bar yAxisId="left" dataKey="ptoDays"     name="PTO Days"     fill="var(--warning)"   radius={[4,4,0,0]} />
            <Bar yAxisId="left" dataKey="supportDays" name="Support Days" fill="var(--danger)"    radius={[4,4,0,0]} />
            <Bar yAxisId="left" dataKey="otherDays"   name="Other Days"   fill="var(--secondary)" radius={[4,4,0,0]} />
            <Line yAxisId="right" dataKey="completed" name="Completed pts" type="monotone" stroke="var(--success)" strokeWidth={2} dot={{ r: 4, fill: 'var(--success)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Sprint History Table */}
      <div className="card chart-section">
        <h2 className="chart-title">Sprint History Table</h2>
        <div className="vel-table-wrap">
          <table className="vel-table">
            <thead>
              <tr>
                <th>Sprint</th>
                <th>Committed</th>
                <th>Completed</th>
                <th>% Done</th>
                <th>Eff. FTEs</th>
                <th>Utilization</th>
                <th>Adj. Velocity</th>
                <th>🏖 PTO</th>
                <th>🛠 Support</th>
                <th>📌 Other</th>
                <th>Rolling Avg</th>
              </tr>
            </thead>
            <tbody>
              {sprints.map((s, i) => {
                const pct   = s.committedPoints > 0
                  ? Math.round((s.completedPoints / s.committedPoints) * 100)
                  : 0;
                const pctColor = pct >= 100 ? 'var(--success)' : pct >= 80 ? 'var(--warning)' : 'var(--danger)';
                const totals   = sprintCapacityTotals(s);
                const cd       = chartData[i];
                const utilColor = cd?.utilization == null ? 'var(--text-muted)'
                  : cd.utilization >= 90 ? 'var(--success)'
                  : cd.utilization >= 70 ? 'var(--warning)'
                  : 'var(--danger)';
                return (
                  <tr key={s.id || s.name}>
                    <td>{s.name}</td>
                    <td>{s.committedPoints}</td>
                    <td>{s.completedPoints}</td>
                    <td style={{ color: pctColor, fontWeight: 600 }}>{pct}%</td>
                    <td style={{ color: 'var(--primary-light)', fontWeight: 600 }}>
                      {totals.effectiveFTEs ?? '—'}
                    </td>
                    <td style={{ color: utilColor, fontWeight: 600 }}>
                      {cd?.utilization != null ? `${cd.utilization}%` : '—'}
                    </td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>
                      {cd?.adjVelocity != null ? `${cd.adjVelocity} pts` : '—'}
                    </td>
                    <td>{totals.ptoDays}</td>
                    <td>{totals.supportDays}</td>
                    <td>{totals.otherDays}</td>
                    <td>{cd?.rollingAvg ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
