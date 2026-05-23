import React, { useState, useEffect } from 'react';
import { useVelocity } from '../context/VelocityContext';
import { useWorkspaces } from '../context/WorkspaceContext';
import './Sidebar.css';

const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',     icon: '📊' },
  { id: 'team',         label: 'Team Members',  icon: '👥' },
  { id: 'sprints',      label: 'Sprints',       icon: '🏃' },
  { id: 'velocity',     label: 'Velocity',      icon: '📈' },
  { id: 'forecast',     label: 'Forecast',      icon: '🔭' },
  { id: 'releases',     label: 'Releases',      icon: '🗺️' },
  { id: 'integrations', label: 'Integrations',  icon: '🔌' },
  { id: 'ai',           label: 'AI Assistant',  icon: '🤖' },
  { id: 'settings',     label: 'Settings',      icon: '⚙️' },
];

export default function Sidebar() {
  const { state, dispatch } = useVelocity();

  const [buddyEnabled, setBuddyEnabled] = useState(
    () => localStorage.getItem('buddy_enabled') === 'true'
  );

  useEffect(() => {
    const handler = () => setBuddyEnabled(localStorage.getItem('buddy_enabled') === 'true');
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // If the AI Assistant tab is active when the buddy is enabled, redirect away.
  useEffect(() => {
    if (buddyEnabled && state.activeTab === 'ai') {
      dispatch({ type: 'SET_TAB', tab: 'dashboard' });
    }
  }, [buddyEnabled, state.activeTab, dispatch]);

  const visibleNavItems = buddyEnabled
    ? NAV_ITEMS.filter(item => item.id !== 'ai')
    : NAV_ITEMS;
  const { workspaces, activeWorkspace, activeWorkspaceId, switchWorkspace, renameWorkspace, deleteWorkspace } = useWorkspaces();

  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const multiWorkspace = workspaces.length > 1;

  const startRename = (ws) => {
    setRenamingId(ws.id);
    setRenameValue(ws.name);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameWorkspace(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  return (
    <aside className="sidebar">
      {/* ── Brand ── */}
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">⚡</span>
        <div>
          <div className="sidebar-brand-title">Velocity</div>
          <div className="sidebar-brand-sub">Agile Tool</div>
        </div>
      </div>

      {/* ── Workspace switcher (only when >1 workspace) ── */}
      {multiWorkspace && (
        <div className="sidebar-workspace-switcher">
          <div className="sws-label">Workspace</div>
          <select
            className="sws-select"
            value={activeWorkspaceId}
            onChange={e => switchWorkspace(e.target.value)}
          >
            {workspaces.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="sidebar-nav">
        {visibleNavItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${state.activeTab === item.id ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TAB', tab: item.id })}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'ai' && <span className="sidebar-ai-badge">AI</span>}
          </button>
        ))}
      </nav>

      {/* ── Workspace management panel (only when >1 workspace) ── */}
      {multiWorkspace && (
        <div className="sidebar-ws-panel">
          <div className="swp-title">Workspaces</div>
          <ul className="swp-list">
            {workspaces.map(ws => {
              const isActive   = ws.id === activeWorkspaceId;
              const isRenaming = renamingId === ws.id;
              return (
                <li key={ws.id} className={`swp-item ${isActive ? 'active' : ''}`}>
                  {isRenaming ? (
                    <input
                      className="swp-rename-input"
                      value={renameValue}
                      autoFocus
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                      }}
                    />
                  ) : (
                    <span
                      className="swp-name"
                      title={`Switch to ${ws.name}`}
                      onClick={() => !isActive && switchWorkspace(ws.id)}
                    >
                      {isActive && <span className="swp-dot" />}
                      {ws.name}
                    </span>
                  )}
                  <div className="swp-actions">
                    {!isRenaming && (
                      <button
                        className="swp-btn"
                        title="Rename workspace"
                        onClick={() => startRename(ws)}
                      >
                        ✏️
                      </button>
                    )}
                    {ws.id !== 'default' && !isActive && (
                      <button
                        className="swp-btn swp-btn-delete"
                        title={`Delete "${ws.name}"`}
                        onClick={() => {
                          if (window.confirm(`Delete workspace "${ws.name}"? Its data will be permanently removed.`)) {
                            deleteWorkspace(ws.id);
                          }
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Footer stats ── */}
      <div className="sidebar-footer">
        {multiWorkspace && (
          <div className="sidebar-footer-ws">{activeWorkspace.name}</div>
        )}
        <div className="sidebar-footer-label">Team Size</div>
        <div className="sidebar-footer-value">{state.teamMembers.length} members</div>
        <div className="sidebar-footer-label" style={{ marginTop: 6 }}>Sprints Tracked</div>
        <div className="sidebar-footer-value">{state.sprints.length} sprints</div>
        <div className="sidebar-footer-label" style={{ marginTop: 6 }}>Releases</div>
        <div className="sidebar-footer-value">{(state.releasePlans || []).length} plans</div>
      </div>
    </aside>
  );
}
