import { describe, it, expect } from 'vitest';
import { buildBuddyContext } from './buddyContext';

function makeSprint(n, completed, committed = completed) {
  return {
    id: `s${n}`, name: `Sprint ${n}`,
    startDate: `2025-${String(n).padStart(2, '0')}-01`, endDate: `2025-${String(n).padStart(2, '0')}-14`,
    committedPoints: committed, completedPoints: completed,
    memberCapacity: [
      { memberId: 'm1', memberName: 'Alice', allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 },
      { memberId: 'm2', memberName: 'Bob',   allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 },
      { memberId: 'm3', memberName: 'Carol', allocation: 50,  ptoDays: 0, supportDays: 0, otherDays: 0 },
    ],
  };
}

const BASE_STATE = {
  teamMembers: [
    { id: 'm1', name: 'Alice', role: 'Developer' },
    { id: 'm2', name: 'Bob',   role: 'QA Engineer' },
    { id: 'm3', name: 'Carol', role: 'Designer' },
  ],
  sprints: Array.from({ length: 10 }, (_, i) => makeSprint(i + 1, 30 + i)),
  sprintDurationDays: 10,
  supportImpactFactor: 0.8,
};

describe('buildBuddyContext', () => {
  it('includes team member names and roles', () => {
    const ctx = buildBuddyContext(BASE_STATE);
    expect(ctx).toContain('Alice (Developer)');
    expect(ctx).toContain('Bob (QA Engineer)');
    expect(ctx).toContain('Carol (Designer)');
  });

  it('includes sprint names and point totals', () => {
    const ctx = buildBuddyContext(BASE_STATE);
    expect(ctx).toContain('Sprint 10');
    expect(ctx).toContain('completed: 39');
  });

  it('respects maxSprints option', () => {
    const ctx = buildBuddyContext(BASE_STATE, { maxSprints: 5 });
    expect(ctx).toContain('Sprint 10');
    expect(ctx).not.toContain('Sprint 5\n');
    expect(ctx).not.toContain('Sprint 4');
  });

  it('stays under 2000 tokens (approx chars/4)', () => {
    const ctx = buildBuddyContext(BASE_STATE);
    expect(ctx.length / 4).toBeLessThan(2000);
  });

  it('omits memberCapacity row arrays', () => {
    const ctx = buildBuddyContext(BASE_STATE);
    expect(ctx).not.toContain('memberId');
    expect(ctx).not.toContain('ptoDays');
    expect(ctx).not.toContain('supportDays');
  });

  it('handles empty state gracefully', () => {
    const ctx = buildBuddyContext({ teamMembers: [], sprints: [], sprintDurationDays: 10, supportImpactFactor: 0.8 });
    expect(ctx).toContain('0 members');
    expect(ctx).toContain('No sprints recorded yet.');
  });

  it('includes calculated velocity metrics', () => {
    const ctx = buildBuddyContext(BASE_STATE);
    expect(ctx).toContain('Average velocity:');
    expect(ctx).toContain('Weighted velocity');
    expect(ctx).toContain('Predictability:');
    expect(ctx).toContain('Trend');
  });
});
