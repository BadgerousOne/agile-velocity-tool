import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVelocity } from '../context/VelocityContext';
import { buildBuddyContext } from '../utils/buddyContext';
import { buildHealthSignals } from '../utils/velocityCalc';
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

async function callOllama(model, messages, baseUrl) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}${body ? ': ' + body.slice(0, 120) : ''}`);
  }
  return (await res.json()).message.content;
}

// ── Feature-flag wrapper ──────────────────────────────────────────────────────

export default function AgentBuddy() {
  const enabled = localStorage.getItem('buddy_enabled') === 'true';
  if (!enabled) return null;
  return <AgentBuddyPanel />;
}

// ── Main panel ────────────────────────────────────────────────────────────────

function AgentBuddyPanel() {
  const { state } = useVelocity();
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState([]); // { id, role, content, error? }
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  // L4: initialize from localStorage so M4 settings hookup is a one-liner
  const [ollamaUrl] = useState(() => localStorage.getItem('buddy_ollama_url') || DEFAULT_OLLAMA_URL);
  const [model]     = useState(() => localStorage.getItem('buddy_model')      || DEFAULT_MODEL);
  const [ollamaOnline, setOllamaOnline] = useState(null); // null=unknown, true, false
  const [alerts, setAlerts]             = useState([]);   // health signal cards
  const [dismissedAlerts, setDismissedAlerts] = useState(() => new Set());
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // L1: cancel in-flight probe if panel closes before it completes
  useEffect(() => {
    if (!open) return;
    setOllamaOnline(null);
    const ac = new AbortController();
    probeOllama(ollamaUrl, ac.signal).then(online => {
      if (!ac.signal.aborted) setOllamaOnline(online);
    });
    const signals = buildHealthSignals(
      state.sprints,
      state.sprintDurationDays,
      state.supportImpactFactor,
    );
    setAlerts(signals);
    return () => ac.abort();
  }, [open, ollamaUrl, state.sprints, state.sprintDurationDays, state.supportImpactFactor]);

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

  // N3: useCallback prevents unnecessary re-renders of children that receive this as a prop
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || ollamaOnline === false) return;

    // M3: stable id on each message — safe when message types change in future milestones
    const userMsg  = mkMsg('user', text);
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setInput('');
    setLoading(true);

    try {
      const context   = buildBuddyContext(state);
      const systemMsg = { role: 'system', content: buildSystemPrompt(context) };
      // Keep last MAX_HISTORY_TURNS turns (each turn = user + assistant = 2 messages)
      const history = nextMsgs.slice(-(MAX_HISTORY_TURNS * 2)).map(({ role, content }) => ({ role, content }));
      const payload = [systemMsg, ...history];

      let reply;
      try {
        reply = await callOllama(model, payload, ollamaUrl);
      } catch (err) {
        // M2: only retry for context-length overflow, not all 400s
        if (err.message.toLowerCase().includes('context')) {
          const shortCtx = buildBuddyContext(state, { maxSprints: 5 });
          const shortSys = { role: 'system', content: buildSystemPrompt(shortCtx) };
          reply = await callOllama(model, [shortSys, ...history], ollamaUrl);
        } else {
          throw err;
        }
      }

      setMessages(prev => [...prev, mkMsg('assistant', reply)]);
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
  }, [input, loading, ollamaOnline, messages, state, model, ollamaUrl]);

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
            <span className={`buddy-status buddy-status--${statusMod}`} aria-label={`Ollama ${statusLabel}`}>
              ● {statusLabel}
            </span>
          </div>

          <div className="buddy-messages">
            {/* L2: show setup card whenever offline, not just on first open */}
            {ollamaOnline === false && <SetupCard />}

            {alerts
              .filter(a => !dismissedAlerts.has(a.title))
              .map(a => (
                <HealthAlertCard key={a.title} alert={a} onDismiss={dismissAlert} />
              ))
            }

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`buddy-bubble buddy-bubble--${msg.role}${msg.error ? ' buddy-bubble--error' : ''}`}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <div className="buddy-bubble buddy-bubble--assistant buddy-bubble--loading" aria-label="Thinking">
                ● ● ●
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="buddy-input-row">
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
          </div>
        </div>
      )}
    </>
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
