import {
  CURRENT_SCHEMA_VERSION,
  extractStateEnvelope,
  migrateStateBySchema,
  sanitizeImportedState,
  validateImportedState,
} from './stateSchema';

describe('state schema utils', () => {
  it('extracts wrapped export envelopes', () => {
	const raw = {
	  schemaVersion: 2,
	  exportedAt: '2026-04-01T00:00:00.000Z',
	  state: { teamMembers: [] },
	};

	const result = extractStateEnvelope(raw);
	expect(result.schemaVersion).toBe(2);
	expect(result.state).toEqual({ teamMembers: [] });
  });

  it('supports legacy root-state imports', () => {
	const result = extractStateEnvelope({ schemaVersion: 1, teamMembers: [] });
	expect(result.schemaVersion).toBe(1);
	expect(result.state.teamMembers).toEqual([]);
  });

  it('migrates to current schema version', () => {
	const migrated = migrateStateBySchema({ sprints: [{ id: 's1', memberCapacity: null }] }, 1);
	expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
	expect(migrated.state.sprintStartDay).toBe(1);
	expect(migrated.state.chatHistory).toEqual([]);
	expect(migrated.state.sprints[0].memberCapacity).toEqual([]);
  });

  it('sanitizes and clamps imported numeric settings', () => {
	const fallback = {
	  teamMembers: [],
	  sprints: [],
	  regions: [],
	  holidays: [],
	  releasePlans: [],
	  chatHistory: [],
	  sprintDurationDays: 14,
	  supportImpactFactor: 0.8,
	  sprintStartDay: 1,
	};

	const sanitized = sanitizeImportedState(
	  {
		sprintDurationDays: 999,
		supportImpactFactor: -5,
		sprintStartDay: 999,
	  },
	  fallback
	);

	expect(sanitized.sprintDurationDays).toBe(30);
	expect(sanitized.supportImpactFactor).toBe(0);
	expect(sanitized.sprintStartDay).toBe(6);
	expect(sanitized.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('sanitizes release milestones on import', () => {
	const fallback = {
	  teamMembers: [],
	  sprints: [],
	  regions: [],
	  holidays: [],
	  releasePlans: [],
	  chatHistory: [],
	  sprintDurationDays: 14,
	  supportImpactFactor: 0.8,
	  sprintStartDay: 1,
	};

	const sanitized = sanitizeImportedState(
	  {
		releasePlans: [{
		  id: 'r1',
		  milestones: [
			{ id: 'ms1', status: 'unexpected_status', dependsOnMilestoneIds: ['ms2', ''] },
			{ id: 'ms2', status: 'on_track', dependsOnMilestoneIds: ['ms2'] },
		  ],
		}],
	  },
	  fallback
	);

	expect(sanitized.releasePlans[0].milestones[0].status).toBe('not_started');
	expect(sanitized.releasePlans[0].milestones[0].dependsOnMilestoneIds).toEqual(['ms2']);
	expect(sanitized.releasePlans[0].milestones[1].dependsOnMilestoneIds).toEqual([]);
  });

  it('throws actionable validation errors for malformed imports', () => {
	expect(() =>
	  validateImportedState({
		teamMembers: [{ id: '' }],
		sprints: [{ id: 's1', memberCapacity: [{ memberId: 'm1', allocation: 300 }] }],
		releasePlans: [{ id: 'r1', milestones: [{ id: 'ms1', dependsOnMilestoneIds: [123] }] }],
	  })
	).toThrow(/Import validation failed:/);
  });

  it('strips HTML from free-text fields on import', () => {
    const fallback = {
      teamMembers: [],
      sprints: [],
      regions: [],
      holidays: [],
      releasePlans: [],
      chatHistory: [],
      sprintDurationDays: 14,
      supportImpactFactor: 0.8,
      sprintStartDay: 1,
    };

    const sanitized = sanitizeImportedState(
      {
        teamMembers: [{ id: 'm1', name: '<script>alert(1)</script>Alice', role: '<b>Developer</b>' }],
        sprints: [{
          id: 's1',
          name: '<img src=x onerror=alert(1)>Sprint 1',
          notes: '<a href="javascript:void(0)">notes</a>',
          memberCapacity: [{
            memberId: 'm1',
            memberName: '<em>Alice</em>',
            otherLabel: '<b>Training</b>',
            allocation: 100,
          }],
        }],
        regions: [{ id: 'r1', name: '<b>US</b>' }],
        holidays: [{ id: 'h1', regionId: 'r1', name: '<i>Christmas</i>', date: '2026-12-25' }],
        releasePlans: [{
          id: 'r1',
          name: '<script>xss()</script>MVP',
          notes: '<b>bold</b>',
          milestones: [{ id: 'ms1', name: '<em>Production</em>', gate: '<b>gate</b>', notes: '<i>note</i>' }],
        }],
      },
      fallback
    );

    expect(sanitized.teamMembers[0].name).toBe('Alice');
    expect(sanitized.teamMembers[0].role).toBe('Developer');
    expect(sanitized.sprints[0].name).toBe('Sprint 1');
    expect(sanitized.sprints[0].notes).toBe('notes');
    expect(sanitized.sprints[0].memberCapacity[0].memberName).toBe('Alice');
    expect(sanitized.sprints[0].memberCapacity[0].otherLabel).toBe('Training');
    expect(sanitized.regions[0].name).toBe('US');
    expect(sanitized.holidays[0].name).toBe('Christmas');
    expect(sanitized.releasePlans[0].name).toBe('MVP');
    expect(sanitized.releasePlans[0].notes).toBe('bold');
    expect(sanitized.releasePlans[0].milestones[0].name).toBe('Production');
    expect(sanitized.releasePlans[0].milestones[0].gate).toBe('gate');
  });

  it('accepts a valid minimal import payload', () => {
	expect(() =>
	  validateImportedState({
		teamMembers: [{ id: 'm1', name: 'Alice', role: 'Developer' }],
		sprints: [{
		  id: 's1',
		  name: 'Sprint 1',
		  startDate: '2026-01-01',
		  endDate: '2026-01-14',
		  committedPoints: 20,
		  completedPoints: 18,
		  memberCapacity: [{ memberId: 'm1', allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 }],
		}],
		releasePlans: [{
		  id: 'r1',
		  name: 'Release 1',
		  milestones: [{ id: 'ms1', name: 'Production', targetDate: '2026-05-01', status: 'on_track' }],
		}],
	  })
	).not.toThrow();
  });
});

