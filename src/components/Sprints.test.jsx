import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sprints from './Sprints';

vi.mock('../context/VelocityContext', async () => {
  const actual = await vi.importActual('../context/VelocityContext');
  const ReactActual = await vi.importActual('react');

  const createInitialState = () => ({
    sprints: [{
      id: 's1',
      name: 'Sprint 1',
      startDate: '2026-03-02',
      endDate: '2026-03-15',
      committedPoints: 46,
      suggestedCommittedPoints: 46,
      capacityBaselineCommittedPoints: 46,
      completedPoints: 40,
      notes: '',
      memberCapacity: [
        { memberId: 'm1', memberName: 'Alice', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: 'm2', memberName: 'Bob', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: 'm3', memberName: 'Carol', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
      ],
    }, {
      id: 's2',
      name: 'Sprint 2',
      startDate: '2026-01-06',
      endDate: '2026-01-19',
      committedPoints: 30,
      suggestedCommittedPoints: 30,
      capacityBaselineCommittedPoints: 30,
      completedPoints: 28,
      notes: '',
      memberCapacity: [
        { memberId: 'm1', memberName: 'Alice', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: 'm2', memberName: 'Bob', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: 'm3', memberName: 'Carol', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
      ],
    }, {
      id: 's3',
      name: 'Sprint 3',
      startDate: '2026-04-01',
      endDate: '2026-04-14',
      committedPoints: 50,
      suggestedCommittedPoints: 50,
      capacityBaselineCommittedPoints: 50,
      completedPoints: 49,
      notes: '',
      memberCapacity: [
        {
          memberId: 'm1',
          memberName: 'Alice',
          allocation: 100,
          ptoDays: 2,
          holidayDays: 2,
          holidayNames: ['Founders Day', 'Spring Festival'],
          supportDays: 0,
          otherDays: 0,
          otherLabel: '',
        },
        { memberId: 'm2', memberName: 'Bob', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: 'm3', memberName: 'Carol', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
      ],
    }],
    sprintDurationDays: 14,
    supportImpactFactor: 0.8,
    teamMembers: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
  });

  return {
    ...actual,
    useVelocity: () => {
      const [state, dispatch] = ReactActual.useReducer(actual.reducer, undefined, createInitialState);
      return { state, dispatch };
    },
  };
});

describe('Sprints capacity sync', () => {
  it('displays sprint cards in stored array order', () => {
    const { container } = render(<Sprints />);
    const sprintNames = [...container.querySelectorAll('.sprint-name')].map(el => el.textContent);
    expect(sprintNames).toEqual(['Sprint 1', 'Sprint 2', 'Sprint 3']);
  });

  it('shows holiday names when hovering holiday days in Capacity Impact', async () => {
    const user = userEvent.setup();
    render(<Sprints />);

    await user.click(screen.getByText('Sprint 3'));
    await user.click(screen.getByRole('button', { name: /Capacity Impact/i }));

    const holidayTooltips = screen.getAllByTitle('Holidays: Founders Day, Spring Festival');
    expect(holidayTooltips.length).toBeGreaterThan(0);
  });

  it('updates committed points in Sprint Details after capacity allocation change', async () => {
    const user = userEvent.setup();
    render(<Sprints />);

    await user.click(screen.getByText('Sprint 1'));
    expect(
      screen.getByText(/Auto-sync from Capacity Impact using baseline 46 pts \(at 100% capacity\)/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Capacity Impact/i }));

    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '0' } });

    await user.click(screen.getByRole('button', { name: /Sprint Details/i }));

    expect(screen.getByDisplayValue('31')).toBeInTheDocument();
  });

  it('resets override and team capacity edits when resetting to suggested velocity', async () => {
    const user = userEvent.setup();
    render(<Sprints />);

    await user.click(screen.getByText('Sprint 1'));
    await user.click(screen.getByRole('button', { name: /Capacity Impact/i }));

    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '0' } });

    const spinbuttons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[1], { target: { value: '2' } });

    await user.click(screen.getByRole('button', { name: /Sprint Details/i }));
    await user.click(screen.getByRole('button', { name: /Reset to 46/i }));

    expect(screen.getByDisplayValue('46')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Capacity Impact/i }));

    const slidersAfterReset = screen.getAllByRole('slider');
    expect(slidersAfterReset[0].value).toBe('100');

    const spinbuttonsAfterReset = screen.getAllByRole('spinbutton');
    expect(spinbuttonsAfterReset[1]).toHaveValue(0);
  });
});
