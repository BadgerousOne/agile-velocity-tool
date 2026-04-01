/**
 * AIAssistant.jsx
 *
 * AI-powered Agile Coach chat interface. Supports four LLM providers:
 *
 *  🟢 OpenAI      — GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo (paid)
 *  🟠 Anthropic   — Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus (paid)
 *  🔵 Gemini      — Gemini 1.5 Flash/Pro, 2.0 Flash (free tier available)
 *  🏠 Ollama      — Llama 3.2, Mistral, Gemma2, Phi3, Qwen2.5 (free, runs locally)
 *
 * The assistant is injected with a system prompt containing the full sprint
 * history and velocity metrics so it can give context-aware coaching advice.
 *
 * API keys are stored in sessionStorage only — never persisted to localStorage.
 * They are cleared automatically when the browser tab is closed.
 *
 * Ollama requires a local install (ollama.com) with `ollama serve` running.
 * All other providers make direct browser fetch() calls to their respective APIs.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useVelocity } from '../context/VelocityContext';
import {
  calcAverageVelocity, calcWeightedVelocity,
  calcTrend, calcPredictability,
} from '../utils/velocityCalc';
import './AIAssistant.css';

// ─── Provider Definitions ────────────────────────────────────────────────────
const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    badge: 'GPT-4o',
    icon: '🟢',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o',
    keyPlaceholder: 'sk-...',
    keyHint: 'Get your key at platform.openai.com/api-keys',
    keyLabel: 'OpenAI API Key',
    needsKey: true,
    cost: 'Paid',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    badge: 'Claude',
    icon: '🟠',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Get your key at console.anthropic.com',
    keyLabel: 'Anthropic API Key',
    needsKey: true,
    cost: 'Paid',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    badge: 'Gemini',
    icon: '🔵',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
    defaultModel: 'gemini-1.5-flash',
    keyPlaceholder: 'AIza...',
    keyHint: 'Get a free key at aistudio.google.com — free tier available!',
    keyLabel: 'Google AI Studio API Key',
    needsKey: true,
    cost: 'Free tier',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (Local)',
    badge: 'Local',
    icon: '🏠',
    models: ['llama3.2', 'llama3.1', 'mistral', 'gemma2', 'phi3', 'qwen2.5'],
    defaultModel: 'llama3.2',
    keyPlaceholder: 'No key needed',
    keyHint: 'Runs 100% locally on your machine. Install from ollama.com — completely free!',
    keyLabel: 'No API Key Required',
    needsKey: false,
    cost: 'Free (local)',
  },
};

// ─── API Callers ─────────────────────────────────────────────────────────────
async function callOpenAI(apiKey, model, messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1024 }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
  return (await res.json()).choices[0].message.content;
}

async function callAnthropic(apiKey, model, messages) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const history = messages.filter(m => m.role !== 'system');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, system, messages: history, max_tokens: 1024 }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
  return (await res.json()).content[0].text;
}

async function callGemini(apiKey, model, messages) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const history = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: history,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
  return (await res.json()).candidates[0].content.parts[0].text;
}

async function callOllama(model, messages) {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama error HTTP ${res.status} — is Ollama running? Run: ollama serve`);
  return (await res.json()).message.content;
}

async function callProvider(providerId, apiKey, model, messages) {
  switch (providerId) {
    case 'openai':    return callOpenAI(apiKey, model, messages);
    case 'anthropic': return callAnthropic(apiKey, model, messages);
    case 'gemini':    return callGemini(apiKey, model, messages);
    case 'ollama':    return callOllama(model, messages);
    default: throw new Error('Unknown provider');
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(state) {
  const { teamMembers, sprints, sprintDurationDays, supportImpactFactor } = state;
  const avg      = calcAverageVelocity(sprints);
  const weighted = calcWeightedVelocity(sprints);
  const trend    = calcTrend(sprints);
  const predict  = calcPredictability(sprints);

  const teamSummary   = teamMembers.map(m => `  - ${m.name} (${m.role}, ${m.allocation}% allocation)`).join('\n');
  const sprintSummary = sprints.map(s =>
    `  - ${s.name}: committed=${s.committedPoints}, completed=${s.completedPoints}, PTO=${s.ptoDays}d, support=${s.supportDays}d`
  ).join('\n');

  return `You are an expert Agile Coach and Scrum Master AI assistant embedded inside an Agile Velocity Tool. You have full knowledge of the team's current data and provide thoughtful, data-driven advice.

## Current Team Data
Team Members (${teamMembers.length}):
${teamSummary || '  (none)'}

Sprint History (${sprints.length} sprints):
${sprintSummary || '  (none)'}

## Calculated Metrics
- Simple Average Velocity: ${avg} story points/sprint
- Weighted Velocity (recency-weighted): ${weighted} story points/sprint
- Velocity Trend: ${trend}
- Predictability (commitment hit rate): ${predict}%
- Sprint Duration: ${sprintDurationDays} days
- Support Impact Factor: ${supportImpactFactor}

## Your Role
- Answer questions about velocity, trends, and forecasts using the real data above.
- Help interpret metrics, spot risks, and guide planning decisions.
- Suggest ways to improve velocity, predictability, and team health.
- Be concise, friendly, and practical.
- Today's date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`;
}

// ─── Suggested Prompts ────────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  "What is our current velocity trend and what does it mean?",
  "How many sprints will it take to deliver 300 story points?",
  "Which team member changes would most impact our capacity?",
  "How is PTO and support work affecting our velocity?",
  "What can we do to improve our predictability score?",
  "Give me a sprint planning recommendation for next sprint.",
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function AIAssistant() {
  const { state, dispatch } = useVelocity();

  const [providerId, setProviderId] = useState(() => localStorage.getItem('ai_provider') || 'openai');
  const [model, setModel]           = useState(() => {
    const saved = localStorage.getItem('ai_model');
    return saved || PROVIDERS['openai'].defaultModel;
  });
  const [apiKey, setApiKey]   = useState(() => localStorage.getItem(`ai_key_${providerId}`) || '');
  const [showKey, setShowKey] = useState(false);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const bottomRef = useRef(null);

  const provider = PROVIDERS[providerId];
  const messages = state.chatHistory;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const switchProvider = (id) => {
    setProviderId(id);
    setModel(PROVIDERS[id].defaultModel);
    setApiKey(localStorage.getItem(`ai_key_${id}`) || '');
    setError('');
    localStorage.setItem('ai_provider', id);
    localStorage.setItem('ai_model', PROVIDERS[id].defaultModel);
  };

  const saveKey = (key) => {
    setApiKey(key);
    localStorage.setItem(`ai_key_${providerId}`, key);
  };

  const saveModel = (m) => {
    setModel(m);
    localStorage.setItem('ai_model', m);
  };

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText) return;
    if (provider.needsKey && !apiKey) {
      setError(`Please enter your ${provider.keyLabel} above.`);
      return;
    }

    setError('');
    setInput('');

    const userMsg = { role: 'user', content: userText };
    dispatch({ type: 'ADD_CHAT_MESSAGE', message: userMsg });

    setLoading(true);
    try {
      const systemMsg = { role: 'system', content: buildSystemPrompt(state) };
      const history   = [...messages, userMsg].slice(-20);
      const reply     = await callProvider(providerId, apiKey, model, [systemMsg, ...history]);
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: { role: 'assistant', content: reply } });
    } catch (e) {
      setError(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="ai-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Assistant</h1>
          <p className="page-sub">Real-time Agile coaching conversations — choose your AI provider below</p>
        </div>
        <span className="badge badge-primary">{provider.icon} {provider.badge}</span>
      </div>

      {/* Provider Selector */}
      <div className="card ai-provider-card">
        <div className="ai-provider-title">🤖 Choose AI Provider</div>
        <div className="ai-provider-grid">
          {Object.values(PROVIDERS).map(p => (
            <button
              key={p.id}
              className={`ai-provider-btn ${providerId === p.id ? 'active' : ''}`}
              onClick={() => switchProvider(p.id)}
            >
              <span className="ai-provider-icon">{p.icon}</span>
              <span className="ai-provider-name">{p.label}</span>
              <span className={`ai-provider-cost ${p.cost.includes('Free') ? 'free' : 'paid'}`}>{p.cost}</span>
            </button>
          ))}
        </div>

        {/* Model Selector */}
        <div className="ai-model-row">
          <label className="ai-model-label">Model</label>
          <select
            className="ai-model-select"
            value={model}
            onChange={e => saveModel(e.target.value)}
          >
            {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* API Key (hidden for Ollama) */}
        {provider.needsKey && (
          <div className="ai-key-section">
            <div className="ai-key-label">🔑 {provider.keyLabel}</div>
            <div className="ai-key-row">
              <input
                type={showKey ? 'text' : 'password'}
                className="ai-key-input"
                placeholder={provider.keyPlaceholder}
                value={apiKey}
                onChange={e => saveKey(e.target.value)}
              />
              <button className="btn btn-secondary" onClick={() => setShowKey(s => !s)}>
                {showKey ? '🙈 Hide' : '👁 Show'}
              </button>
            </div>
            <div className="ai-key-hint">🔗 {provider.keyHint}</div>
          </div>
        )}

        {/* Ollama instructions */}
        {!provider.needsKey && (
          <div className="ai-ollama-info">
            <div className="ai-ollama-title">🏠 Running Locally — No API Key Needed</div>
            <div className="ai-ollama-steps">
              <div>1. Install Ollama from <strong>ollama.com</strong></div>
              <div>2. Run <code>ollama serve</code> in a terminal</div>
              <div>3. Pull a model: <code>ollama pull llama3.2</code></div>
              <div>4. Select your model above and start chatting!</div>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Prompts */}
      {messages.length === 0 && (
        <div className="ai-suggestions">
          <div className="ai-suggestions-title">💡 Try asking...</div>
          <div className="ai-suggestions-grid">
            {SUGGESTED_PROMPTS.map(p => (
              <button key={p} className="ai-suggestion-btn" onClick={() => sendMessage(p)}>{p}</button>
            ))}
          </div>
        </div>
      )}

      {/* Chat Window */}
      <div className="card ai-chat-window">
        {messages.length === 0 && !loading && (
          <div className="ai-empty">
            <div className="ai-empty-icon">🤖</div>
            <div className="ai-empty-title">Your AI Agile Coach is ready</div>
            <div className="ai-empty-sub">Select a provider above, then ask anything about your team's velocity, forecasts, or sprint planning.</div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`ai-bubble ${msg.role}`}>
            <div className="ai-bubble-avatar">{msg.role === 'user' ? '🧑' : '🤖'}</div>
            <div className="ai-bubble-content">
              {msg.content.split('\n').map((line, j) => (
                <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-bubble assistant">
            <div className="ai-bubble-avatar">🤖</div>
            <div className="ai-bubble-content ai-typing"><span /><span /><span /></div>
          </div>
        )}

        {error && <div className="ai-error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="ai-input-row">
        <textarea
          className="ai-input"
          rows={2}
          placeholder="Ask about velocity, forecasts, sprint planning, team health..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="btn btn-primary ai-send-btn"
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
        >
          {loading ? '...' : '➤ Send'}
        </button>
        {messages.length > 0 && (
          <button className="btn btn-secondary" onClick={() => dispatch({ type: 'CLEAR_CHAT' })} title="Clear conversation">
            🗑 Clear
          </button>
        )}
      </div>
    </div>
  );
}
