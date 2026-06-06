import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncAzureSprints, buildAzureSprint } from './azureSync';

const config = {
  organization: 'my-org',
  project: 'my-project',
  pat: 'mypat123',
};

function mockFetch(...responses) {
  let call = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({ ok: true, status: 200, json: async () => r });
  });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('buildAzureSprint', () => {
  it('maps name, dates, and points correctly', () => {
    const iteration = {
      name: 'Sprint 1',
      attributes: { startDate: '2026-01-05T00:00:00Z', finishDate: '2026-01-16T00:00:00Z' },
    };
    const workItems = [
      { fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': 8, 'System.State': 'Closed' } },
      { fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': 5, 'System.State': 'Active' } },
      { fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': null, 'System.State': 'Done' } },
    ];
    const result = buildAzureSprint(iteration, workItems);
    expect(result.name).toBe('Sprint 1');
    expect(result.startDate).toBe('2026-01-05');
    expect(result.endDate).toBe('2026-01-16');
    expect(result.committedPoints).toBe(13);
    expect(result.completedPoints).toBe(8);
    expect(result.memberCapacity).toEqual([]);
  });

  it('treats Resolved and Done states as completed', () => {
    const iteration = { name: 'S', attributes: {} };
    const workItems = [
      { fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': 3, 'System.State': 'Resolved' } },
      { fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': 2, 'System.State': 'Done' } },
      { fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': 5, 'System.State': 'New' } },
    ];
    const result = buildAzureSprint(iteration, workItems);
    expect(result.committedPoints).toBe(10);
    expect(result.completedPoints).toBe(5);
  });
});

describe('syncAzureSprints', () => {
  it('throws auth error if config is incomplete', async () => {
    await expect(syncAzureSprints({})).rejects.toMatchObject({ type: 'auth' });
  });

  it('throws auth error on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(syncAzureSprints(config)).rejects.toMatchObject({ type: 'auth' });
  });

  it('throws cors error on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('CORS'));
    await expect(syncAzureSprints(config)).rejects.toMatchObject({ type: 'cors' });
  });

  it('throws empty error when no iterations found', async () => {
    mockFetch({ value: [] });
    await expect(syncAzureSprints(config)).rejects.toMatchObject({ type: 'empty' });
  });

  it('returns mapped sprints for a successful fetch', async () => {
    const iterationsResp = {
      value: [{
        id: 'iter-1',
        name: 'Sprint 1',
        attributes: { startDate: '2026-01-05', finishDate: '2026-01-16' },
      }],
    };
    const workItemRelationsResp = {
      workItemRelations: [{ target: { id: 101 } }, { target: { id: 102 } }],
    };
    const workItemDetailsResp = {
      value: [
        { fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': 8, 'System.State': 'Closed' } },
        { fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': 5, 'System.State': 'Active' } },
      ],
    };
    mockFetch(iterationsResp, workItemRelationsResp, workItemDetailsResp);
    const results = await syncAzureSprints(config);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Sprint 1');
    expect(results[0].committedPoints).toBe(13);
    expect(results[0].completedPoints).toBe(8);
  });
});
