import { aggregateCapacity } from '../context/VelocityContext';

/**
 * Calculate the total effective person-days for a sprint.
 *
 * Formula per member:
 *   effectiveDays = max(0, (allocation/100 × sprintDays) − ptoDays − (supportDays × (1 − supportImpactFactor)) − otherDays)
 *
 * @param {MemberCapacityRow[]} memberCapacity
 * @param {number} sprintDays - Total working days in the sprint (from settings)
 * @param {number} supportImpactFactor - 0–1. Fraction of capacity retained on support days (e.g. 0.8 = 20% cost)
 * @returns {number} Total effective person-days across the whole team
 */
export function calcEffectiveCapacity(memberCapacity = [], sprintDays = 14, supportImpactFactor = 0.8) {
  return memberCapacity.reduce((total, r) => {
    const alloc        = (r.allocation ?? 100) / 100;
    const rawDays      = alloc * sprintDays;
    const ptoImpact    = r.ptoDays    || 0;
    const supportImpact = (r.supportDays || 0) * (1 - supportImpactFactor);
    const otherImpact  = r.otherDays  || 0;
    const effective    = Math.max(0, rawDays - ptoImpact - supportImpact - otherImpact);
    return total + effective;
  }, 0);
}

/**
 * Calculate the allocation-adjusted maximum person-days with zero interruptions.
 * Used as the denominator when computing capacity utilization and adjusted velocity.
 *
 * Formula per member: (allocation/100) × sprintDays
 *
 * @param {MemberCapacityRow[]} memberCapacity
 * @param {number} sprintDays
 * @returns {number} Total full-capacity person-days across the team
 */
export function calcFullCapacity(memberCapacity = [], sprintDays = 14) {
  return memberCapacity.reduce((total, r) => {
    const alloc = (r.allocation ?? 100) / 100;
    return total + alloc * sprintDays;
  }, 0);
}

/**
 * Calculate what percentage of the team's full (allocation-adjusted) capacity
 * was unaffected by PTO, support, or other interruptions.
 *
 * 100% = no interruptions at all. Lower = more time lost.
 *
 * @param {MemberCapacityRow[]} memberCapacity
 * @param {number} sprintDays
 * @param {number} supportImpactFactor
 * @returns {number} Utilization percentage (0–100)
 */
export function calcCapacityUtilization(memberCapacity = [], sprintDays = 14, supportImpactFactor = 0.8) {
  const full      = calcFullCapacity(memberCapacity, sprintDays);
  const effective = calcEffectiveCapacity(memberCapacity, sprintDays, supportImpactFactor);
  if (!full) return 100;
  return parseFloat(((effective / full) * 100).toFixed(1));
}

/**
 * Extrapolate what velocity WOULD have been if the team had run at full capacity
 * every sprint. Useful for separating "team is slow" from "team was interrupted".
 *
 * Formula per sprint: (completedPoints / effectiveDays) × fullDays
 * Returns the average of these adjusted values across all valid sprints.
 *
 * @param {Sprint[]} sprints
 * @param {number} sprintDays
 * @param {number} supportImpactFactor
 * @returns {number|null} Adjusted velocity in points/sprint, or null if no data
 */
export function calcCapacityAdjustedVelocity(sprints, sprintDays = 14, supportImpactFactor = 0.8) {
  const valid = sprints.filter(s => s.memberCapacity && s.memberCapacity.length > 0 && s.completedPoints > 0);
  if (!valid.length) return null;

  const ratios = valid.map(s => {
    const effective = calcEffectiveCapacity(s.memberCapacity, sprintDays, supportImpactFactor);
    const full      = calcFullCapacity(s.memberCapacity, sprintDays);
    if (!effective || !full) return s.completedPoints;
    // Scale completed points up to what full capacity would yield
    return (s.completedPoints / effective) * full;
  });

  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return parseFloat(avg.toFixed(1));
}

/**
 * Get the effective FTE count from the most recent sprint's memberCapacity.
 * e.g. 3 members at 100/80/50% allocation = 2.30 FTEs
 *
 * @param {Sprint[]} sprints
 * @returns {number|null} Effective FTEs rounded to 2dp, or null if no sprint data
 */
