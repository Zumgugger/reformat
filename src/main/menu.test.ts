/**
 * Tests for the application menu module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    name: 'Reformat',
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },
}));

// Mock about module
vi.mock('./about', () => ({
  showAboutDialog: vi.fn(),
}));

describe('menu', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('setupApplicationMenu', () => {
    it('should be a function', async () => {
      const { setupApplicationMenu } = await import('./menu');
      expect(typeof setupApplicationMenu).toBe('function');
    });

    it('should call Menu.buildFromTemplate', async () => {
      const { Menu } = await import('electron');
      const { setupApplicationMenu } = await import('./menu');
      
      setupApplicationMenu();
      
      expect(Menu.buildFromTemplate).toHaveBeenCalled();
    });

    it('should call Menu.setApplicationMenu', async () => {
      const { Menu } = await import('electron');
      const { setupApplicationMenu } = await import('./menu');
      
      setupApplicationMenu();
      
      expect(Menu.setApplicationMenu).toHaveBeenCalled();
    });

    it('should build menu with correct structure', async () => {
      const { Menu } = await import('electron');
      const { setupApplicationMenu } = await import('./menu');
      
      setupApplicationMenu();
      
      const buildCall = (Menu.buildFromTemplate as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(buildCall).toBeDefined();
      
      const template = buildCall[0];
      expect(Array.isArray(template)).toBe(true);
    });
  });

  describe('menu structure (non-macOS)', () => {
    beforeEach(() => {
      vi.stubGlobal('process', { ...process, platform: 'win32' });
    });

    it('should have File menu', async () => {
      vi.resetModules();
      const { Menu } = await import('electron');
      const { setupApplicationMenu } = await import('./menu');
      
      setupApplicationMenu();
      
      const template = (Menu.buildFromTemplate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const fileMenu = template.find((item: any) => item.label === 'File');
      expect(fileMenu).toBeDefined();
    });

    it('should have Edit menu', async () => {
      vi.resetModules();
      const { Menu } = await import('electron');
      const { setupApplicationMenu } = await import('./menu');
      
      setupApplicationMenu();
      
      const template = (Menu.buildFromTemplate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const editMenu = template.find((item: any) => item.label === 'Edit');
      expect(editMenu).toBeDefined();
    });

    it('should have View menu', async () => {
      vi.resetModules();
      const { Menu } = await import('electron');
      const { setupApplicationMenu } = await import('./menu');
      
      setupApplicationMenu();
      
      const template = (Menu.buildFromTemplate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const viewMenu = template.find((item: any) => item.label === 'View');
      expect(viewMenu).toBeDefined();
    });

    it('should have Help menu with About item', async () => {
      vi.resetModules();
      const { Menu } = await import('electron');
      const { setupApplicationMenu } = await import('./menu');
      
      setupApplicationMenu();
      
      const template = (Menu.buildFromTemplate as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const helpMenu = template.find((item: any) => item.label === 'Help');
      expect(helpMenu).toBeDefined();
      
      const aboutItem = helpMenu.submenu.find((item: any) => item.label?.includes('About'));
      expect(aboutItem).toBeDefined();
    });
  });
});
