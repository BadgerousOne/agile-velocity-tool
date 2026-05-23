import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVelocity, computeNewSprintDefaults } from '../context/VelocityContext';
import { useWorkspaces } from '../context/WorkspaceContext';
import { buildBuddyContext } from '../utils/buddyContext';
import { buildHealthSignals } from '../utils/velocityCalc';
import { parseActionEnvelope, stripActionFence, ACTION_DEFINITIONS } from '../utils/buddyActions';
import SprintPreviewCard from './SprintPreviewCard';
import './AgentBuddy.css';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL      = 'llama3.2';
const MAX_HISTORY_TURNS  = 10; // keep last N user+assistant pairs in payload

let _msgId = 0;
const mkMsg = (role, content, extra = {}) => ({ id: ++_msgId, role, content, ...extra });

function buildSystemPrompt(context) {
  return `You are an Agile sprint assistant embedded in a velocity tracking tool.
Answer questions accurately based on the team data provided. Be concise and practical.
If you don't know something or the data doesn't support a conclusion, say so.

You can propose creating a new sprint. When the user asks you to create or suggest a sprint,
first explain your reasoning in plain text, then include exactly one action block:

\`\`\`action
{ "type": "CREATE_SPRINT", "name": "Sprint N", "startDate": "YYYY-MM-DD", "suggestedCommittedPoints": N, "notes": "optional rationale" }
\`\`\`

Only include an action block when the user is explicitly asking for a new sprint.
Never include more than one action block per response.

=== TEAM CONTEXT ===
${context}`;
}

// ── Ollama helpers ────────────────────────────────────────────────────────────

