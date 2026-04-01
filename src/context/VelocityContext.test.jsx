import { reducer } from './VelocityContext';

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
});

