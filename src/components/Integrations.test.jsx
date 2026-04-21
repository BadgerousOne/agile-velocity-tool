import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Integrations from './Integrations';

const dispatch = vi.fn();

vi.mock('../context/VelocityContext', () => ({
  useVelocity: () => ({
    state: {
      integrations: {
        jira: {
          connected: false,
          baseUrl: 'https://example.atlassian.net',
          username: 'user@example.com',
          token: 'token',
          mappings: { sprint: 'Sprint', points: 'Story Points', status: 'Status' },
        },
        azure: {
          connected: false,
          organization: 'my-org',
          pat: 'pat',
          mappings: { sprint: 'Iteration Path', points: 'Story Points', status: 'State' },
        },
      },
    },
    dispatch,
  }),
}));

describe('Integrations', () => {
  it('tests Jira connection and dispatches status updates', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: 'Test User' }),
    });

    const user = userEvent.setup();
    render(<Integrations />);

    const buttons = screen.getAllByRole('button', { name: 'Test Connection' });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: 'UPDATE_INTEGRATION',
        provider: 'jira',
      }));
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ADD_AI_ACTION_AUDIT',
    }));
  });
});