async function probeOllama(baseUrl, signal) {
  try {
    const res = await fetch(`${baseUrl}/api/version`, { signal: signal ?? AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    await res.json();
    return true;
  } catch {
    return false;
  }
}

// T3.5: probe whether the active model supports native tool calling
async function probeToolCalling(model, baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        tools: ACTION_DEFINITIONS,
        stream: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const json = await res.json();
    // tool_calls may be an empty array for a non-tool response — that still means tools are accepted
    return json.message?.tool_calls !== undefined;
  } catch {
    return false;
  }
}

async function callOllama(model, messages, baseUrl, tools) {
  const body = { model, messages, stream: false };
  if (tools) body.tools = tools;
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}${bodyText ? ': ' + bodyText.slice(0, 120) : ''}`);
  }
  const json = await res.json();
  return {
    content:  json.message.content || '',
    toolCall: json.message.tool_calls?.[0] ?? null,
  };
}

// Extract action data from a tool call (T3.5 path) or envelope (T3.1 path)
function extractAction(content, toolCall) {
  if (toolCall?.function?.name && toolCall.function.arguments) {
    const args = typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
    return { type: toolCall.function.name, ...args };
  }
  return parseActionEnvelope(content);
}

// ── Feature-flag wrapper ──────────────────────────────────────────────────────

export default function AgentBuddy() {
  // T4.1: react to Settings toggle without page reload via custom event
  const [enabled, setEnabled] = useState(() => localStorage.getItem('buddy_enabled') === 'true');

  useEffect(() => {
    const handler = () => setEnabled(localStorage.getItem('buddy_enabled') === 'true');
    window.addEventListener('buddy-config-changed', handler);
    return () => window.removeEventListener('buddy-config-changed', handler);
  }, []);

  if (!enabled) return null;
  return <AgentBuddyPanel />;
}

// ── Main panel ────────────────────────────────────────────────────────────────

function AgentBuddyPanel() {
  const { state, dispatch } = useVelocity();
  const { activeWorkspaceId } = useWorkspaces();
  const [open, setOpen]         = useState(false);
  // T4.2: start minimized on mobile so the panel doesn't cover the full viewport on open
  const [minimized, setMinimized] = useState(() => window.innerWidth < 768);
  const [messages, setMessages] = useState([]); // { id, role, content, error?, action? }
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  // L4: initialize from localStorage so M4 settings hookup is a one-liner
  const [ollamaUrl] = useState(() => localStorage.getItem('buddy_ollama_url') || DEFAULT_OLLAMA_URL);
  const [model]     = useState(() => localStorage.getItem('buddy_model')      || DEFAULT_MODEL);
  const [ollamaOnline, setOllamaOnline] = useState(null);   // null=unknown, true, false
  const [toolsEnabled, setToolsEnabled] = useState(null);   // T3.5: null=unknown, true, false
  const [alerts, setAlerts]             = useState([]);
  const [dismissedAlerts, setDismissedAlerts] = useState(() => new Set());
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // T4.3: reset conversation when the user switches workspaces
  useEffect(() => {
    setMessages([]);
  }, [activeWorkspaceId]);

  // L1: cancel in-flight probe if panel closes before it completes
  useEffect(() => {
    if (!open) return;
    setOllamaOnline(null);
    const ac = new AbortController();
    probeOllama(ollamaUrl, ac.signal).then(online => {
      if (ac.signal.aborted) return;
      setOllamaOnline(online);
      // T3.5: probe tool calling once Ollama is confirmed reachable
      if (online && toolsEnabled === null) {
        probeToolCalling(model, ollamaUrl).then(supported => {
          if (!ac.signal.aborted) setToolsEnabled(supported);
        });
      }
    });
    const signals = buildHealthSignals(
      state.sprints,
      state.sprintDurationDays,
      state.supportImpactFactor,
    );
    setAlerts(signals);
    return () => ac.abort();
  }, [open, ollamaUrl, model, toolsEnabled, state.sprints, state.sprintDurationDays, state.supportImpactFactor]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const dismissAlert = useCallback((title) => {
    setDismissedAlerts(prev => new Set([...prev, title]));
  }, []);

  // T3.4: confirm sprint creation
  const handleConfirmSprint = useCallback((msgId, sprintData) => {
    dispatch({
      type: 'ADD_SPRINT',
      overrides: {
        name:            sprintData.name,
        startDate:       sprintData.startDate,
        endDate:         sprintData.endDate,
        committedPoints: sprintData.committedPoints,
        notes:           sprintData.notes,
        memberCapacity:  sprintData.memberCapacity,
        createdVia:      'buddy',
      },
    });
    const prev = parseInt(sessionStorage.getItem('buddy_sprints_created') || '0', 10);
    sessionStorage.setItem('buddy_sprints_created', String(prev + 1));
    setMessages(msgs => msgs.map(m =>
      m.id === msgId ? { ...m, action: { ...m.action, status: 'confirmed' } } : m
    ));
  }, [dispatch]);

  const handleCancelSprint = useCallback((msgId) => {
    setMessages(msgs => msgs.map(m =>
      m.id === msgId ? { ...m, action: { ...m.action, status: 'cancelled' } } : m
    ));
  }, []);

  // N3: useCallback prevents unnecessary re-renders of children that receive this as a prop
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || ollamaOnline === false) return;

    const userMsg  = mkMsg('user', text);
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setInput('');
    setLoading(true);

    try {
      const context   = buildBuddyContext(state);
      const systemMsg = { role: 'system', content: buildSystemPrompt(context) };
      // Keep last MAX_HISTORY_TURNS turns (each turn = user + assistant = 2 messages)
      // History serializes only role + content for plain messages; action cards become prose
      const history = nextMsgs.slice(-(MAX_HISTORY_TURNS * 2)).map(({ role, content }) => ({ role, content }));
      const payload  = [systemMsg, ...history];

      // T3.5: include tools when model has confirmed support
      const tools = toolsEnabled === true ? ACTION_DEFINITIONS : undefined;

      let result;
      try {
        result = await callOllama(model, payload, ollamaUrl, tools);
      } catch (err) {
        if (err.message.toLowerCase().includes('context')) {
          const shortCtx = buildBuddyContext(state, { maxSprints: 5 });
          const shortSys = { role: 'system', content: buildSystemPrompt(shortCtx) };
          result = await callOllama(model, [shortSys, ...history], ollamaUrl, tools);
        } else {
          throw err;
        }
      }

      const { content, toolCall } = result;
      // T3.1 + T3.5: extract action from tool call (native) or fence (envelope)
      const actionData = extractAction(content, toolCall);

      if (actionData?.type === 'CREATE_SPRINT') {
        // T3.2: merge LLM suggestions over computed defaults
        const defaults   = computeNewSprintDefaults(state);
        const sprintData = {
          ...defaults,
          name:            actionData.name            ?? defaults.name,
          committedPoints: actionData.suggestedCommittedPoints ?? defaults.committedPoints,
          notes:           actionData.notes            ?? '',
          // startDate from LLM is advisory; trust defaults for date consistency
        };
        // T3.3: render prose above the SprintPreviewCard
        const prose = stripActionFence(content).trim();
        setMessages(prev => [...prev, mkMsg('assistant', prose, {
          action: { type: 'CREATE_SPRINT', data: sprintData, status: 'pending' },
        })]);
      } else {
        setMessages(prev => [...prev, mkMsg('assistant', content)]);
      }
    } catch (err) {
      const isNetwork = err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('NetworkError');
      const display   = isNetwork
        ? 'Could not reach Ollama. Make sure it\'s running: `ollama serve`'
        : err.message;
      setMessages(prev => [...prev, mkMsg('assistant', display, { error: true })]);
      if (isNetwork) setOllamaOnline(false);
    } finally {
      setLoading(false);
    }
  }, [input, loading, ollamaOnline, messages, state, model, ollamaUrl, toolsEnabled]);

  const statusLabel = ollamaOnline === true ? 'Online' : ollamaOnline === false ? 'Offline' : '…';
  const statusMod   = ollamaOnline === true ? 'online' : ollamaOnline === false ? 'offline' : 'unknown';
  const inputDisabled = loading || ollamaOnline === false;

  return (
    <>
      <button
        className={`buddy-fab${open ? ' buddy-fab--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close Agent Buddy' : 'Open Agent Buddy'}
        title="Agent Buddy"
      >
        {open ? '✕' : '🤖'}
      </button>

      {open && (
        <div
          className="buddy-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="buddy-panel-title"
        >
          <div className="buddy-panel-header">
            <span id="buddy-panel-title" className="buddy-panel-title">Agent Buddy</span>
            <div className="buddy-panel-header-right">
              <span className={`buddy-status buddy-status--${statusMod}`} aria-label={`Ollama ${statusLabel}`}>
                ● {statusLabel}
              </span>
              {/* T4.2: expand/collapse toggle for mobile */}
              <button
                className="buddy-panel-toggle"
                onClick={() => setMinimized(m => !m)}
                aria-label={minimized ? 'Expand panel' : 'Minimize panel'}
              >
                {minimized ? '▲' : '▼'}
              </button>
            </div>
          </div>

          {!minimized && <div className="buddy-messages">
            {/* L2: show setup card whenever offline, not just on first open */}
            {ollamaOnline === false && <SetupCard />}

            {alerts
              .filter(a => !dismissedAlerts.has(a.title))
              .map(a => (
                <HealthAlertCard key={a.title} alert={a} onDismiss={dismissAlert} />
              ))
            }

            {messages.map(msg => <MessageBubble
              key={msg.id}
              msg={msg}
              onConfirm={handleConfirmSprint}
              onCancel={handleCancelSprint}
            />)}

            {loading && (
              <div className="buddy-bubble buddy-bubble--assistant buddy-bubble--loading" aria-label="Thinking">
                ● ● ●
              </div>
            )}
            <div ref={bottomRef} />
          </div>}

          {!minimized && <div className="buddy-input-row">
            <input
              ref={inputRef}
              className="buddy-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={ollamaOnline === false ? 'Ollama offline — see setup above' : 'Ask about your sprints…'}
              disabled={inputDisabled}
              aria-label="Message input"
            />
            <button
              className="buddy-send"
              onClick={handleSend}
              disabled={inputDisabled || !input.trim()}
              aria-label="Send message"
            >
              Send
            </button>
          </div>}
        </div>
      )}
    </>
  );
}

