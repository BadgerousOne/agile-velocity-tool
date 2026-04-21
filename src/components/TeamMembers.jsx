/**
 * TeamMembers.jsx
 *
 * Team roster management page.
 *
 * - Add / remove team members
 * - Set name and role (Developer, QA Engineer, Designer, etc.)
 * - Allocation % is read-only here — it is set per-sprint in the Sprints tab
 * - Shows current allocation pill derived from the latest sprint's memberCapacity rows
 * - Allocation history sparkline: per-sprint bar chart per member showing ramp-up over time
 *   (green ≥80%, yellow ≥50%, red <50%)
 *
 * Important: adding a new member does NOT modify existing sprints.
 * The member will appear in the next sprint created via ADD_SPRINT.
 */
import React, { useState } from 'react';
import { useVelocity } from '../context/VelocityContext';
import './TeamMembers.css';

const ROLES = ['Developer', 'QA Engineer', 'Designer', 'Scrum Master', 'Product Owner', 'DevOps', 'Tech Lead'];

export default function TeamMembers() {
  const { state, dispatch } = useVelocity();
  const [editing, setEditing] = useState(null);

  const handleChange = (id, field, value) => {
    dispatch({ type: 'UPDATE_MEMBER', id, data: { [field]: value } });
  };

  const regions    = state.regions || [];
  const lastSprint = state.sprints[state.sprints.length - 1];
  const latestAllocMap = {};
  (lastSprint?.memberCapacity || []).forEach(r => {
    latestAllocMap[r.memberId] = r.allocation ?? 100;
  });

  const effectiveFTEs = Object.values(latestAllocMap).reduce((s, a) => s + a / 100, 0).toFixed(2);

  return (
    <div className="team-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Members</h1>
          <p className="page-sub">Manage your team roster — set per-sprint allocation in the Sprints tab to track ramp-up over time</p>
        </div>
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'ADD_MEMBER' })}>
          + Add Member
        </button>
      </div>

      <div className="team-summary card">
        <div className="team-summary-item">
          <div className="ts-label">Team Size</div>
          <div className="ts-value">{state.teamMembers.length}</div>
        </div>
        <div className="team-summary-item">
          <div className="ts-label">Effective FTEs</div>
          <div className="ts-value">{effectiveFTEs}</div>
          <div className="ts-sub">Based on latest sprint</div>
        </div>
        <div className="team-summary-item">
          <div className="ts-label">Sprints Tracked</div>
          <div className="ts-value">{state.sprints.length}</div>
        </div>
        <div className="team-summary-item">
          <div className="ts-label">Regions</div>
          <div className="ts-value">{regions.length}</div>
        </div>
      </div>

      {/* Ramp-up info banner */}
      <div className="ramp-info card">
        <div className="ramp-info-icon">📈</div>
        <div>
          <div className="ramp-info-title">Per-Sprint Allocation &amp; Holiday Auto-Fill</div>
          <div className="ramp-info-body">
            Allocation is set <strong>per sprint</strong> in the <strong>Sprints → Capacity Impact</strong> tab.
            Each member&apos;s <strong>Region</strong> determines which public holidays are automatically applied
            as PTO days when a new sprint is created. Manage regions and holidays in <strong>Settings</strong>.
          </div>
        </div>
      </div>

      <div className="member-list">
        {state.teamMembers.map((member) => {
          const currentAlloc = latestAllocMap[member.id] ?? 100;
          const allocColor   = currentAlloc >= 80 ? 'var(--success)' : currentAlloc >= 50 ? 'var(--warning)' : 'var(--danger)';
          const region       = regions.find(r => r.id === member.regionId);

          return (
            <div key={member.id} className={`member-card card ${editing === member.id ? 'editing' : ''}`}>
              <div className="member-header">
                <div className="member-avatar">{member.name ? member.name[0].toUpperCase() : '?'}</div>
                <div className="member-info">
                  {editing === member.id ? (
                    <input
                      className="member-name-input"
                      value={member.name}
                      placeholder="Full name"
                      onChange={e => handleChange(member.id, 'name', e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <div className="member-name">{member.name || <em style={{ color: 'var(--text-muted)' }}>Unnamed</em>}</div>
                  )}

                  <div className="member-meta-row">
                    {editing === member.id ? (
                      <select className="member-role-select" value={member.role}
                        onChange={e => handleChange(member.id, 'role', e.target.value)}>
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    ) : (
                      <span className="badge badge-primary">{member.role}</span>
                    )}

                    {/* Region selector */}
                    {editing === member.id ? (
                      <select
                        className="member-region-select"
                        value={member.regionId || ''}
                        onChange={e => handleChange(member.id, 'regionId', e.target.value || null)}
                      >
                        <option value="">— No Region —</option>
                        {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    ) : (
                      region
                        ? <span className="member-region-badge">🌍 {region.name}</span>
                        : <span className="member-region-badge none">🌍 No region</span>
                    )}
                  </div>
                </div>

                <div className="member-alloc-pill" style={{ color: allocColor, borderColor: allocColor }}>
                  {currentAlloc}% this sprint
                </div>

                <div className="member-actions">
                  <button className="btn btn-secondary"
                    onClick={() => setEditing(editing === member.id ? null : member.id)}>
                    {editing === member.id ? '✓ Done' : '✏️ Edit'}
                  </button>
                  <button className="btn btn-danger"
                    onClick={() => dispatch({ type: 'REMOVE_MEMBER', id: member.id })}>
                    🗑
                  </button>
                </div>
              </div>

              {/* Sprint allocation history sparkline */}
              {state.sprints.length > 0 && (
                <div className="member-alloc-history">
                  <div className="mah-label">Allocation history</div>
                  <div className="mah-bars">
                    {state.sprints.map(s => {
                      const row = (s.memberCapacity || []).find(r => r.memberId === member.id);
                      const notOnTeam = !row; // member was added after this sprint was created
                      const alloc = row?.allocation ?? 100;
                      const color = alloc >= 80 ? 'var(--success)' : alloc >= 50 ? 'var(--warning)' : 'var(--danger)';
                      const hdays = row?.holidayDays || 0;
                      return (
                        <div
                          key={s.id}
                          className={`mah-bar-wrap${notOnTeam ? ' mah-bar-absent' : ''}`}
                          title={notOnTeam
                            ? `${s.name}: not on team yet`
                            : `${s.name}: ${alloc}%${hdays ? ` · ${hdays} holiday day${hdays !== 1 ? 's' : ''}` : ''}`
                          }
                        >
                          {!notOnTeam && hdays > 0 && <div className="mah-holiday-dot" title={row?.holidayNames?.join(', ')}>🗓</div>}
                          <div className="mah-bar-track">
                            {notOnTeam
                              ? <div className="mah-bar-absent-line" />
                              : <div className="mah-bar-fill" style={{ height: `${alloc}%`, background: color }} />
                            }
                          </div>
                          <div className="mah-bar-name">{s.name.replace('Sprint ', 'S')}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {state.teamMembers.length === 0 && (
          <div className="empty-state card">
            <div className="empty-icon">👥</div>
            <div className="empty-title">No team members yet</div>
            <div className="empty-sub">Click &ldquo;Add Member&rdquo; to get started</div>
          </div>
        )}
      </div>
    </div>
  );
}
