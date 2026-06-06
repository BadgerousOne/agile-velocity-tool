import React, { useState } from 'react';
import { useVelocity } from '../context/VelocityContext';
import { syncJiraSprints } from '../utils/jiraSync';
import { syncAzureSprints } from '../utils/azureSync';
import './Integrations.css';

function sanitizeUrl(value = '') {
  return String(value).trim().replace(/\/$/, '');
}

async function pingJira(config) {
  const baseUrl = sanitizeUrl(config.baseUrl);
  if (!baseUrl || !config.username || !config.token) {
    throw new Error('Enter Jira base URL, username/email, and API token.');
  }
  const auth = btoa(`${config.username}:${config.token}`);
  const res = await fetch(`${baseUrl}/rest/api/3/myself`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json().catch(() => ({}));
  return payload?.displayName || 'Jira user';
}

async function pingAzure(config) {
  if (!config.organization || !config.pat) {
    throw new Error('Enter Azure organization and PAT.');
  }
  const org = String(config.organization).trim().replace(/^https?:\/\/dev\.azure\.com\//, '').replace(/\/$/, '');
  const auth = btoa(`:${config.pat}`);
  const res = await fetch(`https://dev.azure.com/${org}/_apis/projects?api-version=7.0`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json().catch(() => ({}));
  return `${payload?.count ?? 0} projects visible`;
}

const MAPPING_FIELDS = [
  { key: 'sprint', label: 'Sprint field' },
  { key: 'points', label: 'Story points field' },
  { key: 'status', label: 'Status field' },
];

function syncErrorMessage(err) {
  if (err?.type === 'auth') return `Authentication failed — ${err.message}`;
  if (err?.type === 'cors') return `Request failed — ${err.message}. If using browser mode, CORS may be blocking this request. Use the Electron app for reliable sync.`;
  if (err?.type === 'empty') return err.message;
  return `Sync failed: ${err?.message || 'Unknown error'}`;
}

function isDuplicate(sprint, existingSprints) {
  return existingSprints.some(
    s => s.name === sprint.name || (s.startDate === sprint.startDate && s.endDate === sprint.endDate && s.startDate)
  );
}

function SyncPreviewTable({ sprints, existingSprints, onImport, onDismiss }) {
  const newCount = sprints.filter(s => !isDuplicate(s, existingSprints)).length;
  return (
    <div className="sync-preview" data-testid="sync-preview">
      <div className="sync-preview-header">
        <span>{sprints.length} sprint{sprints.length !== 1 ? 's' : ''} found — {newCount} new, {sprints.length - newCount} already imported</span>
        <button className="btn-link" onClick={onDismiss}>Dismiss</button>
      </div>
      <div className="scenario-table-wrap">
        <table className="vel-table">
          <thead>
            <tr>
              <th>Sprint</th>
              <th>Start</th>
              <th>End</th>
              <th>Committed</th>
              <th>Completed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sprints.map((s, i) => {
              const dup = isDuplicate(s, existingSprints);
              return (
                <tr key={i} className={dup ? 'sync-row-dup' : ''}>
                  <td>{s.name}</td>
                  <td>{s.startDate || '—'}</td>
                  <td>{s.endDate || '—'}</td>
                  <td>{s.committedPoints}</td>
                  <td>{s.completedPoints}</td>
                  <td>
                    {dup
                      ? <span className="badge badge-secondary">Already imported</span>
                      : <span className="badge badge-success">New</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sync-preview-actions">
        <button
          className="btn btn-primary"
          disabled={newCount === 0}
          onClick={() => onImport(sprints.filter(s => !isDuplicate(s, existingSprints)))}
        >
          Import {newCount} sprint{newCount !== 1 ? 's' : ''}
        </button>
        <button className="btn btn-secondary" onClick={onDismiss}>Cancel</button>
      </div>
    </div>
  );
}

function ProviderCard({
  title,
  config,
  fields,
  onUpdate,
  onUpdateMapping,
  onTest,
  onSync,
  syncing,
  syncError,
  syncPreview,
  existingSprints,
  onImport,
  onDismissPreview,
}) {
  return (
    <div className="card integrations-card">
      <div className="integrations-header-row">
        <div>
          <h2 className="settings-section-title">{title}</h2>
          <p className="settings-data-note">Connector with live sprint sync and field mapping.</p>
        </div>
        <span className={`badge ${config.connected ? 'badge-success' : 'badge-primary'}`}>
          {config.connected ? 'Connected' : 'Not Connected'}
        </span>
      </div>

      <div className="integrations-grid">
        {fields.map(f => (
          <label key={f.key} className="integrations-label">
            {f.label}
            <input
              className="settings-select"
              type={f.secret ? 'password' : 'text'}
              value={config[f.key] || ''}
              onChange={e => onUpdate({ [f.key]: e.target.value })}
              placeholder={f.placeholder || ''}
            />
          </label>
        ))}
      </div>

      <div className="integrations-actions">
        <button className="btn btn-secondary" onClick={onTest}>Test Connection</button>
        <button className="btn btn-secondary" onClick={() => onUpdate({ connected: true })}>Mark Connected</button>
        {config.connected && (
          <button
            className="btn btn-primary"
            onClick={onSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync Sprints'}
          </button>
        )}
      </div>

      {syncError && (
        <div className="integrations-test-result bad" data-testid="sync-error">
          {syncError}
        </div>
      )}

      {syncPreview && (
        <SyncPreviewTable
          sprints={syncPreview}
          existingSprints={existingSprints}
          onImport={onImport}
          onDismiss={onDismissPreview}
        />
      )}

      <div className="scenario-table-wrap" style={{ marginTop: 12 }}>
        <table className="vel-table">
          <thead>
            <tr>
              <th>Internal Field</th>
              <th>External Column Name</th>
            </tr>
          </thead>
          <tbody>
            {MAPPING_FIELDS.map(field => (
              <tr key={field.key}>
                <td>{field.label}</td>
                <td>
                  <input
                    value={config.mappings?.[field.key] || ''}
                    onChange={e => onUpdateMapping(field.key, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="settings-data-note" style={{ marginTop: 8 }}>
        Use these mappings when importing CSV exports from your tracker.
      </div>
      {config.lastTestMessage && !syncError && (
        <div className={`integrations-test-result ${config.connected ? 'ok' : 'bad'}`}>
          {config.lastTestMessage}
        </div>
      )}
    </div>
  );
}

export default function Integrations() {
  const { state, dispatch } = useVelocity();
  const integrations = state.integrations || {};

  const [jiraSyncing, setJiraSyncing] = useState(false);
  const [jiraError, setJiraError] = useState(null);
  const [jiraPreview, setJiraPreview] = useState(null);

  const [azureSyncing, setAzureSyncing] = useState(false);
  const [azureError, setAzureError] = useState(null);
  const [azurePreview, setAzurePreview] = useState(null);

  const updateProvider = (provider, data) => {
    dispatch({ type: 'UPDATE_INTEGRATION', provider, data });
  };

  const updateMapping = (provider, field, value) => {
    dispatch({ type: 'UPDATE_INTEGRATION_MAPPING', provider, field, value });
  };

  const testConnection = async (provider) => {
    const name = provider === 'jira' ? 'Jira' : 'Azure DevOps';
    const config = integrations[provider] || {};
    try {
      const detail = provider === 'jira'
        ? await pingJira(config)
        : await pingAzure(config);
      updateProvider(provider, {
        connected: true,
        lastTestAt: new Date().toISOString(),
        lastTestMessage: `${name} connection OK (${detail}).`,
      });
      dispatch({
        type: 'ADD_AI_ACTION_AUDIT',
        entry: {
          action: 'integration_test',
          details: `${name} connection succeeded.`,
          source: 'integrations',
          status: 'applied',
        },
      });
    } catch (err) {
      updateProvider(provider, {
        connected: false,
        lastTestAt: new Date().toISOString(),
        lastTestMessage: `${name} test failed: ${err?.message || 'Unknown error'}`,
      });
      dispatch({
        type: 'ADD_AI_ACTION_AUDIT',
        entry: {
          action: 'integration_test',
          details: `${name} connection failed: ${err?.message || 'Unknown error'}`,
          source: 'integrations',
          status: 'rejected',
        },
      });
    }
  };

  const handleSync = async (provider) => {
    const cfg = integrations[provider] || {};
    const setError = provider === 'jira' ? setJiraError : setAzureError;
    const setPreview = provider === 'jira' ? setJiraPreview : setAzurePreview;
    const setSyncing = provider === 'jira' ? setJiraSyncing : setAzureSyncing;

    setError(null);
    setPreview(null);
    setSyncing(true);
    try {
      const sprints = provider === 'jira'
        ? await syncJiraSprints(cfg)
        : await syncAzureSprints(cfg);
      setPreview(sprints);
    } catch (err) {
      setError(syncErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleImport = (provider, sprints) => {
    dispatch({ type: 'IMPORT_SYNCED_SPRINTS', sprints });
    dispatch({ type: 'RECALC_ALL_SPRINT_HOLIDAYS' });
    const setPreview = provider === 'jira' ? setJiraPreview : setAzurePreview;
    setPreview(null);
    dispatch({
      type: 'ADD_AI_ACTION_AUDIT',
      entry: {
        action: 'integration_sync',
        details: `Imported ${sprints.length} sprint(s) from ${provider === 'jira' ? 'Jira' : 'Azure DevOps'}.`,
        source: 'integrations',
        status: 'applied',
      },
    });
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Integrations</h1>
          <p className="page-sub">Connect Jira or Azure DevOps to sync sprint data directly</p>
        </div>
      </div>

      <ProviderCard
        title="Jira"
        config={integrations.jira || { mappings: {} }}
        fields={[
          { key: 'baseUrl', label: 'Base URL', placeholder: 'https://your-domain.atlassian.net' },
          { key: 'projectKey', label: 'Project Key', placeholder: 'ABC' },
          { key: 'username', label: 'Username / Email', placeholder: 'name@company.com' },
          { key: 'token', label: 'API Token', secret: true },
        ]}
        onUpdate={data => updateProvider('jira', data)}
        onUpdateMapping={(field, value) => updateMapping('jira', field, value)}
        onTest={() => testConnection('jira')}
        onSync={() => handleSync('jira')}
        syncing={jiraSyncing}
        syncError={jiraError}
        syncPreview={jiraPreview}
        existingSprints={state.sprints || []}
        onImport={sprints => handleImport('jira', sprints)}
        onDismissPreview={() => setJiraPreview(null)}
      />

      <ProviderCard
        title="Azure DevOps"
        config={integrations.azure || { mappings: {} }}
        fields={[
          { key: 'organization', label: 'Organization', placeholder: 'my-org' },
          { key: 'project', label: 'Project', placeholder: 'my-project' },
          { key: 'pat', label: 'Personal Access Token', secret: true },
        ]}
        onUpdate={data => updateProvider('azure', data)}
        onUpdateMapping={(field, value) => updateMapping('azure', field, value)}
        onTest={() => testConnection('azure')}
        onSync={() => handleSync('azure')}
        syncing={azureSyncing}
        syncError={azureError}
        syncPreview={azurePreview}
        existingSprints={state.sprints || []}
        onImport={sprints => handleImport('azure', sprints)}
        onDismissPreview={() => setAzurePreview(null)}
      />
    </div>
  );
}