export function getLatestEffectiveFTEs(sprints) {
  const last = sprints[sprints.length - 1];
  if (!last?.memberCapacity?.length) return null;
  return parseFloat(
    last.memberCapacity.reduce((s, r) => s + (r.allocation ?? 100) / 100, 0).toFixed(2)
  );
}

/**
 * Resolve aggregate capacity totals from a sprint, supporting both the
 * current per-member model and the legacy flat-field model.
 *
 * @param {Sprint} sprint
 * @returns {{ ptoDays: number, supportDays: number, otherDays: number, effectiveFTEs: number|null }}
 */
export function sprintCapacityTotals(sprint) {
  if (sprint.memberCapacity && sprint.memberCapacity.length > 0) {
    const agg = aggregateCapacity(sprint.memberCapacity);
    const effectiveFTEs = parseFloat(
      (sprint.memberCapacity.reduce((s, r) => s + (r.allocation ?? 100) / 100, 0)).toFixed(2)
    );
    return { ...agg, effectiveFTEs };
  }
  // legacy fallback
  return { ptoDays: sprint.ptoDays || 0, supportDays: sprint.supportDays || 0, otherDays: 0, effectiveFTEs: null };
}

/**
 * Simple mean of completedPoints across all sprints.
 *
 * @param {Sprint[]} sprints
 * @returns {number}
 */
export function calcAverageVelocity(sprints) {
  if (!sprints.length) return 0;
  const sum = sprints.reduce((acc, s) => acc + (s.completedPoints || 0), 0);
  return parseFloat((sum / sprints.length).toFixed(1));
}

/**
 * Recency-weighted mean velocity. Sprint at index i gets weight (i+1),
 * so the most recent sprint has the highest influence.
 *
 * @param {Sprint[]} sprints
 * @returns {number}
 */
export function calcWeightedVelocity(sprints) {
  if (!sprints.length) return 0;
  let weightSum = 0;
  let valueSum = 0;
  sprints.forEach((s, i) => {
    const weight = i + 1;
    weightSum += weight;
    valueSum += (s.completedPoints || 0) * weight;
  });
  return parseFloat((valueSum / weightSum).toFixed(1));
}

/**
 * Determine velocity trend direction from the last 3 sprints.
 *
 * @param {Sprint[]} sprints
 * @returns {'up' | 'down' | 'neutral'}
 */
export function calcTrend(sprints) {
  if (sprints.length < 2) return 'neutral';
  const recent = sprints.slice(-3);
  const first  = recent[0].completedPoints || 0;
  const last   = recent[recent.length - 1].completedPoints || 0;
  const delta  = last - first;
  if (delta > 2)  return 'up';
  if (delta < -2) return 'down';
  return 'neutral';
}

/**
 * Calculate commitment predictability — the average rate at which the team
 * delivered what they committed to, capped at 100% per sprint.
 *
 * @param {Sprint[]} sprints
 * @returns {number} Percentage 0–100
 */
export function calcPredictability(sprints) {
  const valid = sprints.filter(s => s.committedPoints > 0);
  if (!valid.length) return 0;
  const rates = valid.map(s => Math.min(1, s.completedPoints / s.committedPoints));
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  return parseFloat((avg * 100).toFixed(1));
}

/**
 * Estimate how many sprints are needed to clear a backlog at current weighted velocity.
 *
 * @param {number} backlogPoints
 * @param {Sprint[]} sprints
 * @returns {number|null} Sprint count, or null if velocity is zero
 */
export function forecastSprints(backlogPoints, sprints) {
  const vel = calcWeightedVelocity(sprints);
  if (!vel) return null;
  return Math.ceil(backlogPoints / vel);
}

/**
 * Build the per-sprint data array used by all Recharts charts.
 * Each entry includes: name, committed, completed, rollingAvg,
 * ptoDays, supportDays, otherDays, effectiveFTEs, effectiveDays,
 * fullDays, utilization, adjVelocity.
 *
 * @param {Sprint[]} sprints
 * @param {number} sprintDays
 * @param {number} supportImpactFactor
 * @returns {object[]}
 */
