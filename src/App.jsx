/**
 * App.jsx
 *
 * Root component. Wraps everything in VelocityProvider (global state),
 * renders the Sidebar, and switches between pages based on state.activeTab.
 *
 * Page routing is handled by a simple switch — no router library needed
 * since all state is in-memory/localStorage.
 */
import React, { useEffect } from 'react';
import { VelocityProvider, useVelocity } from './context/VelocityContext';
import { WorkspaceProvider, useWorkspaces } from './context/WorkspaceContext';
import Sidebar from './components/Sidebar';
import AgentBuddy from './components/AgentBuddy';
import Dashboard from './components/Dashboard';
import TeamMembers from './components/TeamMembers';
import Sprints from './components/Sprints';
import VelocityChart from './components/VelocityChart';
import Forecast from './components/Forecast';
import Releases from './components/Releases';
import Integrations from './components/Integrations';
import AIAssistant from './components/AIAssistant';
import Settings from './components/Settings';
import './App.css';

function AppContent() {
  const { state } = useVelocity();

  useEffect(() => {
    const url = localStorage.getItem('buddy_ollama_url') || 'http://localhost:11434';
    window.ollamaApi?.setUrl(url);
  }, []);

  const renderPage = () => {
    switch (state.activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'team':      return <TeamMembers />;
      case 'sprints':   return <Sprints />;
      case 'velocity':  return <VelocityChart />;
      case 'forecast':  return <Forecast />;
      case 'releases':  return <Releases />;
      case 'integrations': return <Integrations />;
      case 'ai':        return <AIAssistant />;
      case 'settings':  return <Settings />;
      default:          return <Dashboard />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <div className="app-content">
          {renderPage()}
        </div>
      </main>
      <AgentBuddy />
    </div>
  );
}

/**
 * Mounts VelocityProvider keyed on the active workspace.
 * Changing the key unmounts/remounts VelocityProvider, which re-initializes
 * state from the new workspace's localStorage entry — a clean workspace switch.
 */
function AppWithWorkspace() {
  const { activeWorkspace } = useWorkspaces();
  // No key= here — VelocityProvider stays mounted across workspace switches.
  // The storageKey prop change triggers an internal useEffect that loads the
  // new workspace's data while preserving the current activeTab.
  return (
    <VelocityProvider storageKey={activeWorkspace.storageKey}>
      <AppContent />
    </VelocityProvider>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <AppWithWorkspace />
    </WorkspaceProvider>
  );
}
