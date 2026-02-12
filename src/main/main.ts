import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { applySecurity, applyWindowSecurity } from './security';
import { cleanupTempFiles } from './cleanup';
import { setupApplicationMenu } from './menu';

let mainWindow: BrowserWindow | null = null;

const isWsl = (): boolean => {
  const env = process.env;
  return Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP || env.WSLENV);
};

if (isWsl()) {
  app.disableHardwareAcceleration();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Sandbox blocks drag/drop file paths in the renderer; keep disabled for UX.
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Apply per-window security restrictions
  applyWindowSecurity(mainWindow);

  // In development, load from Vite dev server
  // In production, load from built files
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Apply security measures (network blocking)
  applySecurity();

  // Clean up any leftover temp files from previous sessions
  await cleanupTempFiles();

  // Setup application menu (including About)
  setupApplicationMenu();

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
