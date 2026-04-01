/**
 * build-standalone.js
 *
 * Builds a single self-contained HTML file for the Agile Velocity Tool.
 * Run with: node build-standalone.js
 *
 * Requires node_modules to be installed first (npm install).
 * Output: dist-standalone/agile-velocity-tool.html
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT_DIR  = 'dist-standalone';
const OUT_FILE = path.join(OUT_DIR, 'agile-velocity-tool.html');

console.log('\n⚡ Agile Velocity Tool — Standalone Builder\n');

// Step 1: Install vite-plugin-singlefile if needed
const pluginPath = path.join('node_modules', 'vite-plugin-singlefile');
if (!fs.existsSync(pluginPath)) {
  console.log('[1/3] Installing vite-plugin-singlefile...');
  execSync('npm install vite-plugin-singlefile --save-dev', { stdio: 'inherit' });
} else {
  console.log('[1/3] vite-plugin-singlefile already installed ✓');
}

// Step 2: Run the standalone vite build
console.log('[2/3] Building standalone bundle...');
execSync('npm run build:standalone', { stdio: 'inherit' });

// Step 3: Rename output for clarity
const builtFile = path.join(OUT_DIR, 'index.html');
if (fs.existsSync(builtFile)) {
  fs.copyFileSync(builtFile, OUT_FILE);
  console.log(`[3/3] Done!\n`);
  console.log(`✅ Standalone file ready:`);
  console.log(`   ${path.resolve(OUT_FILE)}`);
  console.log(`\nJust double-click that file to open the app in any browser.`);
  console.log(`No server, no installation, no internet required.\n`);
} else {
  console.error('Build output not found. Check for errors above.');
  process.exit(1);
}