// ── Message bubble (handles plain text + action cards) ────────────────────────

function MessageBubble({ msg, onConfirm, onCancel }) {
  const { action } = msg;

  if (action?.status === 'pending') {
    return (
      <div className="buddy-action-group">
        {msg.content && (
          <div className="buddy-bubble buddy-bubble--assistant">{msg.content}</div>
        )}
        <SprintPreviewCard
          sprintData={action.data}
          onConfirm={data => onConfirm(msg.id, data)}
          onCancel={() => onCancel(msg.id)}
          confirming={false}
        />
      </div>
    );
  }

  if (action?.status === 'confirmed') {
    return (
      <div className="buddy-action-group">
        {msg.content && (
          <div className="buddy-bubble buddy-bubble--assistant">{msg.content}</div>
        )}
        <div className="buddy-bubble buddy-bubble--assistant buddy-bubble--success">
          ✓ {action.data.name} created and added to your sprints.
        </div>
      </div>
    );
  }

  if (action?.status === 'cancelled') {
    return (
      <div className="buddy-action-group">
        {msg.content && (
          <div className="buddy-bubble buddy-bubble--assistant">{msg.content}</div>
        )}
        <div className="buddy-bubble buddy-bubble--assistant buddy-bubble--muted">
          Sprint creation cancelled.
        </div>
      </div>
    );
  }

  return (
    <div className={`buddy-bubble buddy-bubble--${msg.role}${msg.error ? ' buddy-bubble--error' : ''}`}>
      {msg.content}
    </div>
  );
}

function HealthAlertCard({ alert, onDismiss }) {
  return (
    <div className={`buddy-alert buddy-alert--${alert.severity}`} role="alert">
      <div className="buddy-alert__body">
        <span className="buddy-alert__title">{alert.title}</span>
        <span className="buddy-alert__detail">{alert.detail}</span>
      </div>
      <button
        className="buddy-alert__dismiss"
        onClick={() => onDismiss(alert.title)}
        aria-label={`Dismiss alert: ${alert.title}`}
      >
        ✕
      </button>
    </div>
  );
}

function SetupCard() {
  return (
    <div className="buddy-setup-card">
      <p className="buddy-setup-card__title">Ollama isn't running</p>
      <p>Start it in your terminal:</p>
      <code>ollama serve</code>
      <p>Then pull a model:</p>
      <code>ollama pull llama3.2</code>
      <a
        href="https://ollama.com"
        target="_blank"
        rel="noreferrer"
        className="buddy-setup-card__link"
      >
        Get Ollama →
      </a>
    </div>
  );
}
