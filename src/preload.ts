import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserAPI, BrowserState } from './browser';

const browser: BrowserAPI = {
  platform: process.platform,
  act: (action) => ipcRenderer.send('browser:action', action),
  ready: () => ipcRenderer.send('browser:ready'),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) =>
      listener(state);
    ipcRenderer.on('browser:state', handler);
    return () => ipcRenderer.removeListener('browser:state', handler);
  },
};

contextBridge.exposeInMainWorld('browser', browser);
