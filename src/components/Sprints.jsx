/**
 * Sprints.jsx
 *
 * Core data entry page. Each sprint renders as an expandable card with two tabs:
 *
 * 📋 Sprint Details — name, dates, committed/completed points, retrospective notes
 *
 * 👥 Capacity Impact — per-member table with:
 *   - Allocation % slider (0–100%, step 5) — how much of this sprint the member is dedicated
 *   - PTO days, Support days, Other days (+ free-text label)
 *   - Avail. Days = (allocation% × sprintDays) − totalOff, colour coded green/yellow/red
 *   - Team totals footer + summary chips
 *
 * Sprint header shows capacity impact chips at a glance (no expand needed).
 *
 * Sub-components:
 *  - MemberCapacityTable — the per-member capacity table inside the Capacity Impact tab
 *  - SprintRow           — a single expandable sprint card
 */
import React, { useState } from 'react';
import { useVelocity } from '../context/VelocityContext';
import { aggregateCapacity, calcSprintEndDate } from '../context/VelocityContext';
import './Sprints.css';

// ── Per-member capacity table inside an expanded sprint ───────────────────────
function MemberCapacityTable({ sprint, onUpdateMember, sprintDurationDays }) {
  const rows   = sprint.memberCapacity || [];
  const totals = aggregateCapacity(rows);
  const totalEffectiveFTEs = rows.reduce((s, r) => s + (r.allocation ?? 100) / 100, 0).toFixed(2);

  return (
    <div className="mc-wrap">
      <div className="mc-title">👤 Per-Member Capacity Impact</div>
      <div className="mc-table-wrap">
        <table className="mc-table">
          <thead>
            <tr>
              <th>Team Member</th>
              <th>Allocation %</th>
              <th>PTO Days</th>
              <th>Holidays</th>
              <th>Support Days</th>
              <th>Other Days</th>
              <th>Other Label</th>
              <th>Avail. Days</th>
              <th>Total Off</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const alloc      = row.allocation ?? 100;
              const totalOff   = (row.ptoDays || 0) + (row.supportDays || 0) + (row.otherDays || 0);
              const rawDays    = (alloc / 100) * (sprintDurationDays || 14);
              const availDays  = Math.max(0, parseFloat((rawDays - totalOff).toFixed(1)));
              const availColor = availDays >= rawDays * 0.9 ? 'var(--success)'
                               : availDays >= rawDays * 0.6 ? 'var(--warning)'
                               : 'var(--danger)';
              const allocColor = alloc >= 80 ? 'var(--success)' : alloc >= 50 ? 'var(--warning)' : 'var(--danger)';
              const hdays      = row.holidayDays || 0;
              const hnames     = row.holidayNames || [];
              return (
                <tr key={row.memberId}>
                  <td className="mc-member-name">
                    <span className="mc-avatar">{row.memberName ? row.memberName[0].toUpperCase() : '?'}</span>
                    {row.memberName || <em>Unnamed</em>}
                  </td>

                  {/* ── Allocation slider ── */}
                  <td className="mc-alloc-cell">
                    <div className="mc-alloc-wrap">
                      <input
                        type="range"
                        min={0} max={100} step={5}
                        value={alloc}
                        className="mc-alloc-slider"
                        onChange={e => onUpdateMember(row.memberId, { allocation: Number(e.target.value) })}
                      />
                      <span className="mc-alloc-val" style={{ color: allocColor }}>{alloc}%</span>
                    </div>
                    {alloc < 50 && (
                      <div className="mc-alloc-warn">⚠ Ramping up</div>
                    )}
                  </td>

                  {/* ── PTO days (includes auto-holiday days) ── */}
                  <td>
                    <input
                      type="number" min={0} max={99}
                      className="mc-day-input pto"
                      value={row.ptoDays || 0}
                      onChange={e => onUpdateMember(row.memberId, { ptoDays: Number(e.target.value) })}
                    />
                  </td>

                  {/* ── Auto-filled holidays column ── */}
                  <td>
                    {hdays > 0
                      ? <span
                          className="mc-holiday-badge"
                          title={hnames.length ? hnames.join(', ') : `${hdays} holiday day(s)`}
                        >
                          🗓 {hdays}d
                        </span>
                      : <span className="mc-holiday-none">—</span>
                    }
                  </td>

                  <td>
                    <input
                      type="number" min={0} max={99}
                      className="mc-day-input support"
                      value={row.supportDays || 0}
                      onChange={e => onUpdateMember(row.memberId, { supportDays: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number" min={0} max={99}
                      className="mc-day-input other"
                      value={row.otherDays || 0}
                      onChange={e => onUpdateMember(row.memberId, { otherDays: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="mc-label-input"
                      placeholder="e.g. Training, On-call..."
                      value={row.otherLabel || ''}
                      onChange={e => onUpdateMember(row.memberId, { otherLabel: e.target.value })}
                    />
                  </td>
                  <td>
                    <span className="mc-avail-badge" style={{ color: availColor, borderColor: availColor }}>
                      {availDays}d
                    </span>
                  </td>
                  <td>
                    <span className={`mc-total-badge ${totalOff > 3 ? 'high' : totalOff > 0 ? 'mid' : 'zero'}`}>
                      {totalOff}d
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="mc-totals-row">
              <td className="mc-totals-label">Team Totals</td>
              <td><span className="mc-total-badge mid">{totalEffectiveFTEs} FTEs</span></td>
              <td><span className="mc-total-badge pto">{totals.ptoDays}d</span></td>
              <td>
                <span className="mc-total-badge mid">
                  🗓 {rows.reduce((s, r) => s + (r.holidayDays || 0), 0)}d
                </span>
              </td>
              <td><span className="mc-total-badge support">{totals.supportDays}d</span></td>
              <td><span className="mc-total-badge other">{totals.otherDays}d</span></td>
              <td></td>
              <td></td>
              <td><span className="mc-total-badge high">{totals.ptoDays + totals.supportDays + totals.otherDays}d</span></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary chips */}
      <div className="mc-summary">
        <span className="mc-chip" style={{ background: 'rgba(79,70,229,0.1)', color: 'var(--primary-light)', border: '1px solid rgba(79,70,229,0.3)' }}>
          👥 {totalEffectiveFTEs} effective FTEs this sprint
        </span>
        {totals.ptoDays > 0 && (
          <span className="mc-chip pto">🏖 {totals.ptoDays} PTO day{totals.ptoDays !== 1 ? 's' : ''}</span>
        )}
        {totals.supportDays > 0 && (
          <span className="mc-chip support">🛠 {totals.supportDays} Support day{totals.supportDays !== 1 ? 's' : ''}</span>
        )}
        {totals.otherDays > 0 && (
          <span className="mc-chip other">📌 {totals.otherDays} Other day{totals.otherDays !== 1 ? 's' : ''}</span>
        )}
        {(totals.ptoDays + totals.supportDays + totals.otherDays) === 0 && rows.every(r => (r.allocation ?? 100) === 100) && (
          <span className="mc-chip zero">✅ Full capacity — no interruptions</span>
        )}
      </div>
    </div>
  );
}

// ── Individual sprint row ─────────────────────────────────────────────────────
function SprintRow({ sprint, onUpdate, onUpdateMember, onRemove, onRecalcHolidays, sprintDurationDays }) {
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState('details');
  const [endOverride, setEndOverride] = useState(false); // true = user is editing end date manually

  const pct = sprint.committedPoints > 0
    ? Math.round((sprint.completedPoints / sprint.committedPoints) * 100)
    : 0;
  const statusColor = pct >= 100 ? 'var(--success)' : pct >= 80 ? 'var(--warning)' : 'var(--danger)';

  const totals     = aggregateCapacity(sprint.memberCapacity || []);
  const totalOff   = totals.ptoDays + totals.supportDays + totals.otherDays;
  const memberCount = (sprint.memberCapacity || []).length;

  return (
    <div className="sprint-card card">
      {/* ── Header (always visible) ── */}
      <div className="sprint-header" onClick={() => setOpen(o => !o)}>
        <div className="sprint-left">
          <span className="sprint-chevron">{open ? '▾' : '▸'}</span>
          <div>
            <div className="sprint-name">{sprint.name}</div>
            <div className="sprint-dates">{sprint.startDate} → {sprint.endDate}</div>
          </div>
        </div>
        <div className="sprint-right">
          {/* Capacity impact chips in header */}
          {totalOff > 0 && (
            <div className="sprint-impact-chips">
              {totals.ptoDays > 0     && <span className="sh-chip pto">🏖 {totals.ptoDays}d</span>}
              {totals.supportDays > 0 && <span className="sh-chip support">🛠 {totals.supportDays}d</span>}
              {totals.otherDays > 0   && <span className="sh-chip other">📌 {totals.otherDays}d</span>}
            </div>
          )}
          <div className="sprint-progress-wrap">
            <div className="sprint-progress-track">
              <div className="sprint-progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: statusColor }} />
            </div>
            <span className="sprint-pct" style={{ color: statusColor }}>{pct}%</span>
          </div>
          <div className="sprint-pts">{sprint.completedPoints}/{sprint.committedPoints} pts</div>
          <button className="btn btn-danger sprint-del" onClick={e => { e.stopPropagation(); onRemove(); }}>🗑</button>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div className="sprint-body">
          {/* Tab switcher */}
          <div className="sprint-tabs">
            <button className={`sprint-tab ${tab === 'details' ? 'active' : ''}`} onClick={() => setTab('details')}>
              📋 Sprint Details
            </button>
            <button className={`sprint-tab ${tab === 'capacity' ? 'active' : ''}`} onClick={() => setTab('capacity')}>
              👥 Capacity Impact
              {totalOff > 0 && <span className="sprint-tab-badge">{totalOff}d off</span>}
            </button>
          </div>

          {tab === 'details' && (
            <>
              <div className="sprint-fields">
                <label>Sprint Name
                  <input value={sprint.name} onChange={e => onUpdate({ name: e.target.value })} />
                </label>

                {/* ── Start Date — recalculates end date on change ── */}
                <label>Start Date
                  <input type="date" value={sprint.startDate} onChange={e => {
                    const newStart = e.target.value;
                    const newEnd   = calcSprintEndDate(newStart, sprintDurationDays);
                    onUpdate({ startDate: newStart, endDate: newEnd });
                    setEndOverride(false);
                    onRecalcHolidays();
                  }} />
                </label>

                {/* ── End Date — auto-calculated, with manual override ── */}
                <label>
                  <span className="end-date-label-row">
                    End Date
                    {!endOverride
                      ? <button className="end-date-override-btn" onClick={() => setEndOverride(true)}>✏️ Override</button>
                      : <button className="end-date-override-btn reset" onClick={() => {
                          const recalc = calcSprintEndDate(sprint.startDate, sprintDurationDays);
                          onUpdate({ endDate: recalc });
                          setEndOverride(false);
                          onRecalcHolidays();
                        }}>↩ Reset</button>
                    }
                  </span>
                  {endOverride ? (
                    <input type="date" value={sprint.endDate} onChange={e => {
                      onUpdate({ endDate: e.target.value });
                      onRecalcHolidays();
                    }} />
                  ) : (
                    <div className="end-date-display">
                      <span className="end-date-value">{sprint.endDate || '—'}</span>
                      <span className="end-date-auto-badge">⚙ Auto</span>
                    </div>
                  )}
                </label>

                {/* ── Committed Points ── */}
                <label>Committed Points
                  {(() => {
                    const suggested    = sprint.suggestedCommittedPoints;
                    const isOverridden = suggested != null && sprint.committedPoints !== suggested;
                    return (
                      <div className="committed-wrap">
                        <input
                          type="number" min={0}
                          value={sprint.committedPoints}
                          className={isOverridden ? 'overridden' : ''}
                          onChange={e => onUpdate({ committedPoints: Number(e.target.value) })}
                        />
                        {suggested != null && (
                          <div className="committed-hint">
                            {isOverridden ? (
                              <>
                                <span className="committed-hint-override">✎ Overridden</span>
                                <button
                                  className="committed-reset-btn"
                                  title={`Reset to velocity-based suggestion (${suggested} pts)`}
                                  onClick={() => onUpdate({ committedPoints: suggested })}
                                >
                                  ↩ Reset to {suggested}
                                </button>
                              </>
                            ) : (
                              <span className="committed-hint-auto">
                                ✦ Based on weighted velocity ({suggested} pts)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </label>

                <label>Completed Points
                  <input type="number" min={0} value={sprint.completedPoints} onChange={e => onUpdate({ completedPoints: Number(e.target.value) })} />
                </label>
              </div>
              <label className="notes-label">Sprint Notes
                <textarea
                  className="sprint-notes"
                  value={sprint.notes}
                  rows={3}
                  placeholder="Retrospective notes, blockers, highlights..."
                  onChange={e => onUpdate({ notes: e.target.value })}
                />
              </label>
            </>
          )}

          {tab === 'capacity' && (
            <MemberCapacityTable
              sprint={sprint}
              onUpdateMember={onUpdateMember}
              sprintDurationDays={sprintDurationDays}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Sprints() {
  const { state, dispatch } = useVelocity();

  // Aggregate totals across all sprints for the summary bar
  const allTotals = state.sprints.reduce((acc, s) => {
    const t = aggregateCapacity(s.memberCapacity || []);
    return { ptoDays: acc.ptoDays + t.ptoDays, supportDays: acc.supportDays + t.supportDays, otherDays: acc.otherDays + t.otherDays };
  }, { ptoDays: 0, supportDays: 0, otherDays: 0 });

  return (
    <div className="sprints-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sprints</h1>
          <p className="page-sub">Track points and per-member PTO, support, and other initiative days each sprint</p>
        </div>
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'ADD_SPRINT' })}>
          + New Sprint
        </button>
      </div>

      {/* All-sprint summary */}
      {state.sprints.length > 0 && (
        <div className="card sprint-summary-bar">
          <div className="ssb-item">
            <div className="ssb-label">Sprints Tracked</div>
            <div className="ssb-value">{state.sprints.length}</div>
          </div>
          <div className="ssb-item">
            <div className="ssb-label">Total PTO Days</div>
            <div className="ssb-value pto">{allTotals.ptoDays}</div>
          </div>
          <div className="ssb-item">
            <div className="ssb-label">Total Support Days</div>
            <div className="ssb-value support">{allTotals.supportDays}</div>
          </div>
          <div className="ssb-item">
            <div className="ssb-label">Total Other Days</div>
            <div className="ssb-value other">{allTotals.otherDays}</div>
          </div>
          <div className="ssb-item">
            <div className="ssb-label">Total Impact Days</div>
            <div className="ssb-value high">{allTotals.ptoDays + allTotals.supportDays + allTotals.otherDays}</div>
          </div>
        </div>
      )}

      <div className="sprint-list">
        {state.sprints.map(sprint => (
          <SprintRow
            key={sprint.id}
            sprint={sprint}
            sprintDurationDays={state.sprintDurationDays}
            onUpdate={data => dispatch({ type: 'UPDATE_SPRINT', id: sprint.id, data })}
            onUpdateMember={(memberId, data) => dispatch({
              type: 'UPDATE_SPRINT_MEMBER_CAPACITY',
              sprintId: sprint.id,
              memberId,
              data,
            })}
            onRecalcHolidays={() => dispatch({ type: 'RECALC_SPRINT_HOLIDAYS', sprintId: sprint.id })}
            onRemove={() => dispatch({ type: 'REMOVE_SPRINT', id: sprint.id })}
          />
        ))}
        {state.sprints.length === 0 && (
          <div className="empty-state card">
            <div className="empty-icon">🏃</div>
            <div className="empty-title">No sprints yet</div>
            <div className="empty-sub">Click "New Sprint" to add your first sprint</div>
          </div>
        )}
      </div>
    </div>
  );
}
