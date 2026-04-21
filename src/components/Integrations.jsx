import React from 'react';
import { useVelocity } from '../context/VelocityContext';
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

function ProviderCard({
  title,
  config,
  fields,
  onUpdate,
  onUpdateMapping,
  onTest,
}) {
  return (
    <div className="card integrations-card">
      <div className="integrations-header-row">
        <div>
          <h2 className="settings-section-title">{title}</h2>
          <p className="settings-data-note">Connector stub with local settings and field mapping.</p>
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
        <button className="btn btn-primary" onClick={() => onUpdate({ connected: true })}>Mark Connected</button>
      </div>

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
      {config.lastTestMessage && (
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

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Integrations</h1>
          <p className="page-sub">Configure Jira and Azure DevOps mappings for import workflows</p>
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
      />
    </div>
  );
}

