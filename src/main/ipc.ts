import { ipcMain } from 'electron';

export function registerIpcHandlers(): void {
  // Minimal ping handler for testing the bridge
  ipcMain.handle('ping', async () => {
    return 'pong';
  });
}
