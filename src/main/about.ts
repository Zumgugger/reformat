/**
 * About module - provides app info for About menu/dialog
 */

import { app, dialog, BrowserWindow } from 'electron';
import { readFileSync } from 'fs';
import path from 'path';

/** Build date - set at build time or use runtime date in dev */
const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString().split('T')[0];

/** Get app version from package.json */
function getAppVersion(): string {
  try {
    // In packaged app, use app.getVersion()
    if (app.isPackaged) {
      return app.getVersion();
    }
    // In development, read from package.json
    const packagePath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/** Get app name */
function getAppName(): string {
  return app.name || 'Reformat';
}

/** Get build date */
function getBuildDate(): string {
  return BUILD_DATE;
}

/** App info object */
export interface AppInfo {
  name: string;
  version: string;
  buildDate: string;
}

/** Get all app info */
export function getAppInfo(): AppInfo {
  return {
    name: getAppName(),
    version: getAppVersion(),
    buildDate: getBuildDate(),
  };
}

/** Show About dialog */
export function showAboutDialog(parentWindow?: BrowserWindow | null): void {
  const info = getAppInfo();
  
  dialog.showMessageBox(parentWindow || BrowserWindow.getFocusedWindow() || undefined as any, {
    type: 'info',
    title: `About ${info.name}`,
    message: info.name,
    detail: `Version: ${info.version}\nBuild Date: ${info.buildDate}\n\nOffline image resizing and reformatting tool.`,
    buttons: ['OK'],
    noLink: true,
  });
}