export function buildChartData(sprints, sprintDays = 14, supportImpactFactor = 0.8) {
  return sprints.map((s, i) => {
    const window     = sprints.slice(0, i + 1);
    const rollingAvg = calcAverageVelocity(window);
    const totals     = sprintCapacityTotals(s);
    const effective  = s.memberCapacity?.length
      ? parseFloat(calcEffectiveCapacity(s.memberCapacity, sprintDays, supportImpactFactor).toFixed(1))
      : null;
    const full       = s.memberCapacity?.length
      ? parseFloat(calcFullCapacity(s.memberCapacity, sprintDays).toFixed(1))
      : null;
    const utilization = s.memberCapacity?.length
      ? calcCapacityUtilization(s.memberCapacity, sprintDays, supportImpactFactor)
      : null;
    // Capacity-adjusted: what points would have been at full capacity
    const adjVelocity = (effective && full && effective > 0)
      ? parseFloat(((s.completedPoints / effective) * full).toFixed(1))
      : null;

    return {
      name: s.name,
      committed:    s.committedPoints,
      completed:    s.completedPoints,
      rollingAvg,
      ptoDays:      totals.ptoDays,
      supportDays:  totals.supportDays,
      otherDays:    totals.otherDays,
      effectiveFTEs: totals.effectiveFTEs,
      effectiveDays: effective,
      fullDays:      full,
      utilization,
      adjVelocity,
    };
  });
}

/**
 * Run a Monte Carlo simulation over historical completed points and return
 * sprint-count percentiles for finishing a backlog.
 *
 * @param {object} params
 * @param {number} params.backlogPoints
 * @param {Sprint[]} params.sprints
 * @param {number} [params.allocationFactor=1]
 * @param {number} [params.iterations=2000]
 * @returns {{ p50: number|null, p80: number|null, p90: number|null, probabilityBySprint: object, sampleSize: number }}
 */
export function runMonteCarloForecast({
  backlogPoints,
  sprints,
  allocationFactor = 1,
  iterations = 2000,
}) {
  const historical = (sprints || [])
    .map(s => Number(s.completedPoints || 0))
    .filter(v => Number.isFinite(v) && v > 0);

  if (!historical.length || !Number.isFinite(backlogPoints) || backlogPoints <= 0) {
    return { p50: null, p80: null, p90: null, probabilityBySprint: {}, sampleSize: historical.length };
  }

  const cappedAllocation = Math.max(0, allocationFactor);
  const runs = [];
  for (let i = 0; i < iterations; i++) {
    let remaining = backlogPoints;
    let sprintCount = 0;

    // Safety cap prevents pathological loops if allocation is zero.
    while (remaining > 0 && sprintCount < 500) {
      const pick = historical[Math.floor(Math.random() * historical.length)] * cappedAllocation;
      remaining -= Math.max(0.1, pick);
      sprintCount += 1;
    }
    runs.push(sprintCount);
  }

  runs.sort((a, b) => a - b);
  const percentile = p => runs[Math.min(runs.length - 1, Math.floor(runs.length * p))];

  const maxSprints = runs[runs.length - 1];
  const probabilityBySprint = {};
  for (let s = 1; s <= maxSprints; s++) {
    const done = runs.filter(v => v <= s).length;
    probabilityBySprint[s] = parseFloat(((done / runs.length) * 100).toFixed(1));
  }

  return {
    p50: percentile(0.5),
    p80: percentile(0.8),
    p90: percentile(0.9),
    probabilityBySprint,
    sampleSize: historical.length,
  };
}

/**
 * Build lightweight health alerts from recent sprint behavior.
 */
