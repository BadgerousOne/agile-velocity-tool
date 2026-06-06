// Jira story points live under `story_points` in classic projects or
// `customfield_10016` in Jira Next-gen / most cloud instances.
function extractPoints(fields = {}) {
  const raw = fields.story_points ?? fields.customfield_10016 ?? null;
  return typeof raw === 'number' ? raw : 0;
}

function toYMD(dateStr) {
  if (!dateStr) return '';
  return dateStr.slice(0, 10);
}

function authHeader(config) {
  return `Basic ${btoa(`${config.username}:${config.token}`)}`;
}

function baseUrl(config) {
  return String(config.baseUrl || '').trim().replace(/\/$/, '');
}

async function apiFetch(url, config) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader(config), Accept: 'application/json' },
    });
  } catch (err) {
    throw { type: 'cors', message: err?.message || 'Network error' };
  }
  if (res.status === 401 || res.status === 403) {
    throw { type: 'auth', message: `HTTP ${res.status} — check your credentials` };
  }
  if (!res.ok) {
    throw { type: 'unknown', message: `HTTP ${res.status}` };
  }
  return res.json();
}

async function fetchJiraBoards(config) {
  const url = `${baseUrl(config)}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(config.projectKey)}&maxResults=1`;
  const data = await apiFetch(url, config);
  const boards = data?.values ?? [];
  if (!boards.length) throw { type: 'empty', message: 'No boards found for this project' };
  return boards[0];
}

async function fetchJiraSprints(config, boardId) {
  const url = `${baseUrl(config)}/rest/agile/1.0/board/${boardId}/sprint?state=closed,active&maxResults=100`;
  const data = await apiFetch(url, config);
  return data?.values ?? [];
}

async function fetchJiraSprintIssues(config, sprintId) {
  const url = `${baseUrl(config)}/rest/agile/1.0/sprint/${sprintId}/issue?fields=story_points,customfield_10016,status&maxResults=500`;
  const data = await apiFetch(url, config);
  return data?.issues ?? [];
}

function buildJiraSprint(sprint, issues) {
  let committedPoints = 0;
  let completedPoints = 0;
  for (const issue of issues) {
    const pts = extractPoints(issue.fields || {});
    committedPoints += pts;
    const statusCat = issue.fields?.status?.statusCategory?.key;
    if (statusCat === 'done') completedPoints += pts;
  }
  return {
    name: sprint.name || '',
    startDate: toYMD(sprint.startDate),
    endDate: toYMD(sprint.endDate || sprint.completeDate),
    committedPoints,
    completedPoints,
    scopeAddedPoints: 0,
    scopeRemovedPoints: 0,
    notes: '',
    memberCapacity: [],
  };
}

export async function syncJiraSprints(config) {
  if (!config?.baseUrl || !config?.username || !config?.token || !config?.projectKey) {
    throw { type: 'auth', message: 'Jira base URL, project key, username, and API token are required' };
  }
  const board = await fetchJiraBoards(config);
  const sprints = await fetchJiraSprints(config, board.id);
  if (!sprints.length) throw { type: 'empty', message: 'No sprints found for this project' };

  const results = [];
  for (const sprint of sprints) {
    const issues = await fetchJiraSprintIssues(config, sprint.id);
    results.push(buildJiraSprint(sprint, issues));
  }
  return results;
}

export { buildJiraSprint, fetchJiraBoards, fetchJiraSprints, fetchJiraSprintIssues };
