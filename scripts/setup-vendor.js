#!/usr/bin/env node
// Downloads the Ollama universal macOS binary and places it at vendor/ollama.
// Safe to re-run: skips download if vendor/ollama already exists.
// Run before npm run build:dmg, or use: npm run vendor:setup

import https from 'https';
import { createWriteStream, mkdirSync, existsSync, chmodSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const ROOT           = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR     = path.join(ROOT, 'vendor');
const VENDOR_BINARY  = path.join(VENDOR_DIR, 'ollama');
const OLLAMA_VERSION = '0.3.14';
const DOWNLOAD_URL   = `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin`;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 60000 }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function main() {
  if (existsSync(VENDOR_BINARY)) {
    console.log('vendor/ollama already present — skipping download.');
    return;
  }

  mkdirSync(VENDOR_DIR, { recursive: true });

  console.log(`Downloading Ollama v${OLLAMA_VERSION} (universal macOS binary)…`);
  const res   = await httpsGet(DOWNLOAD_URL);
  const total = parseInt(res.headers['content-length'] ?? '0', 10);
  let done    = 0;

  await new Promise((resolve, reject) => {
    const out = createWriteStream(VENDOR_BINARY);
    res.on('data', chunk => {
      done += chunk.length;
      if (total > 0) {
        process.stdout.write(`\r  ${Math.round(done / total * 100)}%  (${(done / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB)   `);
      }
    });
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    res.on('error', reject);
  });

  console.log();
  chmodSync(VENDOR_BINARY, 0o755);

  const { stdout } = await execFileAsync('/usr/bin/file', [VENDOR_BINARY]);
  console.log(`  ${stdout.trim()}`);
  console.log('✓ vendor/ollama ready');
}

main().catch(err => { console.error(`\nError: ${err.message}`); process.exit(1); });
