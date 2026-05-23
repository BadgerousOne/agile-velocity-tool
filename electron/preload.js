import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ollamaApi', {
  onStatus:  (cb) => ipcRenderer.on('ollama:status', (_event, status) => cb(status)),
  offStatus: (cb) => ipcRenderer.off('ollama:status', cb),
});
