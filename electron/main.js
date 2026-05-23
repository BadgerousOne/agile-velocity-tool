import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  start as startOllama,
  stop as stopOllama,
  onStatus,
  getCurrentStatus,
  downloadBinary,
  pullModel,
  DEFAULT_MODEL,
} from './ollama.js';
import { check as firstLaunchCheck } from './firstLaunch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// ── Splash window (first-launch only) ────────────────────────────────────────

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

  // In dev, load from source; in production, splash.html is an extraResource
  const splashPath = isDev
    ? path.join(process.cwd(), 'electron', 'splash.html')
    : path.join(process.resourcesPath, 'splash.html');

  win.loadFile(splashPath);
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
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  // Push Ollama status to renderer on every state transition
  const unsubscribe = onStatus(status => {
    if (!win.isDestroyed()) win.webContents.send('ollama:status', status);
  });
  win.once('closed', unsubscribe);

  // Push current status once the renderer finishes loading
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

// ── First-launch setup ────────────────────────────────────────────────────────

async function setup() {
  const { needsBinary, needsModel } = await firstLaunchCheck(DEFAULT_MODEL);
  if (!needsBinary && !needsModel) return;

  const splash    = createSplash();
  const unsubSplash = onStatus(status => {
    if (!splash.isDestroyed()) splash.webContents.send('ollama:status', status);
  });

  try {
    if (needsBinary) await downloadBinary();
    if (needsModel)  await pullModel(DEFAULT_MODEL);
  } catch (err) {
    console.error('[main] First-launch setup error:', err);
    // Give the user time to read the error message before the splash closes
    await new Promise(r => setTimeout(r, 4000));
  } finally {
    unsubSplash();
    if (!splash.isDestroyed()) splash.close();
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await setup();

  createWindow();
  startOllama().catch(err => console.error('[main] Ollama start error:', err));

  // macOS: re-open window when dock icon is clicked and no windows are open
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
