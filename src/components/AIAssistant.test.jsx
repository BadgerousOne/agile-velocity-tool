import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AIAssistant from './AIAssistant';

const dispatch = vi.fn();

vi.mock('../context/VelocityContext', () => ({
  useVelocity: () => ({
    state: {
      chatHistory: [
        {
          role: 'assistant',
          content: 'I recommend adding a sprint.\nACTION_JSON: {"action":"add_sprint"}',
        },
      ],
      aiActionAudit: [],
      teamMembers: [{ id: 'm1', name: 'Alice', role: 'Developer' }],
      sprints: [{ id: 's1', name: 'Sprint 1', committedPoints: 20, completedPoints: 18, memberCapacity: [] }],
      sprintDurationDays: 14,
      supportImpactFactor: 0.8,
    },
    dispatch,
  }),
}));

describe('AI Assistant safety flow', () => {
  it('requires confirmation before applying AI action and writes audit entry', async () => {
    const user = userEvent.setup();
    render(<AIAssistant />);

    await user.click(screen.getByRole('button', { name: 'Apply AI Recommendation' }));
    expect(screen.getByText('Confirm AI Action')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_SPRINT' });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ADD_AI_ACTION_AUDIT',
    }));
  });
});

