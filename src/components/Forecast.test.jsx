import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Forecast from './Forecast';

vi.mock('../context/VelocityContext', () => ({
  useVelocity: () => ({
    state: {
      sprints: [
        { completedPoints: 20, committedPoints: 22, memberCapacity: [{ allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 }] },
        { completedPoints: 25, committedPoints: 24, memberCapacity: [{ allocation: 100, ptoDays: 0, supportDays: 0, otherDays: 0 }] },
      ],
      teamMembers: [{ id: 'm1' }, { id: 'm2' }],
      sprintDurationDays: 14,
    },
  }),
}));

vi.mock('recharts', () => {
  const Mock = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Mock,
    LineChart: Mock,
    BarChart: Mock,
    Bar: Mock,
    Line: Mock,
    XAxis: Mock,
    YAxis: Mock,
    CartesianGrid: Mock,
    Tooltip: Mock,
    ReferenceLine: Mock,
    Legend: Mock,
    Cell: Mock,
  };
});

describe('Forecast UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('switches to Monte Carlo mode and renders confidence section', async () => {
    const user = userEvent.setup();
    render(<Forecast />);

    await user.click(screen.getByRole('button', { name: /Show Inputs/i }));

    await user.click(screen.getByRole('button', { name: 'Monte Carlo' }));

    expect(screen.getByText('Monte Carlo Confidence Bands')).toBeInTheDocument();
    expect(screen.getByText('P80 (recommended planning guardrail)')).toBeInTheDocument();
  });

  it('renders scenario comparison when two scenarios are saved', () => {
    localStorage.setItem('velocity_saved_scenarios', JSON.stringify([
      { id: 'a', name: 'Scenario A', backlog: 200, forecastMode: 'deterministic', deterministicSprints: 9, usePlannedAlloc: false },
      { id: 'b', name: 'Scenario B', backlog: 220, forecastMode: 'monte-carlo', p80: 11, usePlannedAlloc: true, plannedAllocPct: 90 },
    ]));

    render(<Forecast />);

    expect(screen.getByText('Scenario Comparison')).toBeInTheDocument();
  });

  it('renders keyboard-focusable help tip buttons for forecast settings', async () => {
    const user = userEvent.setup();
    render(<Forecast />);

    await user.click(screen.getByRole('button', { name: /Show Inputs/i }));

    const velocityTip = screen.getByRole('button', { name: /Help: Weighted emphasizes recent sprints/i });
    await user.tab();
    await user.tab();

    expect(velocityTip).toBeInTheDocument();
  });

  it('switches forecast sections to sprint-based display mode', async () => {
    const user = userEvent.setup();
    render(<Forecast />);

    await user.click(screen.getByRole('button', { name: 'Sprint-Based' }));

    expect(screen.getByText('Story Points Deliverable by Sprint Count')).toBeInTheDocument();
    expect(screen.getByText('Cumulative Points Delivered — Sprint by Sprint (12-Sprint View)')).toBeInTheDocument();
    expect(screen.getByText('Sprint-Based Forecast Detail')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: 'Approx. Months' }).length).toBeGreaterThan(0);
  });

  it('restores sprint-based horizon mode from localStorage', () => {
    localStorage.setItem('forecast_horizon_mode', 'sprints');

    render(<Forecast />);

    expect(screen.getByText('Story Points Deliverable by Sprint Count')).toBeInTheDocument();
  });

  it('restores expanded layout preferences from localStorage', () => {
    localStorage.setItem('forecast_inputs_expanded', 'true');
    localStorage.setItem('forecast_backlog_expanded', 'true');

    render(<Forecast />);

    expect(screen.getByRole('button', { name: /Hide Inputs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide \(200 pts\)/i })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('fully collapses and re-expands planning controls', async () => {
    const user = userEvent.setup();
    render(<Forecast />);

    await user.click(screen.getByRole('button', { name: /Hide Planning/i }));
    expect(screen.queryByText('Forecast Inputs')).not.toBeInTheDocument();
    expect(screen.queryByText('Scenario Manager')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show Planning/i }));
    expect(screen.getByText('Forecast Inputs')).toBeInTheDocument();
    expect(screen.getByText('Scenario Manager')).toBeInTheDocument();
  });
});


