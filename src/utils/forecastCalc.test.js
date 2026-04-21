import {
  buildCumulativeChartData,
  buildPeriodForecasts,
  SPRINT_PERIODS,
  TIME_PERIODS,
} from './forecastCalc';

describe('forecastCalc utils', () => {
  it('builds time-based period forecasts', () => {
    const result = buildPeriodForecasts({
      horizonMode: 'time',
      velocity: 20,
      sprintDurationDays: 10,
      allocationFactor: 1,
    });

    expect(result).toHaveLength(TIME_PERIODS.length);
    expect(result[0].months).toBe(3);
    expect(result[0].totalPoints).toBeGreaterThan(0);
  });

  it('builds sprint-based cumulative chart data', () => {
    const result = buildCumulativeChartData({
      horizonMode: 'sprints',
      velocity: 15,
      sprintDurationDays: 10,
      allocationFactor: 1,
    });

    expect(result).toHaveLength(12);
    expect(result[0].label).toBe('S1');
    expect(result[0].cumulative).toBe(15);
  });

  it('builds sprint-based period forecasts', () => {
    const result = buildPeriodForecasts({
      horizonMode: 'sprints',
      velocity: 18,
      sprintDurationDays: 10,
      allocationFactor: 0.5,
    });

    expect(result).toHaveLength(SPRINT_PERIODS.length);
    expect(result[0].sprintCount).toBe(3);
    expect(result[0].totalPoints).toBe(27);
  });
});

