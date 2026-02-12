/**
 * Tests for the About module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    name: 'Reformat',
    isPackaged: false,
    getVersion: vi.fn(() => '1.0.0'),
  },
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
  },
}));

// Mock fs for package.json reading
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => JSON.stringify({ version: '1.0.0' })),
}));

describe('about', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('getAppInfo', () => {
    it('should return app info with name, version, and build date', async () => {
      const { getAppInfo } = await import('./about');
      const info = getAppInfo();
      
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('buildDate');
      expect(typeof info.name).toBe('string');
      expect(typeof info.version).toBe('string');
      expect(typeof info.buildDate).toBe('string');
    });

    it('should return Reformat as the app name', async () => {
      const { getAppInfo } = await import('./about');
      const info = getAppInfo();
      
      expect(info.name).toBe('Reformat');
    });

    it('should return a valid version string', async () => {
      const { getAppInfo } = await import('./about');
      const info = getAppInfo();
      
      // Version should be in semver format or similar
      expect(info.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should return a valid build date', async () => {
      const { getAppInfo } = await import('./about');
      const info = getAppInfo();
      
      // Build date should be a date string
      expect(info.buildDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('showAboutDialog', () => {
    it('should be a function', async () => {
      const { showAboutDialog } = await import('./about');
      expect(typeof showAboutDialog).toBe('function');
    });

    it('should call dialog.showMessageBox', async () => {
      const { dialog } = await import('electron');
      const { showAboutDialog } = await import('./about');
      
      showAboutDialog();
      
      expect(dialog.showMessageBox).toHaveBeenCalled();
    });
  });
});
