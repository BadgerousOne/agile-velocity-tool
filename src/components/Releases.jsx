import React, { useMemo, useState } from 'react';
import { useVelocity } from '../context/VelocityContext';
import { calcWeightedVelocity, runMonteCarloForecast } from '../utils/velocityCalc';
import './Releases.css';

const milestoneStatuses = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'on_track', label: 'On Track' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

export default function Releases() {
  const { state, dispatch } = useVelocity();
  const velocity = useMemo(() => calcWeightedVelocity(state.sprints), [state.sprints]);
  const [editingMilestonesByKey, setEditingMilestonesByKey] = useState({});
  const [draftMilestonesByKey, setDraftMilestonesByKey] = useState({});
  const [newMilestoneDraftByRelease, setNewMilestoneDraftByRelease] = useState({});
  const [openDependencyKey, setOpenDependencyKey] = useState(null);
  const [dependencyQueries, setDependencyQueries] = useState({});

  const createMilestoneDraft = (overrides = {}) => ({
    id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    targetDate: '',
    gate: '',
    status: 'not_started',
    notes: '',
    dependsOnMilestoneIds: [],
    ...overrides,
  });

  const getMilestoneKey = (releaseId, milestoneId) => `${releaseId}:${milestoneId}`;

  return (
    <div className="forecast-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Release Planning</h1>
          <p className="page-sub">Plan epics/milestones with deterministic and confidence-based delivery windows</p>
        </div>
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'ADD_RELEASE' })}>+ Add Release</button>
      </div>

      <div className="release-plan-list">
        {(state.releasePlans || []).map(plan => {
          const deterministic = velocity > 0 ? Math.ceil((plan.backlogPoints || 0) / velocity) : null;
          const mc = runMonteCarloForecast({
            backlogPoints: Number(plan.backlogPoints || 0),
            sprints: state.sprints,
          });
          const milestones = Array.isArray(plan.milestones) ? plan.milestones : [];
          const completedMilestones = milestones.filter(ms => ms.status === 'done').length;
          const newDraft = newMilestoneDraftByRelease[plan.id] || null;

          return (
            <div key={plan.id} className="card chart-section release-plan-card">
              <div className="release-plan-head">
                <h2 className="chart-title">{plan.name || 'Untitled Release'}</h2>
                <button className="btn btn-danger" onClick={() => dispatch({ type: 'REMOVE_RELEASE', id: plan.id })}>
                  Remove Release
                </button>
              </div>

              <div className="release-plan-grid">
                <label>
                  <span>Release</span>
                  <input value={plan.name || ''} onChange={e => dispatch({ type: 'UPDATE_RELEASE', id: plan.id, data: { name: e.target.value } })} />
                </label>
                <label>
                  <span>Backlog (pts)</span>
                  <input type="number" min={0} value={plan.backlogPoints || 0} onChange={e => dispatch({ type: 'UPDATE_RELEASE', id: plan.id, data: { backlogPoints: Number(e.target.value) } })} />
                </label>
                <label>
                  <span>Release Target Date</span>
                  <input type="date" value={plan.targetDate || ''} onChange={e => dispatch({ type: 'UPDATE_RELEASE', id: plan.id, data: { targetDate: e.target.value } })} />
                </label>
              </div>

              <div className="release-plan-metrics">
                <span className="badge badge-primary" title="Deterministic estimate: backlog ÷ weighted velocity">
                  Expected: {deterministic ?? '—'} sprints
                </span>
                <span className="badge" style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--secondary)', border: '1px solid rgba(6,182,212,0.3)' }} title="Monte Carlo P50: 50% of simulations complete within this many sprints">
                  P50: {mc.p50 ?? '—'} sprints
                </span>
                <span className="badge badge-warning" title="Monte Carlo P80: 80% of simulations complete within this many sprints — recommended planning guardrail">
                  P80: {mc.p80 ?? '—'} sprints
                </span>
                <span className="badge badge-danger" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }} title="Monte Carlo P90: 90% of simulations complete within this many sprints — conservative estimate">
                  P90: {mc.p90 ?? '—'} sprints
                </span>
                <span className="badge badge-success">Milestones: {completedMilestones}/{milestones.length} done</span>
              </div>

              <label className="release-notes-field">
                <span>Release Notes</span>
                <input value={plan.notes || ''} placeholder="Dependencies, risks, rollout context..." onChange={e => dispatch({ type: 'UPDATE_RELEASE', id: plan.id, data: { notes: e.target.value } })} />
              </label>

              <div className="release-milestones-head">
                <div>
                  <h3 className="chart-title">Milestones</h3>
                  <p className="chart-sub">Track production dates and check gates for this release stack.</p>
                </div>
                <div className="release-milestones-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      if (newDraft) return;
                      setNewMilestoneDraftByRelease(curr => ({
                        ...curr,
                        [plan.id]: createMilestoneDraft(),
                      }));
                    }}
                    disabled={!!newDraft}
                  >
                    + Add Milestone
                  </button>
                </div>
              </div>

              {milestones.length === 0 && !newDraft ? (
                <div className="chart-sub">No milestones yet. Add one to track release checkpoints.</div>
              ) : (
                <div className="scenario-table-wrap">
                  <table className="vel-table">
                    <thead>
                      <tr>
                        <th>Milestone</th>
                        <th>Check Gate</th>
                        <th>Depends On</th>
                        <th>Target Date</th>
                        <th>Status</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map(ms => {
                        const rowKey = getMilestoneKey(plan.id, ms.id);
                        const isEditingMilestone = !!editingMilestonesByKey[rowKey];
                        const draft = draftMilestonesByKey[rowKey] || ms;
                        return (
                        <tr key={ms.id}>
                          <td>
                            {isEditingMilestone ? (
                              <input
                                value={draft.name || ''}
                                placeholder="e.g. Production"
                                onChange={e => setDraftMilestonesByKey(curr => ({
                                  ...curr,
                                  [rowKey]: { ...draft, name: e.target.value },
                                }))}
                              />
                            ) : (
                              <span>{ms.name || '—'}</span>
                            )}
                          </td>
                          <td>
                            {isEditingMilestone ? (
                              <input
                                value={draft.gate || ''}
                                placeholder="e.g. Security sign-off"
                                onChange={e => setDraftMilestonesByKey(curr => ({
                                  ...curr,
                                  [rowKey]: { ...draft, gate: e.target.value },
                                }))}
                              />
                            ) : (
                              <span>{ms.gate || '—'}</span>
                            )}
                          </td>
                          <td>
                            {isEditingMilestone ? (
                              (() => {
                                const key = rowKey;
                                const query = dependencyQueries[key] || '';
                                const candidates = milestones.filter(other => other.id !== ms.id);
                                const filtered = candidates.filter(other =>
                                  (other.name || 'Untitled milestone').toLowerCase().includes(query.toLowerCase())
                                );
                                const selectedIds = draft.dependsOnMilestoneIds || [];

                                return (
                                  <div className="release-dependency-combobox">
                                    <button
                                      type="button"
                                      className="release-dependency-trigger"
                                      aria-label={`Dependencies for ${ms.name || 'milestone'}`}
                                      aria-expanded={openDependencyKey === key}
                                      onClick={() => setOpenDependencyKey(curr => curr === key ? null : key)}
                                    >
                                      {selectedIds.length > 0
                                        ? `${selectedIds.length} selected`
                                        : 'Select dependencies'}
                                    </button>

                                    {selectedIds.length > 0 && (
                                      <div className="release-dependency-token-row">
                                        {selectedIds.map(depId => {
                                          const dep = milestones.find(m => m.id === depId);
                                          if (!dep) return null;
                                          return (
                                            <button
                                              key={depId}
                                              type="button"
                                              className="release-dependency-token"
                                              onClick={() => {
                                                setDraftMilestonesByKey(curr => ({
                                                  ...curr,
                                                  [rowKey]: {
                                                    ...draft,
                                                    dependsOnMilestoneIds: selectedIds.filter(id => id !== depId),
                                                  },
                                                }));
                                              }}
                                            >
                                              {dep.name || 'Untitled milestone'} ×
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {openDependencyKey === key && (
                                      <div className="release-dependency-popover">
                                        <input
                                          className="release-dependency-search"
                                          placeholder="Search milestones"
                                          value={query}
                                          onChange={e => setDependencyQueries(curr => ({ ...curr, [key]: e.target.value }))}
                                          aria-label={`Search dependencies for ${ms.name || 'milestone'}`}
                                        />
                                        <div className="release-dependency-options">
                                          {filtered.length === 0 && (
                                            <div className="release-dependency-empty">No milestones match.</div>
                                          )}
                                          {filtered.map(other => {
                                            const selected = selectedIds.includes(other.id);
                                            return (
                                              <button
                                                key={other.id}
                                                type="button"
                                                className={`release-dependency-option ${selected ? 'selected' : ''}`}
                                                onClick={() => {
                                                  const next = selected
                                                    ? selectedIds.filter(id => id !== other.id)
                                                    : [...selectedIds, other.id];
                                                  setDraftMilestonesByKey(curr => ({
                                                    ...curr,
                                                    [rowKey]: {
                                                      ...draft,
                                                      dependsOnMilestoneIds: next,
                                                    },
                                                  }));
                                                }}
                                              >
                                                <span className="release-dependency-option-check">{selected ? '✓' : ''}</span>
                                                <span>{other.name || 'Untitled milestone'}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              <span>
                                {(ms.dependsOnMilestoneIds || []).length > 0
                                  ? milestones
                                    .filter(other => (ms.dependsOnMilestoneIds || []).includes(other.id))
                                    .map(other => other.name || 'Untitled milestone')
                                    .join(', ')
                                  : '—'}
                              </span>
                            )}
                          </td>
                          <td>
                            {isEditingMilestone ? (
                              <input
                                type="date"
                                value={draft.targetDate || ''}
                                onChange={e => setDraftMilestonesByKey(curr => ({
                                  ...curr,
                                  [rowKey]: { ...draft, targetDate: e.target.value },
                                }))}
                              />
                            ) : (
                              <span>{ms.targetDate || '—'}</span>
                            )}
                          </td>
                          <td>
                            {isEditingMilestone ? (
                              <select
                                className="settings-select"
                                value={draft.status || 'not_started'}
                                onChange={e => setDraftMilestonesByKey(curr => ({
                                  ...curr,
                                  [rowKey]: { ...draft, status: e.target.value },
                                }))}
                              >
                                {milestoneStatuses.map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            ) : (
                              <span>{milestoneStatuses.find(s => s.value === ms.status)?.label || 'Not Started'}</span>
                            )}
                          </td>
                          <td>
                            {isEditingMilestone ? (
                              <input
                                value={draft.notes || ''}
                                placeholder="Owner, blockers, evidence..."
                                onChange={e => setDraftMilestonesByKey(curr => ({
                                  ...curr,
                                  [rowKey]: { ...draft, notes: e.target.value },
                                }))}
                              />
                            ) : (
                              <span>{ms.notes || '—'}</span>
                            )}
                          </td>
                          <td>
                            {isEditingMilestone ? (
                              <div className="release-milestone-actions-row">
                                <button
                                  className="btn btn-success"
                                  aria-label={`Save ${ms.name || 'milestone'}`}
                                  onClick={() => {
                                    dispatch({
                                      type: 'UPDATE_RELEASE_MILESTONE',
                                      releaseId: plan.id,
                                      milestoneId: ms.id,
                                      data: draft,
                                    });
                                    setEditingMilestonesByKey(curr => {
                                      const next = { ...curr };
                                      delete next[rowKey];
                                      return next;
                                    });
                                    setDraftMilestonesByKey(curr => {
                                      const next = { ...curr };
                                      delete next[rowKey];
                                      return next;
                                    });
                                    setOpenDependencyKey(curr => (curr === rowKey ? null : curr));
                                  }}
                                >
                                  ✓
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    setEditingMilestonesByKey(curr => {
                                      const next = { ...curr };
                                      delete next[rowKey];
                                      return next;
                                    });
                                    setDraftMilestonesByKey(curr => {
                                      const next = { ...curr };
                                      delete next[rowKey];
                                      return next;
                                    });
                                    setOpenDependencyKey(curr => (curr === rowKey ? null : curr));
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="release-milestone-actions-row">
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    setEditingMilestonesByKey(curr => ({ ...curr, [rowKey]: true }));
                                    setDraftMilestonesByKey(curr => ({ ...curr, [rowKey]: createMilestoneDraft(ms) }));
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-danger"
                                  onClick={() => dispatch({
                                    type: 'REMOVE_RELEASE_MILESTONE',
                                    releaseId: plan.id,
                                    milestoneId: ms.id,
                                  })}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )})}
                      {newDraft && (
                        <tr>
                          <td>
                            <input
                              value={newDraft.name || ''}
                              placeholder="e.g. Production"
                              onChange={e => setNewMilestoneDraftByRelease(curr => ({
                                ...curr,
                                [plan.id]: { ...newDraft, name: e.target.value },
                              }))}
                            />
                          </td>
                          <td>
                            <input
                              value={newDraft.gate || ''}
                              placeholder="e.g. Security sign-off"
                              onChange={e => setNewMilestoneDraftByRelease(curr => ({
                                ...curr,
                                [plan.id]: { ...newDraft, gate: e.target.value },
                              }))}
                            />
                          </td>
                          <td>
                            <span className="release-dependency-empty">Save milestone to add dependencies</span>
                          </td>
                          <td>
                            <input
                              type="date"
                              value={newDraft.targetDate || ''}
                              onChange={e => setNewMilestoneDraftByRelease(curr => ({
                                ...curr,
                                [plan.id]: { ...newDraft, targetDate: e.target.value },
                              }))}
                            />
                          </td>
                          <td>
                            <select
                              className="settings-select"
                              value={newDraft.status || 'not_started'}
                              onChange={e => setNewMilestoneDraftByRelease(curr => ({
                                ...curr,
                                [plan.id]: { ...newDraft, status: e.target.value },
                              }))}
                            >
                              {milestoneStatuses.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={newDraft.notes || ''}
                              placeholder="Owner, blockers, evidence..."
                              onChange={e => setNewMilestoneDraftByRelease(curr => ({
                                ...curr,
                                [plan.id]: { ...newDraft, notes: e.target.value },
                              }))}
                            />
                          </td>
                          <td>
                            <div className="release-milestone-actions-row">
                              <button
                                className="btn btn-success"
                                aria-label="Save new milestone"
                                onClick={() => {
                                  dispatch({
                                    type: 'UPDATE_RELEASE',
                                    id: plan.id,
                                    data: { milestones: [...milestones, newDraft] },
                                  });
                                  setNewMilestoneDraftByRelease(curr => {
                                    const next = { ...curr };
                                    delete next[plan.id];
                                    return next;
                                  });
                                }}
                              >
                                ✓
                              </button>
                              <button
                                className="btn btn-secondary"
                                onClick={() => {
                                  setNewMilestoneDraftByRelease(curr => {
                                    const next = { ...curr };
                                    delete next[plan.id];
                                    return next;
                                  });
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {(state.releasePlans || []).length === 0 && (
          <div className="card chart-section">
            <p className="chart-sub">No release plans yet. Add one to start release forecasting and milestone tracking.</p>
          </div>
        )}
      </div>
    </div>
  );
}

