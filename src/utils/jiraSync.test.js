import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncJiraSprints, buildJiraSprint } from './jiraSync';

const config = {
  baseUrl: 'https://example.atlassian.net',
  projectKey: 'ABC',
  username: 'user@example.com',
  token: 'token123',
};

function mockFetch(...responses) {
  let call = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({ ok: true, status: 200, json: async () => r });
  });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('buildJiraSprint', () => {
  it('maps name, dates, and points correctly', () => {
    const sprint = { name: 'Sprint 1', startDate: '2026-01-05T00:00:00.000Z', endDate: '2026-01-16T00:00:00.000Z' };
    const issues = [
      { fields: { story_points: 5, status: { statusCategory: { key: 'done' } } } },
      { fields: { story_points: 3, status: { statusCategory: { key: 'indeterminate' } } } },
      { fields: { story_points: null, status: { statusCategory: { key: 'done' } } } },
    ];
    const sprint_result = buildJiraSprint(sprint, issues);
    expect(sprint_result.name).toBe('Sprint 1');
    expect(sprint_result.startDate).toBe('2026-01-05');
    expect(sprint_result.endDate).toBe('2026-01-16');
    expect(sprint_result.committedPoints).toBe(8);
    expect(sprint_result.completedPoints).toBe(5);
    expect(sprint_result.memberCapacity).toEqual([]);
  });

  it('falls back to customfield_10016 for story points', () => {
    const sprint = { name: 'Sprint 2', startDate: '2026-01-19', endDate: '2026-01-30' };
    const issues = [
      { fields: { customfield_10016: 8, status: { statusCategory: { key: 'done' } } } },
    ];
    const result = buildJiraSprint(sprint, issues);
    expect(result.committedPoints).toBe(8);
    expect(result.completedPoints).toBe(8);
  });
});

describe('syncJiraSprints', () => {
  it('throws auth error if config is incomplete', async () => {
    await expect(syncJiraSprints({})).rejects.toMatchObject({ type: 'auth' });
  });

  it('throws auth error on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(syncJiraSprints(config)).rejects.toMatchObject({ type: 'auth' });
  });

  it('throws cors error on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    await expect(syncJiraSprints(config)).rejects.toMatchObject({ type: 'cors' });
  });

  it('throws empty error when no boards found', async () => {
    mockFetch({ values: [] });
    await expect(syncJiraSprints(config)).rejects.toMatchObject({ type: 'empty' });
  });

  it('throws empty error when no sprints found', async () => {
    mockFetch({ values: [{ id: 1 }] }, { values: [] });
    await expect(syncJiraSprints(config)).rejects.toMatchObject({ type: 'empty' });
  });

  it('returns mapped sprints for a successful fetch', async () => {
    const boardsResp = { values: [{ id: 42 }] };
    const sprintsResp = {
      values: [
        { id: 1, name: 'Sprint 1', startDate: '2026-01-05', endDate: '2026-01-16' },
      ],
    };
    const issuesResp = {
      issues: [
        { fields: { story_points: 10, status: { statusCategory: { key: 'done' } } } },
        { fields: { story_points: 5, status: { statusCategory: { key: 'indeterminate' } } } },
      ],
    };
    mockFetch(boardsResp, sprintsResp, issuesResp);
    const results = await syncJiraSprints(config);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Sprint 1');
    expect(results[0].committedPoints).toBe(15);
    expect(results[0].completedPoints).toBe(10);
  });
});
