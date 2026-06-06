import { app, BrowserWindow, session } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  start as startOllama,
  stop as stopOllama,
  onStatus,
  getCurrentStatus,
  pullModel,
  prepareBinary,
  DEFAULT_MODEL,
} from './ollama.js';
import { isSetupComplete, markSetupComplete } from './firstLaunch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// ── Splash window (first-launch model download only) ──────────────────────────

function createSplash() {
  const win = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    webPreferences: {
      // Internal-only window; nodeIntegration lets the inline script use ipcRenderer directly
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const splashPath = isDev
    ? path.join(process.cwd(), 'electron', 'splash.html')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'splash.html');

  win.loadFile(splashPath);

  // Sync current status once the splash page has loaded so it doesn't miss
  // events that fired before the webContents was ready.
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('ollama:status', getCurrentStatus());
  });

  win.once('ready-to-show', () => win.show());
  return win;
}

// ── Main window ───────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: isDev
        ? path.join(__dirname, '../preload/index.cjs')
        : path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'preload', 'index.cjs'),
    },
  });

  const unsubscribe = onStatus(status => {
    if (!win.isDestroyed()) win.webContents.send('ollama:status', status);
  });
  win.once('closed', unsubscribe);

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('ollama:status', getCurrentStatus());
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173';
    win.loadURL(rendererUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

// ── CSP hardening ─────────────────────────────────────────────────────────────

function installCSP() {
  if (isDev) return;

  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' http://127.0.0.1:11434 https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com",
    "font-src 'self' data:",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });
}

// ── First-launch setup (model download only) ──────────────────────────────────

async function setup() {
  await prepareBinary();

  // Fast flag-file check — avoids shelling out to `ollama list` on every launch.
  if (isSetupComplete()) return;

  const splash = createSplash();
  const unsubSplash = onStatus(status => {
    if (!splash.isDestroyed()) splash.webContents.send('ollama:status', status);
  });

  try {
    await startOllama();

    // Don't attempt the model pull if the server failed to start.
    if (getCurrentStatus().state !== 'ready') {
      await new Promise(r => setTimeout(r, 6000));
      return;
    }

    await pullModel(DEFAULT_MODEL);
    await markSetupComplete();
  } catch (err) {
    console.error('[main] First-launch setup error:', err);
    await new Promise(r => setTimeout(r, 6000));
  } finally {
    unsubSplash();
    if (!splash.isDestroyed()) splash.close();
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  installCSP();

  // setup() starts Ollama internally when a model pull is needed.
  // If setup returned early (model already present), status is still 'idle'
  // and we need to start Ollama now.
  await setup();
  if (getCurrentStatus().state === 'idle') {
    startOllama().catch(err => console.error('[main] Ollama start error:', err));
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopOllama();
});
