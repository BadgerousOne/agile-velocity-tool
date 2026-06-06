const DONE_STATES = new Set(['done', 'closed', 'resolved', 'completed']);

function toYMD(dateStr) {
  if (!dateStr) return '';
  return dateStr.slice(0, 10);
}

function authHeader(config) {
  return `Basic ${btoa(`:${config.pat}`)}`;
}

function orgBase(config) {
  const org = String(config.organization || '').trim()
    .replace(/^https?:\/\/dev\.azure\.com\//, '').replace(/\/$/, '');
  return `https://dev.azure.com/${org}`;
}

async function apiFetch(url, config) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader(config), Accept: 'application/json' },
    });
  } catch (err) {
    throw { type: 'cors', message: err?.message || 'Network error — Azure DevOps may not allow browser requests. Use Electron mode.' };
  }
  if (res.status === 401 || res.status === 403) {
    throw { type: 'auth', message: `HTTP ${res.status} — check your PAT and organization` };
  }
  if (!res.ok) {
    throw { type: 'unknown', message: `HTTP ${res.status}` };
  }
  return res.json();
}

async function fetchAzureIterations(config) {
  const project = encodeURIComponent(config.project || '');
  const url = `${orgBase(config)}/${project}/_apis/work/teamsettings/iterations?api-version=7.0`;
  const data = await apiFetch(url, config);
  return data?.value ?? [];
}

async function fetchAzureWorkItems(config, iterationId) {
  const project = encodeURIComponent(config.project || '');
  const url = `${orgBase(config)}/${project}/_apis/work/teamsettings/iterations/${iterationId}/workitems?api-version=7.0`;
  const data = await apiFetch(url, config);
  return data?.workItemRelations ?? [];
}

async function fetchWorkItemDetails(config, ids) {
  if (!ids.length) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

  const results = [];
  for (const chunk of chunks) {
    const fields = 'Microsoft.VSTS.Scheduling.StoryPoints,System.State';
    const url = `${orgBase(config)}/_apis/wit/workitems?ids=${chunk.join(',')}&fields=${encodeURIComponent(fields)}&api-version=7.0`;
    const data = await apiFetch(url, config);
    results.push(...(data?.value ?? []));
  }
  return results;
}

function buildAzureSprint(iteration, workItems) {
  let committedPoints = 0;
  let completedPoints = 0;
  for (const wi of workItems) {
    const pts = wi.fields?.['Microsoft.VSTS.Scheduling.StoryPoints'] ?? 0;
    committedPoints += typeof pts === 'number' ? pts : 0;
    const state = String(wi.fields?.['System.State'] || '').toLowerCase();
    if (DONE_STATES.has(state)) completedPoints += typeof pts === 'number' ? pts : 0;
  }
  return {
    name: iteration.name || '',
    startDate: toYMD(iteration.attributes?.startDate),
    endDate: toYMD(iteration.attributes?.finishDate),
    committedPoints,
    completedPoints,
    scopeAddedPoints: 0,
    scopeRemovedPoints: 0,
    notes: '',
    memberCapacity: [],
  };
}

export async function syncAzureSprints(config) {
  if (!config?.organization || !config?.project || !config?.pat) {
    throw { type: 'auth', message: 'Azure organization, project, and PAT are required' };
  }
  const iterations = await fetchAzureIterations(config);
  if (!iterations.length) throw { type: 'empty', message: 'No iterations found for this project' };

  const results = [];
  for (const iter of iterations) {
    const relations = await fetchAzureWorkItems(config, iter.id);
    const ids = relations.map(r => r.target?.id).filter(Boolean);
    const workItems = await fetchWorkItemDetails(config, ids);
    results.push(buildAzureSprint(iter, workItems));
  }
  return results;
}

export { buildAzureSprint, fetchAzureIterations, fetchAzureWorkItems, fetchWorkItemDetails };
