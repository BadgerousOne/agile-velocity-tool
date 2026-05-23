import {
  calcAverageVelocity,
  calcWeightedVelocity,
  calcTrend,
  calcPredictability,
  calcCapacityUtilization,
} from './velocityCalc';

/**
 * Build a compact, token-efficient context string from app state for the Agent Buddy.
 * Omits full memberCapacity rows, release plans, integration credentials, and holiday lists.
 *
 * @param {AppState} state
 * @param {{ maxSprints?: number }} options
 * @returns {string}
 */
export function buildBuddyContext(state, { maxSprints = 10 } = {}) {
  const { teamMembers = [], sprints = [], sprintDurationDays = 10, supportImpactFactor = 0.8 } = state;

  const recentSprints    = sprints.slice(-maxSprints);
  const completedSprints = sprints.filter(s => (s.completedPoints || 0) > 0);

  const avgVel      = calcAverageVelocity(completedSprints);
  const weightedVel = calcWeightedVelocity(completedSprints);
  const trend       = calcTrend(completedSprints);
  const predict     = calcPredictability(completedSprints);

  const lastSprint = sprints[sprints.length - 1];
  const effectiveFTEs = lastSprint?.memberCapacity?.length
    ? parseFloat(lastSprint.memberCapacity.reduce((s, r) => s + (r.allocation ?? 100) / 100, 0).toFixed(2))
    : teamMembers.length;

  const lines = [];

  lines.push(`Team: ${teamMembers.length} member${teamMembers.length !== 1 ? 's' : ''} — ${
    teamMembers.map(m => `${m.name} (${m.role})`).join(', ') || 'none'
  }`);
  lines.push(`Sprint duration: ${sprintDurationDays} working days`);
  lines.push(`Total sprints on record: ${sprints.length}${sprints.length > maxSprints ? ` (showing last ${recentSprints.length})` : ''}`);
  lines.push('');
  lines.push('Sprint history:');

  if (recentSprints.length === 0) {
    lines.push('  No sprints recorded yet.');
  } else {
    recentSprints.forEach(s => {
      const util = s.memberCapacity?.length
        ? calcCapacityUtilization(s.memberCapacity, sprintDurationDays, supportImpactFactor)
        : null;
      const utilStr  = util != null ? ` | utilization: ${util}%` : '';
      const dateStr  = s.startDate && s.endDate ? ` | ${s.startDate} → ${s.endDate}` : '';
      lines.push(`  ${s.name}${dateStr} | committed: ${s.committedPoints ?? 0} | completed: ${s.completedPoints ?? 0}${utilStr}`);
    });
  }

  lines.push('');
  lines.push('Velocity metrics:');
  lines.push(`  Average velocity:           ${avgVel} pts/sprint`);
  lines.push(`  Weighted velocity (recent):  ${weightedVel} pts/sprint`);
  lines.push(`  Predictability:              ${predict}%`);
  lines.push(`  Trend (last 3 sprints):      ${trend}`);
  lines.push(`  Effective FTEs (latest):     ${effectiveFTEs}`);

  return lines.join('\n');
}
