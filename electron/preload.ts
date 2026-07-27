// Preload script — runs in the renderer's context with Node integration
// disabled and contextIsolation enabled. We expose a tiny, typed surface
// to the page via `contextBridge`. The renderer (Next.js app) treats
// `window.electron` as an optional feature; the existing flow falls back
// to a regular `<input type="file">` when the bridge is absent (browser dev).

import { contextBridge, ipcRenderer } from 'electron';

export interface OpenFileResult {
  name: string;
  bytes: Uint8Array;
}

const api = {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  /** Show the native Open-PDF dialog and read the file as bytes. */
  async openFile(): Promise<OpenFileResult | null> {
    return ipcRenderer.invoke('open-file');
  },
  /** Subscribe to "open file" events from the native menu. Returns an unsubscribe fn. */
  onOpenFile(handler: (result: OpenFileResult) => void): () => void {
    const listener = (
      _e: unknown,
      result: OpenFileResult,
    ): void => {
      handler(result);
    };
    ipcRenderer.on('open-file', listener);
    return () => ipcRenderer.off('open-file', listener);
  },
  /** Quit the desktop app (used by the in-app "Quit" menu item, if added). */
  quit(): void {
    ipcRenderer.send('quit');
  },
};

export type ElectronApi = typeof api;

contextBridge.exposeInMainWorld('electron', api);
