import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserAPI, BrowserState } from './browser';

const browser: BrowserAPI = {
  act: (action) => ipcRenderer.send('browser:action', action),
  ready: () => ipcRenderer.send('browser:ready'),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) =>
      listener(state);
    ipcRenderer.on('browser:state', handler);
    return () => ipcRenderer.removeListener('browser:state', handler);
  },
  onFocusAddress: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('browser:focus-address', handler);
    return () => ipcRenderer.removeListener('browser:focus-address', handler);
  },
};

contextBridge.exposeInMainWorld('browser', browser);
