/**
 * Settings.jsx
 *
 * Global configuration and data management page.
 *
 * Settings:
 *  - Sprint Duration (working days) — affects capacity calculations and forecast week estimates
 *  - Support Impact Factor (0–1) — fraction of capacity retained on support days.
 *    e.g. 0.8 = each support day costs 20% of a person-day
 *
 * Data Management:
 *  - Export JSON — serializes full app state to agile-velocity-data.json
 *  - Import JSON — replaces current state from a previously exported file
 *  - Reset All Data — clears localStorage and reloads with default sample data
 *
 * Note: AI API keys are NOT stored here — they live in sessionStorage only
 * and are cleared when the browser tab is closed.
 */
import React, { useState } from 'react';
import { useVelocity } from '../context/VelocityContext';
import { sprintCalendarInfo } from '../context/VelocityContext';
import { useWorkspaces } from '../context/WorkspaceContext';
import {
  buildExportPayload,
  extractStateEnvelope,
  migrateStateBySchema,
  sanitizeImportedState,
  validateImportedState,
} from '../utils/stateSchema';
import './Settings.css';

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function csvEscape(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function pickFirst(obj, keys, fallback = '') {
  for (const key of keys) {
    if (obj[key] != null && String(obj[key]).trim() !== '') return obj[key];
  }
  return fallback;
}

function uniqueTruthy(values) {
  return [...new Set((values || []).filter(v => typeof v === 'string' && v.trim()))];
}

export default function Settings() {
  const { state, dispatch } = useVelocity();
  const { workspaces, activeWorkspaceId, switchWorkspace, createWorkspace, renameWorkspace, deleteWorkspace } = useWorkspaces();
  const [editingRegion,    setEditingRegion]    = useState(null);
  const [expandedHolidays, setExpandedHolidays] = useState(null);
  const [expandedMembers,  setExpandedMembers]  = useState(null);
  const [editingHoliday,   setEditingHoliday]   = useState(null); // holidayId
  const [workspaceName,    setWorkspaceName]    = useState('');
  const [renamingWsId,     setRenamingWsId]     = useState(null);
  const [renameWsValue,    setRenameWsValue]    = useState('');

  const handleExport = () => {
    const payload = buildExportPayload(state);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'agile-velocity-data.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const envelope = extractStateEnvelope(parsed);
        validateImportedState(envelope.state);
        const migrated = migrateStateBySchema(envelope.state, envelope.schemaVersion);
        const normalized = sanitizeImportedState(migrated.state, state);
        dispatch({ type: 'LOAD_STATE', payload: normalized });
        dispatch({ type: 'RECALC_ALL_SPRINT_HOLIDAYS' });
        dispatch({ type: 'SET_TAB', tab: 'settings' });
        alert('Data imported successfully!');
      } catch (err) {
        alert(`Failed to import: ${err?.message || 'invalid JSON file.'}`);
      } finally {
        // Allow selecting the same file again after a failed or successful import.
        input.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    if (window.confirm('Reset ALL data to defaults? This cannot be undone.')) {
      localStorage.clear(); window.location.reload();
    }
  };

  const handleExportCsv = () => {
    const header = [
      'sprintName', 'startDate', 'endDate', 'committedPoints', 'completedPoints',
      'scopeAddedPoints', 'scopeRemovedPoints', 'notes',
    ];
    const lines = [header.join(',')];
    state.sprints.forEach(s => {
      lines.push([
        csvEscape(s.name),
        csvEscape(s.startDate),
        csvEscape(s.endDate),
        csvEscape(s.committedPoints || 0),
        csvEscape(s.completedPoints || 0),
        csvEscape(s.scopeAddedPoints || 0),
        csvEscape(s.scopeRemovedPoints || 0),
        csvEscape(s.notes || ''),
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agile-velocity-sprints.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || '');
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) {
          alert('CSV import failed: CSV has no data rows.');
          input.value = '';
          return;
        }
        const headers = parseCsvLine(lines[0]).map(h => h.trim());
        const rows = lines.slice(1).map(line => {
          const values = parseCsvLine(line);
          const obj = {};
          headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
          return obj;
        });

        const isWorkItemExport = headers.some(h => /story points|estimate|effort/i.test(h))
          && headers.some(h => /sprint|iteration/i.test(h));

        const jiraMap = state.integrations?.jira?.mappings || {};
        const azureMap = state.integrations?.azure?.mappings || {};
        const sprintFields = uniqueTruthy([
          jiraMap.sprint,
          azureMap.sprint,
          'Sprint', 'sprint', 'Iteration Path', 'Iteration', 'iteration', 'sprintName',
        ]);
        const pointsFields = uniqueTruthy([
          jiraMap.points,
          azureMap.points,
          'Story Points', 'Story point estimate', 'Effort', 'Points', 'storyPoints',
        ]);
        const statusFields = uniqueTruthy([
          jiraMap.status,
          azureMap.status,
          'Status', 'state', 'State',
        ]);

        let nextSprints;
        if (isWorkItemExport) {
          const grouped = {};
          rows.forEach(r => {
            const sprintName = pickFirst(r, sprintFields, 'Unassigned');
            const points = Number(pickFirst(r, pointsFields, 0)) || 0;
            const status = String(pickFirst(r, statusFields, '')).toLowerCase();
            if (!grouped[sprintName]) {
              grouped[sprintName] = {
                id: `csv-${Date.now()}-${Object.keys(grouped).length}`,
                name: sprintName,
                startDate: '',
                endDate: '',
                committedPoints: 0,
                completedPoints: 0,
                scopeAddedPoints: 0,
                scopeRemovedPoints: 0,
                notes: 'Imported from work-item CSV (Jira/Azure format).',
                memberCapacity: [],
              };
            }
            grouped[sprintName].committedPoints += points;
            if (/done|closed|resolved/.test(status)) grouped[sprintName].completedPoints += points;
          });
          nextSprints = Object.values(grouped);
        } else {
          nextSprints = rows.map((r, idx) => ({
            id: `csv-${Date.now()}-${idx}`,
            name: r.sprintName || `Imported Sprint ${idx + 1}`,
            startDate: r.startDate || '',
            endDate: r.endDate || '',
            committedPoints: Number(r.committedPoints || 0),
            completedPoints: Number(r.completedPoints || 0),
            scopeAddedPoints: Number(r.scopeAddedPoints || 0),
            scopeRemovedPoints: Number(r.scopeRemovedPoints || 0),
            notes: r.notes || '',
            memberCapacity: [],
          }));
        }
        dispatch({ type: 'LOAD_STATE', payload: { ...state, sprints: nextSprints } });
        alert(`Imported ${nextSprints.length} sprints from CSV${isWorkItemExport ? ' (work-item mode)' : ''}.`);
      } catch (err) {
        alert(`CSV import failed: ${err?.message || 'invalid file.'}`);
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  };

  /**
   * Copy a region (and its holidays) to a target workspace's localStorage entry.
   * Skips if a region with the same name already exists in that workspace.
   */
  const copyRegionToWorkspace = (region, targetWsId) => {
    const targetWs = workspaces.find(w => w.id === targetWsId);
    if (!targetWs) return;
    try {
      const raw = localStorage.getItem(targetWs.storageKey);
      const targetState = raw ? JSON.parse(raw) : {};
      const targetRegions = Array.isArray(targetState.regions) ? targetState.regions : [];
      const targetHolidays = Array.isArray(targetState.holidays) ? targetState.holidays : [];

      const nameLower = region.name.toLowerCase();
      if (targetRegions.some(r => r.name.toLowerCase() === nameLower)) {
        alert(`Region "${region.name}" already exists in "${targetWs.name}".`);
        return;
      }

      const newRegionId = `${region.id}_copy_${Date.now()}`;
      const regionHolidays = (state.holidays || []).filter(h => h.regionId === region.id);
      const copiedHolidays = regionHolidays.map(h => ({
        ...h,
        id: `${h.id}_copy_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        regionId: newRegionId,
      }));

      const nextState = {
        ...targetState,
        regions:  [...targetRegions,  { ...region, id: newRegionId }],
        holidays: [...targetHolidays, ...copiedHolidays],
      };
      localStorage.setItem(targetWs.storageKey, JSON.stringify(nextState));
      alert(`Region "${region.name}" copied to "${targetWs.name}".`);
    } catch {
      alert('Failed to copy region.');
    }
  };

  const regions  = state.regions  || [];
  const holidays = state.holidays || [];

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Configure global parameters, regions, and public holidays</p>
        </div>
      </div>

      {/* ── Workspaces ── */}
      <div className="card settings-section">
        <h2 className="settings-section-title">🗂 Workspaces</h2>
        <p className="settings-data-note">
          Create isolated workspaces for different teams or products. Rename any workspace to reflect
          its team or project. Switch between them using the sidebar dropdown (visible when you have
          more than one workspace).
        </p>

        {/* Workspace list with inline rename */}
        <div className="ws-settings-list">
          {workspaces.map(ws => {
            const isActive   = ws.id === activeWorkspaceId;
            const isRenaming = renamingWsId === ws.id;
            return (
              <div key={ws.id} className={`ws-settings-row ${isActive ? 'active' : ''}`}>
                <div className="ws-settings-name-cell">
                  {isActive && <span className="ws-settings-active-dot" />}
                  {isRenaming ? (
                    <input
                      className="ws-settings-rename-input"
                      value={renameWsValue}
                      autoFocus
                      onChange={e => setRenameWsValue(e.target.value)}
                      onBlur={() => {
                        if (renameWsValue.trim()) renameWorkspace(ws.id, renameWsValue.trim());
                        setRenamingWsId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (renameWsValue.trim()) renameWorkspace(ws.id, renameWsValue.trim());
                          setRenamingWsId(null);
                        }
                        if (e.key === 'Escape') setRenamingWsId(null);
                      }}
                    />
                  ) : (
                    <span className="ws-settings-name">{ws.name}</span>
                  )}
                  {isActive && <span className="ws-settings-active-badge">Active</span>}
                </div>
                <div className="ws-settings-actions">
                  {isRenaming ? (
                    <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => {
                      if (renameWsValue.trim()) renameWorkspace(ws.id, renameWsValue.trim());
                      setRenamingWsId(null);
                    }}>
                      ✓ Save
                    </button>
                  ) : (
                    <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => {
                      setRenamingWsId(ws.id);
                      setRenameWsValue(ws.name);
                    }}>
                      ✏️ Rename
                    </button>
                  )}
                  {!isActive && ws.id !== 'default' && (
                    <>
                      <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => switchWorkspace(ws.id)}>
                        Switch
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: 12 }}
                        onClick={() => {
                          if (window.confirm(`Delete workspace "${ws.name}"? Its data will be permanently removed.`)) {
                            deleteWorkspace(ws.id);
                          }
                        }}
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add new workspace */}
        <div className="settings-data-actions" style={{ marginTop: 12 }}>
          <input
            className="settings-select"
            placeholder="New workspace name"
            value={workspaceName}
            onChange={e => setWorkspaceName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && workspaceName.trim()) {
                createWorkspace(workspaceName.trim());
                setWorkspaceName('');
              }
            }}
          />
          <button className="btn btn-secondary" onClick={() => {
            const name = workspaceName.trim();
            if (!name) return;
            createWorkspace(name);
            setWorkspaceName('');
          }}>
            + Add Workspace
          </button>
        </div>
      </div>

      <div className="card settings-section">
        <h2 className="settings-section-title">⏱ Sprint Configuration</h2>

        {/* Sprint Start Day */}
        <div className="settings-field">
          <div className="settings-field-info">
            <label>Sprint Start Day</label>
            <p>The day of the week your sprints typically begin. Used to calculate calendar days and weekend crossings.</p>
          </div>
          <div className="settings-field-control">
            <select
              className="settings-select"
              value={state.sprintStartDay ?? 1}
              onChange={e => dispatch({ type: 'SET_SPRINT_START_DAY', value: Number(e.target.value) })}
            >
              {DOW_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Sprint Duration */}
        <div className="settings-field">
          <div className="settings-field-info">
            <label>Sprint Duration (working days)</label>
            {(() => {
              const { calendarDays, weekendsIncluded } = sprintCalendarInfo(
                state.sprintStartDay ?? 1,
                state.sprintDurationDays
              );
              return (
                <p>
                  <strong>{state.sprintDurationDays} working days</strong> starting on a{' '}
                  <strong>{DOW_NAMES[state.sprintStartDay ?? 1]}</strong> spans{' '}
                  <strong>{calendarDays} calendar days</strong> ({weekendsIncluded} weekend{weekendsIncluded !== 1 ? 's' : ''} factored in).
                  End dates are calculated automatically, skipping Saturdays and Sundays.
                </p>
              );
            })()}
          </div>
          <div className="settings-field-control">
            <input type="range" min={5} max={30} step={1}
              value={state.sprintDurationDays}
              onChange={e => dispatch({ type: 'SET_SPRINT_DURATION', value: Number(e.target.value) })}
            />
            <span className="settings-range-val">{state.sprintDurationDays} days</span>
          </div>
        </div>
      </div>

      {/* ── Capacity Impact Factors ── */}
      <div className="card settings-section">
        <h2 className="settings-section-title">⚙️ Capacity Impact Factors</h2>
        <div className="settings-field">
          <div className="settings-field-info">
            <label>Support Impact Factor</label>
            <p>
              Fraction of full capacity retained on support days.
              <strong> {Math.round(state.supportImpactFactor * 100)}%</strong> capacity means each support day
              costs <strong>{Math.round((1 - state.supportImpactFactor) * 100)}%</strong> of a person-day.
            </p>
          </div>
          <div className="settings-field-control">
            <input type="range" min={0} max={1} step={0.05}
              value={state.supportImpactFactor}
              onChange={e => dispatch({ type: 'SET_SUPPORT_IMPACT', value: Number(e.target.value) })}
            />
            <span className="settings-range-val">{Math.round(state.supportImpactFactor * 100)}%</span>
          </div>
        </div>
      </div>

      {/* ── Regions & Holidays ── */}
      <div className="card settings-section">
        <div className="settings-section-header">
          <h2 className="settings-section-title">🌍 Regions &amp; Public Holidays</h2>
          <button className="btn btn-primary" onClick={() => {
            dispatch({ type: 'ADD_REGION' });
            // The new region will be last — we open edit mode for it after state updates
            // We track by a flag; the new id is assigned in the reducer so we set editing on next render
            setTimeout(() => {
              setEditingRegion('__new__');
            }, 0);
          }}>
            + Add Region
          </button>
        </div>

        <p className="settings-hint">
          Holidays are automatically applied as PTO days when creating new sprints.
          Weekend holidays are ignored. Manual PTO adjustments in the sprint are preserved.
        </p>

        {regions.length === 0 && (
          <div className="settings-empty">No regions yet. Add one to start tracking holidays.</div>
        )}

        <div className="region-list">
          {regions.map((region, idx) => {
            const isEditing       = editingRegion === region.id || (editingRegion === '__new__' && idx === regions.length - 1);
            const holidaysOpen    = expandedHolidays === region.id;
            const membersOpen     = expandedMembers  === region.id;
            const regionHolidays  = holidays.filter(h => h.regionId === region.id)
              .sort((a, b) => a.date.localeCompare(b.date));
            const regionMembers   = state.teamMembers.filter(m => m.regionId === region.id);

            return (
              <div key={region.id} className={`region-card ${isEditing ? 'editing' : ''}`}>
                {/* ── Region header ── */}
                <div className="region-header">
                  {/* Avatar / icon */}
                  <div className="region-avatar">🌍</div>

                  {/* Name + meta */}
                  <div className="region-info">
                    {isEditing ? (
                      <input
                        className="region-name-input"
                        value={region.name}
                        placeholder="Region name (e.g. United States)"
                        autoFocus
                        onChange={e => dispatch({ type: 'UPDATE_REGION', id: region.id, data: { name: e.target.value } })}
                      />
                    ) : (
                      <div className="region-name">
                        {region.name || <em style={{ color: 'var(--text-muted)' }}>Unnamed</em>}
                      </div>
                    )}
                    <div className="region-meta-row">
                      <span
                        className={`region-meta-pill clickable ${holidaysOpen ? 'active' : ''}`}
                        title="Click to toggle holidays"
                        onClick={() => setExpandedHolidays(holidaysOpen ? null : region.id)}
                      >
                        🗓 {regionHolidays.length} holiday{regionHolidays.length !== 1 ? 's' : ''} {holidaysOpen ? '▾' : '▸'}
                      </span>
                      <span
                        className={`region-meta-pill clickable ${membersOpen ? 'active' : ''}`}
                        title="Click to toggle members"
                        onClick={() => setExpandedMembers(membersOpen ? null : region.id)}
                      >
                        👤 {regionMembers.length} member{regionMembers.length !== 1 ? 's' : ''} {membersOpen ? '▾' : '▸'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="region-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditingRegion(isEditing ? null : region.id)}
                    >
                      {isEditing ? '✓ Done' : '✏️ Edit'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        dispatch({ type: 'ADD_HOLIDAY', regionId: region.id });
                        setExpandedHolidays(region.id);
                      }}
                    >
                      + Holiday
                    </button>
                    {workspaces.length > 1 && (
                      <div className="copy-to-ws-wrap">
                        <select
                          className="copy-to-ws-select"
                          defaultValue=""
                          onChange={e => {
                            if (e.target.value) {
                              copyRegionToWorkspace(region, e.target.value);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="" disabled>Copy to…</option>
                          {workspaces.filter(w => w.id !== activeWorkspaceId).map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        if (window.confirm(`Remove region "${region.name}" and all its holidays?`))
                          dispatch({ type: 'REMOVE_REGION', id: region.id });
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* ── Holiday table ── */}
                {holidaysOpen && (
                  <div className="holiday-table-wrap">
                    {regionHolidays.length === 0 ? (
                      <div className="settings-empty" style={{ padding: '12px 0' }}>
                        No holidays yet &mdash; click &ldquo;+ Holiday&rdquo; to add one.
                      </div>
                    ) : (
                      <table className="holiday-table">
                        <thead>
                          <tr>
                            <th>Holiday Name</th>
                            <th>Date</th>
                            <th>Day</th>
                            <th>Weekday?</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {regionHolidays.map(h => {
                            const d         = h.date ? new Date(h.date + 'T00:00:00') : null;
                            const dow       = d ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] : '—';
                            const isWeekend = d ? (d.getDay() === 0 || d.getDay() === 6) : false;
                            const isEditingThis = editingHoliday === h.id;

                            return (
                              <tr key={h.id} className={[
                                isWeekend ? 'holiday-row-weekend' : '',
                                isEditingThis ? 'holiday-row-editing' : '',
                              ].join(' ')}>
                                <td>
                                  {isEditingThis ? (
                                    <input
                                      className="holiday-name-input editing"
                                      value={h.name}
                                      placeholder="e.g. Thanksgiving"
                                      autoFocus
                                      onChange={e => dispatch({ type: 'UPDATE_HOLIDAY', id: h.id, data: { name: e.target.value } })}
                                    />
                                  ) : (
                                    <span className="holiday-name-text">{h.name || <em style={{ color: 'var(--text-muted)' }}>Unnamed</em>}</span>
                                  )}
                                </td>
                                <td>
                                  {isEditingThis ? (
                                    <input
                                      type="date"
                                      className="holiday-date-input"
                                      value={h.date}
                                      onChange={e => dispatch({ type: 'UPDATE_HOLIDAY', id: h.id, data: { date: e.target.value } })}
                                    />
                                  ) : (
                                    <span className="holiday-date-text">{h.date || '—'}</span>
                                  )}
                                </td>
                                <td className="holiday-dow">{dow}</td>
                                <td>
                                  {isWeekend
                                    ? <span className="holiday-badge weekend">Weekend — ignored</span>
                                    : <span className="holiday-badge weekday">✓ Counts</span>
                                  }
                                </td>
                                <td className="holiday-actions-cell">
                                  <button
                                    className={`btn ${isEditingThis ? 'btn-primary' : 'btn-secondary'} holiday-edit-btn`}
                                    onClick={() => setEditingHoliday(isEditingThis ? null : h.id)}
                                  >
                                    {isEditingThis ? '✓' : '✏️'}
                                  </button>
                                  <button
                                    className="btn btn-danger holiday-del-btn"
                                    onClick={() => dispatch({ type: 'REMOVE_HOLIDAY', id: h.id })}
                                  >
                                    🗑
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* ── Members list ── */}
                {membersOpen && (
                  <div className="region-members-wrap">
                    {regionMembers.length === 0 ? (
                      <div className="settings-empty" style={{ padding: '12px 0' }}>
                        No members assigned to this region yet.
                      </div>
                    ) : (
                      <table className="region-member-table">
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Role</th>
                            <th>Latest Allocation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {regionMembers.map(m => {
                            const lastSprint = state.sprints[state.sprints.length - 1];
                            const row = (lastSprint?.memberCapacity || []).find(r => r.memberId === m.id);
                            const alloc = row?.allocation ?? 100;
                            const allocColor = alloc >= 80 ? 'var(--success)' : alloc >= 50 ? 'var(--warning)' : 'var(--danger)';
                            return (
                              <tr key={m.id}>
                                <td className="region-member-name-cell">
                                  <div className="region-member-avatar">
                                    {m.name ? m.name[0].toUpperCase() : '?'}
                                  </div>
                                  <span className="region-member-name">{m.name || <em>Unnamed</em>}</span>
                                </td>
                                <td>
                                  <span className="region-member-role">{m.role}</span>
                                </td>
                                <td>
                                  <span className="region-member-alloc" style={{ color: allocColor, borderColor: allocColor }}>
                                    {alloc}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Data Management ── */}
      <div className="card settings-section">
        <h2 className="settings-section-title">💾 Data Management</h2>
        <p className="settings-data-note">
          All data is saved automatically to your browser&apos;s local storage. Use export/import to back up or transfer data.
        </p>
        <div className="settings-data-actions">
          <button className="btn btn-primary" onClick={handleExport}>⬇ Export JSON</button>
          <button className="btn btn-secondary" onClick={handleExportCsv}>⬇ Export CSV</button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            ⬆ Import JSON
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            ⬆ Import CSV
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCsv} />
          </label>
          <button className="btn btn-danger" onClick={handleReset}>🗑 Reset All Data</button>
        </div>
      </div>

      {/* ── About ── */}
      <div className="card settings-section">
        <h2 className="settings-section-title">ℹ️ About</h2>
        <div className="settings-about">
          <div><span className="about-label">Tool</span><span>Agile Velocity Tool</span></div>
          <div><span className="about-label">Version</span><span>1.0.0</span></div>
          <div><span className="about-label">Charts</span><span>Recharts</span></div>
          <div><span className="about-label">Framework</span><span>React + Vite</span></div>
          <div><span className="about-label">Storage</span><span>Browser LocalStorage</span></div>
        </div>
      </div>
    </div>
  );
}
