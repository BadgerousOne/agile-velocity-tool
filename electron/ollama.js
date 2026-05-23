import { spawn, execFile } from 'child_process';
import { existsSync, createWriteStream, mkdirSync, unlinkSync } from 'fs';
import { chmod } from 'fs/promises';
import { createHash } from 'crypto';
import https from 'https';
import http from 'http';
import path from 'path';
import { app } from 'electron';

// Pinned Ollama version — update consciously, verify download URL format on bump
export const OLLAMA_VERSION = '0.3.14';
export const DEFAULT_MODEL  = 'llama3.2';

const ARCH_MAP = { arm64: 'arm64', x64: 'amd64' };

export const managedBinary = () =>
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

// ── HTTPS helpers ─────────────────────────────────────────────────────────────

// Follow redirects and return the final response
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timed out: ${url}`)); });
  });
}

async function fetchText(url) {
  const res = await httpsGet(url);
  return new Promise((resolve, reject) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', chunk => { text += chunk; });
    res.on('end', () => resolve(text));
    res.on('error', reject);
  });
}

// ── Binary download (T2.2) ────────────────────────────────────────────────────

function downloadUrl() {
  const arch = ARCH_MAP[process.arch] ?? 'amd64';
  return `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin-${arch}.tgz`;
}

function sha256Url() {
  return `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/sha256sum.txt`;
}

export async function downloadBinary() {
  const bin    = managedBinary();
  const binDir = path.dirname(bin);
  const tgzPath = path.join(binDir, 'ollama.tgz');

  mkdirSync(binDir, { recursive: true });
  emit({ state: 'downloading', phase: 'binary', downloaded: 0, total: 0 });

  // Fetch expected SHA-256 from the release checksum file
  const checksumText = await fetchText(sha256Url());
  const tgzName     = downloadUrl().split('/').pop();
  const expectedSha = checksumText.split('\n')
    .map(line => line.trim().split(/\s+/))
    .find(([, name]) => name === tgzName)?.[0];

  if (!expectedSha) {
    throw new Error(`SHA-256 not found for ${tgzName} in checksum file`);
  }

  // Stream the tgz, computing SHA-256 and emitting progress simultaneously
  const res   = await httpsGet(downloadUrl());
  const total = parseInt(res.headers['content-length'] ?? '0', 10);
  let downloaded = 0;
  const hash = createHash('sha256');

  await new Promise((resolve, reject) => {
    const out = createWriteStream(tgzPath);
    res.on('data', chunk => {
      hash.update(chunk);
      downloaded += chunk.length;
      emit({ state: 'downloading', phase: 'binary', downloaded, total });
    });
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', err => { try { unlinkSync(tgzPath); } catch {} reject(err); });
    res.on('error', err => { try { unlinkSync(tgzPath); } catch {} reject(err); });
  });

  // Reject corrupt downloads before executing
  const actualSha = hash.digest('hex');
  if (actualSha !== expectedSha) {
    unlinkSync(tgzPath);
    throw new Error(`SHA-256 mismatch — expected ${expectedSha}, got ${actualSha}`);
  }

  // Extract and clean up
  await new Promise((resolve, reject) => {
    execFile('/usr/bin/tar', ['-xzf', tgzPath, '-C', binDir], err => {
      if (err) reject(err); else resolve();
    });
  });

  unlinkSync(tgzPath);
  await chmod(bin, 0o755);

  // Remove the quarantine attribute macOS adds to downloaded files; without this
  // Gatekeeper blocks execution on first launch even though Ollama is a signed binary.
  await new Promise(resolve => {
    execFile('/usr/bin/xattr', ['-d', 'com.apple.quarantine', bin], () => resolve());
  });
}

// ── Model pull (T2.4) ─────────────────────────────────────────────────────────

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

    const proc = spawn(managedBinary(), ['pull', modelName], {
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

    // ollama pull writes carriage-return progress; split on \r and \n
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