export function buildHealthSignals(sprints, sprintDays = 14, supportImpactFactor = 0.8) {
  if (!Array.isArray(sprints) || sprints.length < 2) return [];

  const recent = sprints.slice(-3);
  const previous = sprints.slice(-6, -3);
  const recentAvg = calcAverageVelocity(recent);
  const previousAvg = previous.length ? calcAverageVelocity(previous) : null;
  const latest = sprints[sprints.length - 1];
  const util = latest?.memberCapacity?.length
    ? calcCapacityUtilization(latest.memberCapacity, sprintDays, supportImpactFactor)
    : null;
  const predictability = calcPredictability(recent);
  const latestTotals = latest ? sprintCapacityTotals(latest) : { supportDays: 0, ptoDays: 0 };

  const alerts = [];
  if (previousAvg != null && previousAvg > 0 && recentAvg < previousAvg * 0.85) {
    alerts.push({
      severity: 'high',
      title: 'Velocity dropped vs prior baseline',
      detail: `Last 3 sprints average ${recentAvg} vs prior baseline ${previousAvg}.`,
    });
  }
  if (util != null && util < 75) {
    alerts.push({
      severity: 'medium',
      title: 'Capacity utilization is low',
      detail: `Latest sprint utilization is ${util}%. Interruption load is likely impacting delivery.`,
    });
  }
  if (predictability < 80) {
    alerts.push({
      severity: 'medium',
      title: 'Predictability is below target',
      detail: `Recent commitment hit rate is ${predictability}%. Consider reducing sprint scope volatility.`,
    });
  }
  if ((latestTotals.supportDays || 0) >= sprintDays) {
    alerts.push({
      severity: 'low',
      title: 'Support load is unusually high',
      detail: `Latest sprint recorded ${latestTotals.supportDays} support days.`,
    });
  }

  // Scope creep: flag when scope-added points are significant across recent sprints
  const scopeCreepSprints = recent.filter(s => {
    const added = s.scopeAddedPoints || 0;
    const committed = s.committedPoints || 0;
    return committed > 0 && added / committed >= 0.25;
  });
  if (scopeCreepSprints.length >= 2) {
    const avgAdded = parseFloat(
      (scopeCreepSprints.reduce((sum, s) => sum + (s.scopeAddedPoints || 0), 0) / scopeCreepSprints.length).toFixed(1)
    );
    alerts.push({
      severity: 'medium',
      title: 'Recurring scope creep detected',
      detail: `${scopeCreepSprints.length} of the last ${recent.length} sprints had scope added mid-sprint (avg ${avgAdded} pts added). Consider tightening sprint scope gates.`,
    });
  }

  return alerts;
}

/**
 * Scale committed points by the team's currently available capacity for the sprint.
 *
 * Baseline capacity assumes each listed member is available at 100% allocation
 * for the whole sprint. Current available capacity uses entered allocation and
 * treats PTO/support/other as full-day losses.
 *
 * availableDays = (allocation% × sprintDays) − PTO − support − other.
 * baselineDays  = memberCount × sprintDays.
 *
 * @param {number} committedPoints
 * @param {Array} memberCapacity
 * @param {number} sprintDays
 * @returns {{ adjustedPoints: number, capacityRatio: number, availableDays: number, rawDays: number }}
 */
export function calcCapacityAdjustedCommitment(
  committedPoints = 0,
  memberCapacity = [],
  sprintDays = 14
) {
  const rows = memberCapacity || [];
  const rawDays = rows.length * sprintDays;

  if (!rawDays) {
    return {
      adjustedPoints: 0,
      capacityRatio: 0,
      availableDays: 0,
      rawDays: 0,
    };
  }

  const availableDays = rows.reduce((sum, row) => {
    const alloc = (row.allocation ?? 100) / 100;
    const totalOff = (row.ptoDays || 0) + (row.supportDays || 0) + (row.otherDays || 0);
    return sum + Math.max(0, (alloc * sprintDays) - totalOff);
  }, 0);

  const capacityRatio = availableDays / rawDays;
  return {
    adjustedPoints: Math.round((Number(committedPoints || 0) * capacityRatio) * 10) / 10,
    capacityRatio: Math.round(capacityRatio * 1000) / 1000,
    availableDays: Math.round(availableDays * 10) / 10,
    rawDays: Math.round(rawDays * 10) / 10,
  };
}

