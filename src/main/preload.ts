import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld('reformat', {
  ping: async (): Promise<string> => {
    return await ipcRenderer.invoke('ping');
  },
});
