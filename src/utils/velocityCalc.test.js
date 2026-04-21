import {
  buildChartData,
  buildHealthSignals,
  calcCapacityAdjustedCommitment,
  calcCapacityAdjustedVelocity,
  calcCapacityUtilization,
  calcEffectiveCapacity,
  calcFullCapacity,
  calcPredictability,
  calcTrend,
  calcWeightedVelocity,
  runMonteCarloForecast,
} from './velocityCalc';

describe('velocity calculations', () => {
  const memberCapacity = [
	{ memberId: 'm1', allocation: 100, ptoDays: 1, supportDays: 2, otherDays: 1 },
	{ memberId: 'm2', allocation: 50, ptoDays: 0, supportDays: 0, otherDays: 0 },
  ];

  it('calculates effective and full capacity', () => {
	expect(calcFullCapacity(memberCapacity, 10)).toBe(15);
	expect(calcEffectiveCapacity(memberCapacity, 10, 0.8)).toBeCloseTo(12.6, 5);
  });

  it('returns 100 utilization when full capacity is zero', () => {
	const util = calcCapacityUtilization([{ memberId: 'm1', allocation: 0 }], 10, 0.8);
	expect(util).toBe(100);
  });

  it('computes capacity-adjusted velocity across sprints', () => {
	const sprints = [
	  { completedPoints: 20, memberCapacity: [{ memberId: 'm1', allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 }] },
	  { completedPoints: 10, memberCapacity: [{ memberId: 'm1', allocation: 100, ptoDays: 5, supportDays: 0, otherDays: 0 }] },
	];

	expect(calcCapacityAdjustedVelocity(sprints, 10, 0.8)).toBe(20);
  });

  it('uses fallback behavior when effective capacity is zero', () => {
	const sprints = [
	  {
		completedPoints: 12,
		memberCapacity: [{ memberId: 'm1', allocation: 100, ptoDays: 10, supportDays: 0, otherDays: 0 }],
	  },
	];
	expect(calcCapacityAdjustedVelocity(sprints, 10, 0.8)).toBe(12);
  });

  it('computes weighted velocity, trend, and capped predictability', () => {
	const sprints = [
	  { committedPoints: 20, completedPoints: 18 },
	  { committedPoints: 20, completedPoints: 30 },
	  { committedPoints: 25, completedPoints: 26 },
	];

	expect(calcWeightedVelocity(sprints)).toBeCloseTo(26, 5);
	expect(calcTrend(sprints)).toBe('up');
	expect(calcPredictability(sprints)).toBeCloseTo(96.7, 1);
  });

  it('builds chart data with utilization and adjusted velocity', () => {
	const sprints = [
	  {
		name: 'Sprint 1',
		committedPoints: 20,
		completedPoints: 18,
		memberCapacity: [{ memberId: 'm1', allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 }],
	  },
	];

	const chart = buildChartData(sprints, 10, 0.8);
	expect(chart).toHaveLength(1);
	expect(chart[0].utilization).toBe(100);
	expect(chart[0].adjVelocity).toBe(18);
  });

  it('returns percentile forecasts from Monte Carlo simulation', () => {
	const restore = Math.random;
	Math.random = () => 0.5;
	const result = runMonteCarloForecast({
	  backlogPoints: 100,
	  sprints: [
		{ completedPoints: 20 },
		{ completedPoints: 25 },
	  ],
	  allocationFactor: 1,
	  iterations: 100,
	});
	Math.random = restore;

	expect(result.p50).toBeGreaterThan(0);
	expect(result.p80).toBeGreaterThanOrEqual(result.p50);
	expect(result.p90).toBeGreaterThanOrEqual(result.p80);
  });

  it('flags scope creep when scope added is significant in 2+ recent sprints', () => {
    const sprints = [
      { committedPoints: 40, completedPoints: 38, scopeAddedPoints: 12, memberCapacity: [] },
      { committedPoints: 40, completedPoints: 36, scopeAddedPoints: 14, memberCapacity: [] },
      { committedPoints: 40, completedPoints: 38, scopeAddedPoints: 11, memberCapacity: [] },
    ];
    const alerts = buildHealthSignals(sprints, 10, 0.8);
    const scopeAlert = alerts.find(a => a.title.toLowerCase().includes('scope'));
    expect(scopeAlert).toBeDefined();
    expect(scopeAlert.severity).toBe('medium');
  });

  it('does not flag scope creep when scope added is minor', () => {
    const sprints = [
      { committedPoints: 40, completedPoints: 38, scopeAddedPoints: 2, memberCapacity: [] },
      { committedPoints: 40, completedPoints: 36, scopeAddedPoints: 1, memberCapacity: [] },
      { committedPoints: 40, completedPoints: 38, scopeAddedPoints: 0, memberCapacity: [] },
    ];
    const alerts = buildHealthSignals(sprints, 10, 0.8);
    const scopeAlert = alerts.find(a => a.title.toLowerCase().includes('scope'));
    expect(scopeAlert).toBeUndefined();
  });

  it('builds health signals when predictability/utilization regress', () => {
	const alerts = buildHealthSignals([
	  {
		committedPoints: 40,
		completedPoints: 38,
		memberCapacity: [{ allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 }],
	  },
	  {
		committedPoints: 42,
		completedPoints: 26,
		memberCapacity: [{ allocation: 100, ptoDays: 3, supportDays: 6, otherDays: 2 }],
	  },
	  {
		committedPoints: 44,
		completedPoints: 24,
		memberCapacity: [{ allocation: 100, ptoDays: 2, supportDays: 6, otherDays: 1 }],
	  },
	], 10, 0.8);

	expect(alerts.length).toBeGreaterThan(0);
  });

  it('scales committed points by currently available sprint capacity', () => {
	const result = calcCapacityAdjustedCommitment(30, [
	  { allocation: 100, ptoDays: 2, supportDays: 1, otherDays: 0 },
	  { allocation: 50, ptoDays: 0, supportDays: 0, otherDays: 0 },
	], 10);

	expect(result.rawDays).toBe(20);
	expect(result.availableDays).toBe(12);
	expect(result.adjustedPoints).toBe(18);
  });

  it('returns zero adjusted commitment when total allocation is zero', () => {
	const result = calcCapacityAdjustedCommitment(30, [
	  { allocation: 0, ptoDays: 0, supportDays: 0, otherDays: 0 },
	  { allocation: 0, ptoDays: 0, supportDays: 0, otherDays: 0 },
	], 10);

	expect(result.rawDays).toBe(20);
	expect(result.availableDays).toBe(0);
	expect(result.capacityRatio).toBe(0);
	expect(result.adjustedPoints).toBe(0);
  });

  it('drops adjusted commitment when a member allocation is reduced to zero', () => {
	const fullTeam = calcCapacityAdjustedCommitment(46, [
	  { allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 },
	  { allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 },
	  { allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 },
	], 10);

	const reducedTeam = calcCapacityAdjustedCommitment(46, [
	  { allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 },
	  { allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 },
	  { allocation: 0, ptoDays: 0, supportDays: 0, otherDays: 0 },
	], 10);

	expect(fullTeam.adjustedPoints).toBe(46);
	expect(reducedTeam.adjustedPoints).toBeCloseTo(30.7, 1);
  });
});

