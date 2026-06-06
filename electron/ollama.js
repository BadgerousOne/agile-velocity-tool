import { spawn, execFile } from 'child_process';
import { existsSync } from 'fs';
import { chmod, appendFile, mkdir } from 'fs/promises';
import http from 'http';
import path from 'path';
import { app } from 'electron';

// Informational — the actual binary in vendor/ollama was built from this version.
// To update: bump this, delete vendor/ollama, run npm run vendor:setup.
export const OLLAMA_VERSION = '0.3.14';
export const DEFAULT_MODEL  = 'llama3.2';

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

export function resolveBinary() {
  // Packaged app: use the universal binary unpacked from the asar bundle
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'vendor', 'ollama');
  }

  // Dev: fall back to a previously downloaded managed binary or a system install
  const devPaths = [
    path.join(app.getPath('userData'), 'ollama', 'bin', 'ollama'),
    '/opt/homebrew/bin/ollama',
    '/usr/local/bin/ollama',
  ];
  for (const p of devPaths) {
    if (existsSync(p)) return p;
  }

  return 'ollama'; // last resort: PATH
}

export const ollamaHome = () =>
  path.join(app.getPath('userData'), 'ollama', 'home');

// ── Diagnostic log ────────────────────────────────────────────────────────────

async function log(msg) {
  try {
    const dir = app.getPath('userData');
    await mkdir(dir, { recursive: true });
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    await appendFile(path.join(dir, 'ollama.log'), line, 'utf8');
  } catch { /* non-fatal */ }
}

// ── Model pull ────────────────────────────────────────────────────────────────

// Matches: "pulling <hash>:  45% ▕...▏ 2.1 GB / 4.7 GB"
const PULL_RE = /pulling [^:]+:\s+\d+%.*?(\d+(?:\.\d+)?)\s*([KMGT]?B)\s*\/\s*(\d+(?:\.\d+)?)\s*([KMGT]?B)/;

function parseBytes(value, unit) {
  const multipliers = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
  return Math.round(parseFloat(value) * (multipliers[unit] ?? 1));
}

export function pullModel(modelName) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, OLLAMA_HOME: ollamaHome() };
    emit({ state: 'downloading', phase: 'model', downloaded: 0, total: 0 });

    const proc = spawn(resolveBinary(), ['pull', modelName], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buf = '';

    function parseLine(line) {
      const m = PULL_RE.exec(line);
      if (m) {
        emit({
          state: 'downloading',
          phase: 'model',
          downloaded: parseBytes(m[1], m[2]),
          total:      parseBytes(m[3], m[4]),
        });
      }
    }

    function handleChunk(data) {
      const raw   = buf + data.toString();
      const parts = raw.split(/[\r\n]/);
      buf = parts[parts.length - 1];
      parts.slice(0, -1).forEach(parseLine);
    }

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', handleChunk);
    proc.on('error', reject);
    proc.on('exit', code => {
      if (buf) parseLine(buf);
      if (code === 0) resolve();
      else reject(new Error(`ollama pull exited with code ${code}`));
    });
  });
}

// ── Process management ────────────────────────────────────────────────────────

let ollamaProcess = null;
let ownedByApp    = false;
let watchdogTimer = null;

function stopWatchdog() {
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
}

function startWatchdog() {
  stopWatchdog();
  watchdogTimer = setInterval(async () => {
    // Skip if already in a transient state
    if (['starting', 'downloading'].includes(currentStatus.state)) return;
    const alive = await probePort();
    if (!alive) {
      console.warn('[ollama] watchdog: port not responding, restarting…');
      await start();
    }
  }, 30_000);
}

async function spawnServe() {
  const bin = resolveBinary();
  const env = { ...process.env, OLLAMA_HOME: ollamaHome() };

  await log(`spawnServe: binary=${bin} exists=${existsSync(bin)}`);

  let spawnFailed = false;

  ollamaProcess = spawn(bin, ['serve'], { env, stdio: 'ignore' });
  ownedByApp    = true;

  ollamaProcess.on('error', err => {
    spawnFailed = true;
    const msg = `Could not start Ollama: ${err.message}`;
    log(msg);
    emit({ state: 'error', message: msg, retryable: false });
  });

  ollamaProcess.on('exit', (code, signal) => {
    log(`ollama process exited: code=${code} signal=${signal} owned=${ownedByApp}`);
    if (ownedByApp && signal !== 'SIGTERM') {
      ollamaProcess = null;
      ownedByApp    = false;
      emit({ state: 'error', message: 'Ollama stopped unexpectedly.', retryable: true });
    }
  });

  // Poll until ready (max 30 s, 500 ms interval). Abort immediately if spawn failed.
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (spawnFailed) {
      await log('spawnServe: aborting poll — spawn error');
      return;
    }
    if (await probePort()) {
      await log('spawnServe: port ready');
      emit({ state: 'ready' });
      return;
    }
  }

  await log('spawnServe: timed out after 30 s');
  emit({ state: 'error', message: 'Ollama did not become ready in time.', retryable: true });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function prepareBinary() {
  const bin = resolveBinary();
  await log(`prepareBinary: path=${bin}`);
  try {
    await chmod(bin, 0o755);
    await log('prepareBinary: chmod 755 ok');
    // Clear quarantine so macOS Gatekeeper doesn't block the child process
    await new Promise(resolve => execFile('/usr/bin/xattr', ['-d', 'com.apple.quarantine', bin], (err) => {
      log(`prepareBinary: xattr result err=${err?.message ?? 'none'}`);
      resolve();
    }));
  } catch (err) {
    await log(`prepareBinary: error ${err?.message}`);
  }
}

export async function start() {
  await prepareBinary();
  emit({ state: 'starting' });

  const already = await probePort();
  if (already) {
    await log('start: adopted existing instance on :11434');
    ownedByApp = false;
    emit({ state: 'ready' });
    startWatchdog();
    return;
  }

  await spawnServe();
  startWatchdog();
}

export function stop() {
  stopWatchdog();
  if (ownedByApp && ollamaProcess) {
    console.log('[ollama] stopping managed process');
    ownedByApp    = false;
    ollamaProcess.kill('SIGTERM');
    ollamaProcess = null;
  }
}
