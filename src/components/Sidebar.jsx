import React from 'react';
import { useVelocity } from '../context/VelocityContext';
import './Sidebar.css';

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',     icon: '📊' },
  { id: 'team',       label: 'Team Members',  icon: '👥' },
  { id: 'sprints',    label: 'Sprints',       icon: '🏃' },
  { id: 'velocity',   label: 'Velocity',      icon: '📈' },
  { id: 'forecast',   label: 'Forecast',      icon: '🔭' },
  { id: 'releases',   label: 'Releases',      icon: '🗺️' },
  { id: 'integrations', label: 'Integrations', icon: '🔌' },
  { id: 'ai',         label: 'AI Assistant',  icon: '🤖' },
  { id: 'settings',   label: 'Settings',      icon: '⚙️' },
];

export default function Sidebar() {
  const { state, dispatch } = useVelocity();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">⚡</span>
        <div>
          <div className="sidebar-brand-title">Velocity</div>
          <div className="sidebar-brand-sub">Agile Tool</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
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

      <div className="sidebar-footer">
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

