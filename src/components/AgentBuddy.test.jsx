import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentBuddy from './AgentBuddy';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockDispatch = vi.fn();

const SPRINT_DEFAULTS = {
  name: 'Sprint 2',
  startDate: '2026-02-01',
  endDate: '2026-02-14',
  committedPoints: 30,
  suggestedCommittedPoints: 30,
  notes: '',
  memberCapacity: [
    { memberId: 'm1', memberName: 'Alice', allocation: 100 },
  ],
};

const MOCK_STATE = {
  sprints: [{
    id: 's1', name: 'Sprint 1',
    startDate: '2026-01-05', endDate: '2026-01-18',
    committedPoints: 30, completedPoints: 28,
    memberCapacity: [{ memberId: 'm1', memberName: 'Alice', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' }],
  }],
  teamMembers: [{ id: 'm1', name: 'Alice', role: 'Developer', regionId: null }],
  sprintDurationDays: 10,
  supportImpactFactor: 0.8,
  holidays: [],
  regions: [],
};

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../context/VelocityContext', async () => {
  const actual = await vi.importActual('../context/VelocityContext');
  return {
    ...actual,
    useVelocity: () => ({ state: MOCK_STATE, dispatch: mockDispatch }),
    computeNewSprintDefaults: () => SPRINT_DEFAULTS,
  };
});

vi.mock('../context/WorkspaceContext', () => ({
  useWorkspaces: () => ({ activeWorkspaceId: 'ws-1' }),
}));

vi.mock('../utils/velocityCalc', async () => {
  const actual = await vi.importActual('../utils/velocityCalc');
  return { ...actual, buildHealthSignals: () => [] };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVersionOk() {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '0.3.0' }) });
}

function makeChatOk(content, toolCalls) {
  const message = { content: content ?? '', role: 'assistant' };
  if (toolCalls !== undefined) message.tool_calls = toolCalls;
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ message }) });
}

async function openPanel() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Open Agent Buddy/i }));
  return user;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.setItem('buddy_enabled', 'true');
  sessionStorage.removeItem('buddy_sprints_created');
  mockDispatch.mockClear();
  vi.spyOn(global, 'fetch').mockReset();
});

afterEach(() => {
  localStorage.removeItem('buddy_enabled');
});

describe('AgentBuddy', () => {
  it('renders setup card when Ollama is unreachable', async () => {
    global.fetch.mockRejectedValue(new Error('Failed to fetch'));
    render(<AgentBuddy />);
    await openPanel();
    await waitFor(() => expect(screen.getByText("Ollama isn't running")).toBeInTheDocument());
  });

  it('renders a plain text response as a chat bubble', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/version')) return makeVersionOk();
      return makeChatOk('Your velocity is looking good!');
    });

    render(<AgentBuddy />);
    const user = await openPanel();
    await waitFor(() => expect(screen.getByLabelText('Message input')).not.toBeDisabled());

    await user.type(screen.getByLabelText('Message input'), 'hello');
    await user.click(screen.getByLabelText('Send message'));

    await waitFor(() =>
      expect(screen.getByText('Your velocity is looking good!')).toBeInTheDocument()
    );
  });

  it('renders SprintPreviewCard when response contains a CREATE_SPRINT action', async () => {
    const reply = [
      'Based on recent velocity I suggest:',
      '',
      '```action',
      '{ "type": "CREATE_SPRINT", "name": "Sprint 2", "suggestedCommittedPoints": 30 }',
      '```',
    ].join('\n');

    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/version')) return makeVersionOk();
      return makeChatOk(reply);
    });

    render(<AgentBuddy />);
    const user = await openPanel();
    await waitFor(() => expect(screen.getByLabelText('Message input')).not.toBeDisabled());

    await user.type(screen.getByLabelText('Message input'), 'create a sprint');
    await user.click(screen.getByLabelText('Send message'));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Confirm & Create Sprint/i })).toBeInTheDocument()
    );
    expect(screen.getByText('Proposed Sprint')).toBeInTheDocument();
  });

  it('Confirm dispatches ADD_SPRINT and increments sessionStorage counter', async () => {
    const reply = [
      'Here is a sprint:',
      '',
      '```action',
      '{ "type": "CREATE_SPRINT", "name": "Sprint 2", "suggestedCommittedPoints": 30 }',
      '```',
    ].join('\n');

    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/version')) return makeVersionOk();
      return makeChatOk(reply);
    });

    render(<AgentBuddy />);
    const user = await openPanel();
    await waitFor(() => expect(screen.getByLabelText('Message input')).not.toBeDisabled());

    await user.type(screen.getByLabelText('Message input'), 'create a sprint');
    await user.click(screen.getByLabelText('Send message'));

    const confirmBtn = await screen.findByRole('button', { name: /Confirm & Create Sprint/i });
    await user.click(confirmBtn);

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_SPRINT' })
    );
    expect(mockDispatch.mock.calls[0][0].overrides).toMatchObject({ createdVia: 'buddy' });
    expect(sessionStorage.getItem('buddy_sprints_created')).toBe('1');
    await waitFor(() =>
      expect(screen.getByText(/Sprint 2 created and added/i)).toBeInTheDocument()
    );
  });

  it('Cancel dismisses the SprintPreviewCard without dispatching', async () => {
    const reply = [
      'Here is a sprint:',
      '',
      '```action',
      '{ "type": "CREATE_SPRINT", "name": "Sprint 2", "suggestedCommittedPoints": 30 }',
      '```',
    ].join('\n');

    global.fetch.mockImplementation((url) => {
      if (url.includes('/api/version')) return makeVersionOk();
      return makeChatOk(reply);
    });

    render(<AgentBuddy />);
    const user = await openPanel();
    await waitFor(() => expect(screen.getByLabelText('Message input')).not.toBeDisabled());

    await user.type(screen.getByLabelText('Message input'), 'create a sprint');
    await user.click(screen.getByLabelText('Send message'));

    const cancelBtn = await screen.findByRole('button', { name: /^Cancel$/i });
    await user.click(cancelBtn);

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Confirm & Create Sprint/i })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Sprint creation cancelled.')).toBeInTheDocument()
    );
  });
});
