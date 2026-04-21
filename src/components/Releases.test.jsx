import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Releases from './Releases';

const dispatch = vi.fn();

vi.mock('../context/VelocityContext', () => ({
  useVelocity: () => ({
    state: {
      sprints: [{ completedPoints: 20 }, { completedPoints: 25 }],
      releasePlans: [{
        id: 'r1',
        name: 'R1',
        backlogPoints: 100,
        targetDate: '',
        notes: '',
        milestones: [
          { id: 'ms1', name: 'Production', targetDate: '', gate: 'Go/No-Go', status: 'not_started', notes: '', dependsOnMilestoneIds: [] },
          { id: 'ms2', name: 'QA Sign-off', targetDate: '', gate: 'QA complete', status: 'on_track', notes: '', dependsOnMilestoneIds: [] },
        ],
      }],
    },
    dispatch,
  }),
}));

describe('Releases UI', () => {
  beforeEach(() => {
    dispatch.mockClear();
  });

  it('dispatches add release action', async () => {
    const user = userEvent.setup();
    render(<Releases />);

    await user.click(screen.getByRole('button', { name: '+ Add Release' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_RELEASE' });
  });

  it('adds a new milestone draft and saves with checkmark', async () => {
    const user = userEvent.setup();
    render(<Releases />);

    await user.click(screen.getByRole('button', { name: '+ Add Milestone' }));
    await user.type(screen.getByPlaceholderText('e.g. Production'), 'Release Train');
    await user.click(screen.getByRole('button', { name: /Save new milestone/i }));

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UPDATE_RELEASE',
      id: 'r1',
      data: expect.objectContaining({
        milestones: expect.arrayContaining([
          expect.objectContaining({ name: 'Release Train' }),
        ]),
      }),
    }));
  });

  it('dispatches dependency linking action for milestone updates', async () => {
    const user = userEvent.setup();
    render(<Releases />);

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.click(screen.getByLabelText(/Dependencies for Production/i));
    await user.click(screen.getByRole('button', { name: 'QA Sign-off' }));
    await user.click(screen.getByRole('button', { name: /Save Production/i }));

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UPDATE_RELEASE_MILESTONE',
      releaseId: 'r1',
      milestoneId: 'ms1',
      data: expect.objectContaining({ dependsOnMilestoneIds: ['ms2'] }),
    }));
  });

  it('filters dependency options from the search input', async () => {
    const user = userEvent.setup();
    render(<Releases />);

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.click(screen.getByLabelText(/Dependencies for Production/i));
    await user.type(screen.getByLabelText(/Search dependencies for Production/i), 'not-a-match');

    expect(screen.getByText('No milestones match.')).toBeInTheDocument();
  });

  it('does not show unsaved new milestone in dependency options', async () => {
    const user = userEvent.setup();
    render(<Releases />);

    await user.click(screen.getByRole('button', { name: '+ Add Milestone' }));
    await user.type(screen.getByPlaceholderText('e.g. Production'), 'Unsaved Gate');

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.click(screen.getByLabelText(/Dependencies for Production/i));

    expect(screen.queryByRole('button', { name: 'Unsaved Gate' })).not.toBeInTheDocument();
  });

  it('shows per-milestone view/edit controls', async () => {
    const user = userEvent.setup();
    render(<Releases />);

    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(screen.getByRole('button', { name: /Save Production/i })).toBeInTheDocument();
  });
});

