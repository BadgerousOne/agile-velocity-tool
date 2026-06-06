import { reducer, computeNewSprintDefaults } from './VelocityContext';

const baseState = {
  regions: [{ id: 'r1', name: 'US' }],
  holidays: [],
  teamMembers: [{ id: 'm1', name: 'Alice', role: 'Developer', regionId: 'r1' }],
  sprints: [{ id: 's1', name: 'Sprint 1', memberCapacity: [{ memberId: 'm1', memberName: 'Alice', allocation: 100 }] }],
  sprintDurationDays: 14,
  supportImpactFactor: 0.8,
  sprintStartDay: 1,
  activeTab: 'dashboard',
  chatHistory: [],
  releasePlans: [],
  integrations: {
    jira: { connected: false, mappings: { sprint: 'Sprint', points: 'Story Points', status: 'Status' } },
    azure: { connected: false, mappings: { sprint: 'Iteration Path', points: 'Story Points', status: 'State' } },
  },
  aiActionAudit: [],
  schemaVersion: 2,
};

describe('velocity reducer', () => {
  it('sanitizes malformed LOAD_STATE payloads', () => {
    const next = reducer(baseState, {
      type: 'LOAD_STATE',
      payload: {
        teamMembers: null,
        sprints: [{ id: 's2', name: 'Sprint 2', memberCapacity: null }],
        sprintDurationDays: 999,
      },
    });

    expect(next.teamMembers).toEqual(baseState.teamMembers);
    expect(next.sprints[0].memberCapacity).toEqual([]);
    expect(next.sprintDurationDays).toBe(30);
  });

  it('updates member name in sprint capacity rows', () => {
    const next = reducer(baseState, {
      type: 'UPDATE_MEMBER',
      id: 'm1',
      data: { name: 'Alice Updated' },
    });

    expect(next.teamMembers[0].name).toBe('Alice Updated');
    expect(next.sprints[0].memberCapacity[0].memberName).toBe('Alice Updated');
  });

  it('removes member from team and all sprint rows', () => {
    const next = reducer(baseState, { type: 'REMOVE_MEMBER', id: 'm1' });
    expect(next.teamMembers).toHaveLength(0);
    expect(next.sprints[0].memberCapacity).toHaveLength(0);
  });

  it('recalculates holiday days while preserving manual PTO additions', () => {
    const state = {
      ...baseState,
      holidays: [{ id: 'h1', regionId: 'r1', name: 'Holiday', date: '2026-01-07' }],
      sprints: [{
        id: 's1',
        name: 'Sprint 1',
        startDate: '2026-01-05',
        endDate: '2026-01-18',
        memberCapacity: [{
          memberId: 'm1',
          memberName: 'Alice',
          allocation: 100,
          ptoDays: 3,
          holidayDays: 1,
          holidayNames: ['Old Holiday'],
          supportDays: 0,
          otherDays: 0,
          otherLabel: '',
        }],
      }],
    };

    const next = reducer(state, { type: 'RECALC_SPRINT_HOLIDAYS', sprintId: 's1' });
    expect(next.sprints[0].memberCapacity[0].holidayDays).toBe(1);
    expect(next.sprints[0].memberCapacity[0].holidayNames).toEqual(['Holiday']);
    expect(next.sprints[0].memberCapacity[0].ptoDays).toBe(3);
  });

  it('adds a sprint carrying forward allocation and resetting interruption fields', () => {
    const state = {
      ...baseState,
      sprints: [{
        id: 's1',
        name: 'Sprint 1',
        startDate: '2026-01-05',
        endDate: '2026-01-18',
        committedPoints: 20,
        completedPoints: 16,
        memberCapacity: [{
          memberId: 'm1',
          memberName: 'Alice',
          allocation: 75,
          ptoDays: 2,
          holidayDays: 1,
          holidayNames: ['Old Holiday'],
          supportDays: 1,
          otherDays: 1,
          otherLabel: 'Training',
        }],
      }],
    };

    const next = reducer(state, { type: 'ADD_SPRINT' });
    expect(next.sprints).toHaveLength(2);
    const added = next.sprints[1];
    expect(added.memberCapacity[0].allocation).toBe(75);
    expect(added.memberCapacity[0].supportDays).toBe(0);
    expect(added.memberCapacity[0].otherDays).toBe(0);
    expect(added.memberCapacity[0].otherLabel).toBe('');
    expect(added.memberCapacity[0].ptoDays).toBe(0);
    expect(added.suggestedCommittedPoints).toBe(16);
  });

  it('adds and updates release plans', () => {
    const added = reducer(baseState, { type: 'ADD_RELEASE' });
    expect(added.releasePlans.length).toBe(1);
    expect(added.releasePlans[0].milestones.length).toBe(1);
    const id = added.releasePlans[0].id;
    const updated = reducer(added, { type: 'UPDATE_RELEASE', id, data: { name: 'Release 2', backlogPoints: 220 } });
    expect(updated.releasePlans[0].name).toBe('Release 2');
    expect(updated.releasePlans[0].backlogPoints).toBe(220);
  });

  it('adds, updates, and removes release milestones', () => {
    const withRelease = {
      ...baseState,
      releasePlans: [{ id: 'r1', name: 'Release 1', backlogPoints: 100, targetDate: '', notes: '', milestones: [] }],
    };

    const added = reducer(withRelease, { type: 'ADD_RELEASE_MILESTONE', releaseId: 'r1' });
    expect(added.releasePlans[0].milestones).toHaveLength(1);

    const milestoneId = added.releasePlans[0].milestones[0].id;
    const updated = reducer(added, {
      type: 'UPDATE_RELEASE_MILESTONE',
      releaseId: 'r1',
      milestoneId,
      data: { name: 'QA Sign-off', status: 'on_track' },
    });

    expect(updated.releasePlans[0].milestones[0].name).toBe('QA Sign-off');
    expect(updated.releasePlans[0].milestones[0].status).toBe('on_track');

    const removed = reducer(updated, { type: 'REMOVE_RELEASE_MILESTONE', releaseId: 'r1', milestoneId });
    expect(removed.releasePlans[0].milestones).toHaveLength(0);
  });

  it('removes dependency links when a milestone is deleted', () => {
    const state = {
      ...baseState,
      releasePlans: [{
        id: 'r1',
        name: 'Release 1',
        backlogPoints: 100,
        targetDate: '',
        notes: '',
        milestones: [
          { id: 'ms1', name: 'Prod', status: 'not_started', dependsOnMilestoneIds: ['ms2'] },
          { id: 'ms2', name: 'QA', status: 'not_started', dependsOnMilestoneIds: [] },
        ],
      }],
    };

    const next = reducer(state, { type: 'REMOVE_RELEASE_MILESTONE', releaseId: 'r1', milestoneId: 'ms2' });
    expect(next.releasePlans[0].milestones).toHaveLength(1);
    expect(next.releasePlans[0].milestones[0].dependsOnMilestoneIds).toEqual([]);
  });

  it('clones a sprint with reset interruption fields and new dates', () => {
    const state = {
      ...baseState,
      sprints: [{
        id: 's1',
        name: 'Sprint 1',
        startDate: '2026-01-05',
        endDate: '2026-01-18',
        committedPoints: 40,
        completedPoints: 38,
        scopeAddedPoints: 2,
        scopeRemovedPoints: 0,
        notes: 'Old notes',
        memberCapacity: [{
          memberId: 'm1',
          memberName: 'Alice',
          allocation: 75,
          ptoDays: 3,
          holidayDays: 1,
          holidayNames: ['Holiday'],
          supportDays: 2,
          otherDays: 1,
          otherLabel: 'Training',
        }],
      }],
    };

    const next = reducer(state, { type: 'CLONE_SPRINT', id: 's1' });
    expect(next.sprints).toHaveLength(2);
    const clone = next.sprints[1];

    // Allocation should be carried forward
    expect(clone.memberCapacity[0].allocation).toBe(75);
    // Interruption fields should be reset
    expect(clone.memberCapacity[0].supportDays).toBe(0);
    expect(clone.memberCapacity[0].otherDays).toBe(0);
    expect(clone.memberCapacity[0].otherLabel).toBe('');
    // Points should be reset
    expect(clone.completedPoints).toBe(0);
    expect(clone.scopeAddedPoints).toBe(0);
    expect(clone.notes).toBe('');
    // Dates should advance
    expect(clone.startDate).toBe('2026-01-18');
    expect(clone.id).not.toBe('s1');
  });

  it('applies bulk day off to all members in a sprint', () => {
    const state = {
      ...baseState,
      sprints: [{
        id: 's1',
        name: 'Sprint 1',
        memberCapacity: [
          { memberId: 'm1', memberName: 'Alice', allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0, otherLabel: '' },
          { memberId: 'm2', memberName: 'Bob', allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 2, otherLabel: 'On-call' },
        ],
      }],
    };

    const next = reducer(state, { type: 'BULK_TEAM_DAY_OFF', sprintId: 's1', days: 1 });
    expect(next.sprints[0].memberCapacity[0].otherDays).toBe(1);
    expect(next.sprints[0].memberCapacity[0].otherLabel).toBe('Team Day Off');
    expect(next.sprints[0].memberCapacity[1].otherDays).toBe(3);
    // Pre-existing label is preserved for members who already had a label
    expect(next.sprints[0].memberCapacity[1].otherLabel).toBe('On-call');
  });

  it('moves an incomplete sprint up and down with MOVE_SPRINT', () => {
    const state = {
      ...baseState,
      sprints: [
        { id: 's1', name: 'Sprint 1', startDate: '2026-01-05', endDate: '2026-01-18', committedPoints: 40, completedPoints: 0, memberCapacity: [] },
        { id: 's2', name: 'Sprint 2', startDate: '2026-01-19', endDate: '2026-02-01', committedPoints: 40, completedPoints: 0, memberCapacity: [] },
        { id: 's3', name: 'Sprint 3', startDate: '2026-02-02', endDate: '2026-02-15', committedPoints: 40, completedPoints: 0, memberCapacity: [] },
      ],
    };

    // Move s2 up → [s2, s1, s3]
    const movedUp = reducer(state, { type: 'MOVE_SPRINT', id: 's2', direction: 'up' });
    expect(movedUp.sprints.map(s => s.id)).toEqual(['s2', 's1', 's3']);

    // Move s2 down → [s1, s3, s2]
    const movedDown = reducer(state, { type: 'MOVE_SPRINT', id: 's2', direction: 'down' });
    expect(movedDown.sprints.map(s => s.id)).toEqual(['s1', 's3', 's2']);
  });

  it('does not move a complete sprint and does not move past a complete sprint', () => {
    const state = {
      ...baseState,
      sprints: [
        { id: 's1', name: 'Sprint 1', startDate: '2026-01-05', endDate: '2026-01-18', committedPoints: 40, completedPoints: 40, memberCapacity: [] },
        { id: 's2', name: 'Sprint 2', startDate: '2026-01-19', endDate: '2026-02-01', committedPoints: 40, completedPoints: 0,  memberCapacity: [] },
      ],
    };

    // s2 (incomplete) cannot move up past s1 (complete)
    const blocked = reducer(state, { type: 'MOVE_SPRINT', id: 's2', direction: 'up' });
    expect(blocked.sprints.map(s => s.id)).toEqual(['s1', 's2']);

    // s1 (complete) cannot be moved at all
    const locked = reducer(state, { type: 'MOVE_SPRINT', id: 's1', direction: 'down' });
    expect(locked.sprints.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('recalculates holidays for all sprints on RECALC_ALL_SPRINT_HOLIDAYS', () => {
    const state = {
      ...baseState,
      holidays: [{ id: 'h1', regionId: 'r1', name: 'Holiday', date: '2026-01-07' }],
      sprints: [
        {
          id: 's1',
          name: 'Sprint 1',
          startDate: '2026-01-05',
          endDate: '2026-01-18',
          memberCapacity: [{
            memberId: 'm1', memberName: 'Alice', allocation: 100,
            ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '',
          }],
        },
        {
          id: 's2',
          name: 'Sprint 2',
          startDate: '2026-01-19',
          endDate: '2026-02-01',
          memberCapacity: [{
            memberId: 'm1', memberName: 'Alice', allocation: 100,
            ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '',
          }],
        },
      ],
    };

    const next = reducer(state, { type: 'RECALC_ALL_SPRINT_HOLIDAYS' });
    // Sprint 1 contains 2026-01-07 (Wednesday) — should fill 1 holiday day
    expect(next.sprints[0].memberCapacity[0].holidayDays).toBe(1);
    expect(next.sprints[0].memberCapacity[0].ptoDays).toBe(1);
    // Sprint 2 does not contain 2026-01-07 — should be 0
    expect(next.sprints[1].memberCapacity[0].holidayDays).toBe(0);
  });

  it('updates integration mapping and appends AI action audit entries', () => {
    const mapped = reducer(baseState, {
      type: 'UPDATE_INTEGRATION_MAPPING',
      provider: 'jira',
      field: 'points',
      value: 'SP',
    });
    expect(mapped.integrations.jira.mappings.points).toBe('SP');

    const audited = reducer(mapped, {
      type: 'ADD_AI_ACTION_AUDIT',
      entry: { action: 'add_sprint', status: 'applied', details: 'Created sprint' },
    });
    expect(audited.aiActionAudit.length).toBe(1);
    expect(audited.aiActionAudit[0].action).toBe('add_sprint');
  });

  it('ADD_SPRINT does not allow overrides to replace the generated UUID', () => {
    const next = reducer(baseState, { type: 'ADD_SPRINT', overrides: { id: 'custom-id' } });
    expect(next.sprints[next.sprints.length - 1].id).not.toBe('custom-id');
    expect(next.sprints[next.sprints.length - 1].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

});

describe('computeNewSprintDefaults', () => {
  const emptyState = {
    regions: [],
    holidays: [],
    teamMembers: [],
    sprints: [],
    sprintDurationDays: 10,
    supportImpactFactor: 0.8,
  };

  it('returns empty dates and empty memberCapacity when there are no sprints', () => {
    const defaults = computeNewSprintDefaults(emptyState);
    expect(defaults.startDate).toBe('');
    expect(defaults.endDate).toBe('');
    expect(defaults.memberCapacity).toEqual([]);
    expect(defaults.committedPoints).toBe(0);
    expect(defaults.completedPoints).toBe(0);
  });

  it('seeds memberCapacity from teamMembers when there is no previous sprint', () => {
    const state = {
      ...emptyState,
      teamMembers: [
        { id: 'm1', name: 'Alice', role: 'Developer', regionId: null },
        { id: 'm2', name: 'Bob',   role: 'QA',        regionId: null },
      ],
    };
    const defaults = computeNewSprintDefaults(state);
    expect(defaults.memberCapacity).toHaveLength(2);
    expect(defaults.memberCapacity[0].memberId).toBe('m1');
    expect(defaults.memberCapacity[1].memberId).toBe('m2');
    expect(defaults.memberCapacity[0].supportDays).toBe(0);
    expect(defaults.memberCapacity[0].otherDays).toBe(0);
  });

  it('carries forward allocation and resets interruption fields from last sprint', () => {
    const state = {
      ...emptyState,
      teamMembers: [{ id: 'm1', name: 'Alice', role: 'Developer', regionId: null }],
      sprints: [{
        id: 's1', name: 'Sprint 1',
        startDate: '2026-01-05', endDate: '2026-01-18',
        committedPoints: 20, completedPoints: 18,
        memberCapacity: [{
          memberId: 'm1', memberName: 'Alice',
          allocation: 75, ptoDays: 2, holidayDays: 0, holidayNames: [],
          supportDays: 1, otherDays: 1, otherLabel: 'Training',
        }],
      }],
    };
    const defaults = computeNewSprintDefaults(state);
    expect(defaults.memberCapacity[0].allocation).toBe(75);
    expect(defaults.memberCapacity[0].supportDays).toBe(0);
    expect(defaults.memberCapacity[0].otherDays).toBe(0);
    expect(defaults.memberCapacity[0].otherLabel).toBe('');
  });

  it('includes new team members not in the last sprint', () => {
    const state = {
      ...emptyState,
      teamMembers: [
        { id: 'm1', name: 'Alice', role: 'Developer', regionId: null },
        { id: 'm2', name: 'Bob',   role: 'QA',        regionId: null },
      ],
      sprints: [{
        id: 's1', name: 'Sprint 1',
        startDate: '2026-01-05', endDate: '2026-01-18',
        committedPoints: 20, completedPoints: 18,
        memberCapacity: [
          { memberId: 'm1', memberName: 'Alice', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        ],
      }],
    };
    const defaults = computeNewSprintDefaults(state);
    const ids = defaults.memberCapacity.map(r => r.memberId);
    expect(ids).toContain('m1');
    expect(ids).toContain('m2');
  });

  it('calculates suggestedCommittedPoints using recency-weighted velocity', () => {
    const state = {
      ...emptyState,
      teamMembers: [{ id: 'm1', name: 'Alice', role: 'Developer', regionId: null }],
      sprints: [
        { id: 's1', name: 'Sprint 1', startDate: '2026-01-05', endDate: '2026-01-18', committedPoints: 10, completedPoints: 10, memberCapacity: [{ memberId: 'm1', memberName: 'Alice', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' }] },
        { id: 's2', name: 'Sprint 2', startDate: '2026-01-19', endDate: '2026-02-01', committedPoints: 20, completedPoints: 20, memberCapacity: [{ memberId: 'm1', memberName: 'Alice', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' }] },
      ],
    };
    // Weighted: s1 weight=1 (10pts), s2 weight=2 (20pts) → (10+40)/3 = 16.67 → round = 17
    const defaults = computeNewSprintDefaults(state);
    expect(defaults.committedPoints).toBe(17);
    expect(defaults.suggestedCommittedPoints).toBe(17);
  });

  it('returns name Sprint N where N = sprints.length + 1', () => {
    const state = { ...emptyState, sprints: [{ id: 's1', name: 'Sprint 1', memberCapacity: [] }] };
    const defaults = computeNewSprintDefaults(state);
    expect(defaults.name).toBe('Sprint 2');
  });
});

