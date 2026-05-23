import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { start as startOllama, stop as stopOllama, onStatus, getCurrentStatus } from './ollama.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

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
    win.loadFile(path.join(__dirname, '../out/renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
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
