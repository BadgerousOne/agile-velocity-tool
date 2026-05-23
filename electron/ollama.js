import { spawn } from 'child_process';
import { existsSync } from 'fs';
import http from 'http';
import path from 'path';
import { app } from 'electron';

// Pinned Ollama version — update consciously, verify download URL format on bump
export const OLLAMA_VERSION = '0.3.14';
export const DEFAULT_MODEL  = 'llama3.2';

const managedBinary = () =>
  path.join(app.getPath('userData'), 'ollama', 'bin', 'ollama');

const ollamaHome = () =>
  path.join(app.getPath('userData'), 'ollama', 'home');

// ── Status event bus ──────────────────────────────────────────────────────────

let currentStatus = { state: 'idle' };
const listeners   = new Set();

function emit(status) {
  currentStatus = status;
  for (const fn of listeners) fn(status);
}

export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCurrentStatus() {
  return currentStatus;
}

// ── Port probe ────────────────────────────────────────────────────────────────

export function probePort() {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:11434/api/version', { timeout: 2000 }, res => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ── Binary resolution ─────────────────────────────────────────────────────────

function resolveBinary() {
  const managed = managedBinary();
  if (existsSync(managed)) return managed;

  // Fall back to known system install locations
  const systemPaths = [
    '/usr/local/bin/ollama',
    '/opt/homebrew/bin/ollama',
  ];
  for (const p of systemPaths) {
    if (existsSync(p)) return p;
  }

  return 'ollama'; // last resort: rely on PATH
}

// ── Process management ────────────────────────────────────────────────────────

let ollamaProcess = null;
let ownedByApp    = false;
let restarting    = false;

async function spawnServe() {
  const bin = resolveBinary();
  const env = { ...process.env, OLLAMA_HOME: ollamaHome() };

  ollamaProcess = spawn(bin, ['serve'], { env, stdio: 'ignore' });
  ownedByApp    = true;

  ollamaProcess.on('error', err => {
    console.error('[ollama] spawn error:', err.message);
    emit({ state: 'error', message: `Could not start Ollama: ${err.message}`, retryable: false });
  });

  ollamaProcess.on('exit', code => {
    // Unexpected exit: restart once (avoids restart loops)
    if (ownedByApp && !restarting && code !== 0 && code !== null) {
      console.warn(`[ollama] process exited (code ${code}), restarting…`);
      restarting = true;
      emit({ state: 'starting' });
      setTimeout(async () => {
        restarting = false;
        await start();
      }, 2000);
    }
  });

  // Poll until ready (max 15 s, 500 ms interval)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await probePort()) {
      emit({ state: 'ready' });
      return;
    }
  }

  emit({ state: 'error', message: 'Ollama did not become ready in time.', retryable: true });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function start() {
  emit({ state: 'starting' });

  // If Ollama is already listening (system service or prior launch), adopt it
  const already = await probePort();
  if (already) {
    console.log('[ollama] adopted existing instance on :11434');
    ownedByApp = false;
    emit({ state: 'ready' });
    return;
  }

  // Otherwise spawn from managed or system binary
  await spawnServe();
}

export function stop() {
  if (ownedByApp && ollamaProcess) {
    console.log('[ollama] stopping managed process');
    ownedByApp    = false;
    ollamaProcess.kill('SIGTERM');
    ollamaProcess = null;
  }
}
