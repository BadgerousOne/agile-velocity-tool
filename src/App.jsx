/**
 * App.jsx
 *
 * Root component. Wraps everything in VelocityProvider (global state),
 * renders the Sidebar, and switches between pages based on state.activeTab.
 *
 * Page routing is handled by a simple switch — no router library needed
 * since all state is in-memory/localStorage.
 */
import React from 'react';
import { VelocityProvider, useVelocity } from './context/VelocityContext';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TeamMembers from './components/TeamMembers';
import Sprints from './components/Sprints';
import VelocityChart from './components/VelocityChart';
import Forecast from './components/Forecast';
import AIAssistant from './components/AIAssistant';
import Settings from './components/Settings';
import './App.css';

function AppContent() {
  const { state } = useVelocity();

  const renderPage = () => {
    switch (state.activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'team':      return <TeamMembers />;
      case 'sprints':   return <Sprints />;
      case 'velocity':  return <VelocityChart />;
      case 'forecast':  return <Forecast />;
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
    </div>
  );
}

export default function App() {
  return (
    <VelocityProvider>
      <AppContent />
    </VelocityProvider>
  );
}
