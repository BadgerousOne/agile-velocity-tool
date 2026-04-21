export const WORKING_DAYS_PER_MONTH = 21.7;

export const TIME_PERIODS = [
  { months: 3,  label: '3 Months',  color: 'var(--secondary)' },
  { months: 6,  label: '6 Months',  color: 'var(--primary-light)' },
  { months: 9,  label: '9 Months',  color: 'var(--warning)' },
  { months: 12, label: '1 Year',    color: 'var(--success)' },
];

export const SPRINT_PERIODS = [
  { sprints: 3,  label: '3 Sprints',  color: 'var(--secondary)' },
  { sprints: 6,  label: '6 Sprints',  color: 'var(--primary-light)' },
  { sprints: 9,  label: '9 Sprints',  color: 'var(--warning)' },
  { sprints: 12, label: '12 Sprints', color: 'var(--success)' },
];

export function calcPeriodForecast(velocity, sprintDays, months, allocationFactor = 1.0) {
  const workingDays = months * WORKING_DAYS_PER_MONTH;
  const sprintCount = workingDays / sprintDays;
  const fullSprints = Math.floor(sprintCount);
  const partialFrac = sprintCount - fullSprints;
  const effectiveVel = parseFloat((velocity * allocationFactor).toFixed(2));
  const totalPoints = parseFloat((effectiveVel * sprintCount).toFixed(1));
  const fullPoints = parseFloat((effectiveVel * fullSprints).toFixed(1));

  return {
    months,
    workingDays: Math.round(workingDays),
    sprintCount: parseFloat(sprintCount.toFixed(1)),
    fullSprints,
    partialFrac,
    totalPoints,
    fullPoints,
    effectiveVel,
  };
}

export function calcSprintForecast(velocity, sprintDays, sprintCount, allocationFactor = 1.0) {
  const effectiveVel = parseFloat((velocity * allocationFactor).toFixed(2));
  const totalPoints = parseFloat((effectiveVel * sprintCount).toFixed(1));
  const workingDays = Math.round(sprintCount * sprintDays);
  const months = parseFloat((workingDays / WORKING_DAYS_PER_MONTH).toFixed(1));
  const weeks = parseFloat(((sprintCount * sprintDays) / 7).toFixed(1));

  return {
    sprintCount,
    fullSprints: sprintCount,
    totalPoints,
    workingDays,
    months,
    weeks,
    effectiveVel,
  };
}

export function buildPeriodForecasts({ horizonMode, velocity, sprintDurationDays, allocationFactor }) {
  const periods = horizonMode === 'time' ? TIME_PERIODS : SPRINT_PERIODS;
  return periods.map(period => (
    horizonMode === 'time'
      ? { ...period, ...calcPeriodForecast(velocity, sprintDurationDays, period.months, allocationFactor) }
      : { ...period, ...calcSprintForecast(velocity, sprintDurationDays, period.sprints, allocationFactor) }
  ));
}

export function buildCumulativeChartData({ horizonMode, velocity, sprintDurationDays, allocationFactor }) {
  const data = [];
  if (!(velocity > 0)) return data;

  if (horizonMode === 'time') {
    const sprintsPerMonth = WORKING_DAYS_PER_MONTH / sprintDurationDays;
    let cumulative = 0;
    for (let month = 1; month <= 12; month++) {
      cumulative += velocity * allocationFactor * sprintsPerMonth;
      const milestone = TIME_PERIODS.find(period => period.months === month);
      data.push({
        label: `Mo ${month}`,
        cumulative: parseFloat(cumulative.toFixed(1)),
        milestone: milestone ? milestone.label : null,
      });
    }
    return data;
  }

  let cumulative = 0;
  for (let sprint = 1; sprint <= 12; sprint++) {
    cumulative += velocity * allocationFactor;
    const milestone = SPRINT_PERIODS.find(period => period.sprints === sprint);
    data.push({
      label: `S${sprint}`,
      cumulative: parseFloat(cumulative.toFixed(1)),
      milestone: milestone ? milestone.label : null,
    });
  }
  return data;
}

export function buildPeriodBarData(periodForecasts) {
  return periodForecasts.map(period => ({
    name: period.label,
    points: period.totalPoints,
    sprints: period.fullSprints,
    color: period.color,
  }));
}

