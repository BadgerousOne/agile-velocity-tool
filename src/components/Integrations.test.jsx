import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Integrations from './Integrations';

const dispatch = vi.fn();

const baseSprints = [];

vi.mock('../context/VelocityContext', () => ({
  useVelocity: () => ({
    state: {
      sprints: baseSprints,
      integrations: {
        jira: {
          connected: true,
          baseUrl: 'https://example.atlassian.net',
          projectKey: 'ABC',
          username: 'user@example.com',
          token: 'token',
          mappings: { sprint: 'Sprint', points: 'Story Points', status: 'Status' },
        },
        azure: {
          connected: true,
          organization: 'my-org',
          project: 'my-project',
          pat: 'pat',
          mappings: { sprint: 'Iteration Path', points: 'Story Points', status: 'State' },
        },
      },
    },
    dispatch,
  }),
}));

vi.mock('../utils/jiraSync', () => ({
  syncJiraSprints: vi.fn(),
}));

vi.mock('../utils/azureSync', () => ({
  syncAzureSprints: vi.fn(),
}));

import { syncJiraSprints } from '../utils/jiraSync';
import { syncAzureSprints } from '../utils/azureSync';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Integrations — test connection', () => {
  it('dispatches UPDATE_INTEGRATION on successful Jira test', async () => {
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

describe('Integrations — sync sprints', () => {
  it('shows Sync Sprints button when connected', () => {
    render(<Integrations />);
    const syncButtons = screen.getAllByRole('button', { name: 'Sync Sprints' });
    expect(syncButtons).toHaveLength(2);
  });

  it('shows preview table after successful Jira sync', async () => {
    syncJiraSprints.mockResolvedValue([
      { name: 'Sprint 1', startDate: '2026-01-05', endDate: '2026-01-16', committedPoints: 20, completedPoints: 15, memberCapacity: [] },
      { name: 'Sprint 2', startDate: '2026-01-19', endDate: '2026-01-30', committedPoints: 18, completedPoints: 18, memberCapacity: [] },
    ]);

    const user = userEvent.setup();
    render(<Integrations />);

    const syncButtons = screen.getAllByRole('button', { name: 'Sync Sprints' });
    await user.click(syncButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('sync-preview')).toBeInTheDocument();
    });

    expect(screen.getByText('Sprint 1')).toBeInTheDocument();
    expect(screen.getByText('Sprint 2')).toBeInTheDocument();
  });

  it('dispatches IMPORT_SYNCED_SPRINTS when user clicks Import', async () => {
    syncJiraSprints.mockResolvedValue([
      { name: 'Sprint 1', startDate: '2026-01-05', endDate: '2026-01-16', committedPoints: 20, completedPoints: 15, memberCapacity: [] },
    ]);

    const user = userEvent.setup();
    render(<Integrations />);

    const syncButtons = screen.getAllByRole('button', { name: 'Sync Sprints' });
    await user.click(syncButtons[0]);

    await waitFor(() => screen.getByTestId('sync-preview'));

    const importBtn = screen.getByRole('button', { name: /Import 1 sprint/i });
    await user.click(importBtn);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'IMPORT_SYNCED_SPRINTS',
      sprints: expect.arrayContaining([expect.objectContaining({ name: 'Sprint 1' })]),
    }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'RECALC_ALL_SPRINT_HOLIDAYS',
    }));
  });

  it('shows error message on sync failure', async () => {
    syncJiraSprints.mockRejectedValue({ type: 'auth', message: 'HTTP 401' });

    const user = userEvent.setup();
    render(<Integrations />);

    const syncButtons = screen.getAllByRole('button', { name: 'Sync Sprints' });
    await user.click(syncButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('sync-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sync-error')).toHaveTextContent('Authentication failed');
  });

  it('shows CORS error message with Electron mode guidance', async () => {
    syncAzureSprints.mockRejectedValue({ type: 'cors', message: 'Network error' });

    const user = userEvent.setup();
    render(<Integrations />);

    const syncButtons = screen.getAllByRole('button', { name: 'Sync Sprints' });
    await user.click(syncButtons[1]);

    await waitFor(() => {
      expect(screen.getByTestId('sync-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sync-error')).toHaveTextContent('Electron');
  });
});
