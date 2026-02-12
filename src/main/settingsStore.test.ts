/**
 * Integration tests for main process settings persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  setUserDataPath,
  getSettingsFilePath,
  loadSettings,
  loadSettingsSync,
  saveSettings,
  saveSettingsSync,
  getSettings,
  updateSettings,
  resetSettings,
  clearSettingsCache,
} from './settingsStore';
import { DEFAULT_SETTINGS, type PersistedSettings } from '../shared/settings';

describe('settingsStore', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reformat-settings-test-'));
    setUserDataPath(tempDir);
    clearSettingsCache();
  });

  afterEach(async () => {
    // Clean up temp directory
    setUserDataPath(null);
    clearSettingsCache();
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getSettingsFilePath', () => {
    it('returns path in custom user data directory', () => {
      const filePath = getSettingsFilePath();
      expect(filePath).toBe(path.join(tempDir, 'settings.json'));
    });
  });

  describe('loadSettings', () => {
    it('returns default settings when file does not exist', async () => {
      const settings = await loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('loads and validates settings from file', async () => {
      const customSettings: PersistedSettings = {
        version: 1,
        outputFormat: 'webp',
        resize: { mode: 'percent', percent: 75 },
        quality: { jpg: 90, webp: 80, heic: 70 },
      };
      const filePath = getSettingsFilePath();
      await fs.promises.writeFile(filePath, JSON.stringify(customSettings), 'utf-8');

      const settings = await loadSettings();
      expect(settings).toEqual(customSettings);
    });

    it('runs migrations on old settings', async () => {
      // v0 format with 'format' instead of 'outputFormat'
      const v0Settings = {
        format: 'png',
        resize: { mode: 'percent', percent: 50 },
      };
      const filePath = getSettingsFilePath();
      await fs.promises.writeFile(filePath, JSON.stringify(v0Settings), 'utf-8');

      const settings = await loadSettings();
      expect(settings.version).toBe(1);
      expect(settings.outputFormat).toBe('png');
      expect(settings.resize).toEqual({ mode: 'percent', percent: 50 });
    });

    it('returns defaults for invalid JSON', async () => {
      const filePath = getSettingsFilePath();
      await fs.promises.writeFile(filePath, 'not valid json', 'utf-8');

      const settings = await loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('validates and corrects invalid settings', async () => {
      const invalidSettings = {
        version: 1,
        outputFormat: 'invalid-format',
        resize: { mode: 'pixels', keepRatio: true, driving: 'maxSide', maxSide: 1000 },
        quality: { jpg: 85, webp: 85, heic: 85 },
      };
      const filePath = getSettingsFilePath();
      await fs.promises.writeFile(filePath, JSON.stringify(invalidSettings), 'utf-8');

      const settings = await loadSettings();
      expect(settings.outputFormat).toBe('same'); // Corrected to default
    });

    it('caches settings after first load', async () => {
      const customSettings: PersistedSettings = {
        version: 1,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 50 },
        quality: { jpg: 80, webp: 85, heic: 85 },
      };
      const filePath = getSettingsFilePath();
      await fs.promises.writeFile(filePath, JSON.stringify(customSettings), 'utf-8');

      // First load
      const settings1 = await loadSettings();
      expect(settings1.outputFormat).toBe('jpg');

      // Modify file directly (should not affect cached value)
      await fs.promises.writeFile(
        filePath,
        JSON.stringify({ ...customSettings, outputFormat: 'png' }),
        'utf-8'
      );

      // Second load should return cached value
      const settings2 = await loadSettings();
      expect(settings2.outputFormat).toBe('jpg');

      // Clear cache and reload
      clearSettingsCache();
      const settings3 = await loadSettings();
      expect(settings3.outputFormat).toBe('png');
    });

    it('returns cloned settings (mutations do not affect cache)', async () => {
      const settings1 = await loadSettings();
      settings1.outputFormat = 'tiff';

      const settings2 = await loadSettings();
      expect(settings2.outputFormat).toBe('same'); // Not affected by mutation
    });
  });

  describe('loadSettingsSync', () => {
    it('returns default settings when file does not exist', () => {
      const settings = loadSettingsSync();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('loads settings synchronously', () => {
      const customSettings: PersistedSettings = {
        version: 1,
        outputFormat: 'heic',
        resize: { mode: 'targetMiB', targetMiB: 5 },
        quality: { jpg: 85, webp: 85, heic: 85 },
      };
      const filePath = getSettingsFilePath();
      fs.writeFileSync(filePath, JSON.stringify(customSettings), 'utf-8');

      const settings = loadSettingsSync();
      expect(settings).toEqual(customSettings);
    });

    it('returns defaults for invalid JSON', () => {
      const filePath = getSettingsFilePath();
      fs.writeFileSync(filePath, '{invalid', 'utf-8');

      const settings = loadSettingsSync();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('saveSettings', () => {
    it('saves settings to file', async () => {
      const settings: PersistedSettings = {
        version: 1,
        outputFormat: 'webp',
        resize: { mode: 'percent', percent: 80 },
        quality: { jpg: 90, webp: 90, heic: 90 },
      };

      await saveSettings(settings);

      const filePath = getSettingsFilePath();
      const data = await fs.promises.readFile(filePath, 'utf-8');
      const saved = JSON.parse(data);
      expect(saved).toEqual(settings);
    });

    it('creates directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'dir');
      setUserDataPath(nestedDir);

      const settings: PersistedSettings = {
        version: 1,
        outputFormat: 'png',
        resize: { mode: 'percent', percent: 100 },
        quality: { jpg: 85, webp: 85, heic: 85 },
      };

      await saveSettings(settings);

      const filePath = getSettingsFilePath();
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('validates settings before saving', async () => {
      const invalidSettings = {
        version: 1,
        outputFormat: 'invalid',
        resize: { mode: 'percent', percent: 50 },
        quality: { jpg: 85, webp: 85, heic: 85 },
      } as PersistedSettings;

      await saveSettings(invalidSettings);

      const filePath = getSettingsFilePath();
      const data = await fs.promises.readFile(filePath, 'utf-8');
      const saved = JSON.parse(data);
      expect(saved.outputFormat).toBe('same'); // Corrected to default
    });

    it('updates cache after save', async () => {
      const settings: PersistedSettings = {
        version: 1,
        outputFormat: 'tiff',
        resize: { mode: 'percent', percent: 25 },
        quality: { jpg: 85, webp: 85, heic: 85 },
      };

      await saveSettings(settings);
      const loaded = await loadSettings();
      expect(loaded).toEqual(settings);
    });

    it('writes atomically (no partial writes)', async () => {
      const settings: PersistedSettings = {
        version: 1,
        outputFormat: 'bmp',
        resize: { mode: 'percent', percent: 100 },
        quality: { jpg: 85, webp: 85, heic: 85 },
      };

      await saveSettings(settings);

      // Temp file should not exist after save
      const tempPath = getSettingsFilePath() + '.tmp';
      expect(fs.existsSync(tempPath)).toBe(false);
    });
  });

  describe('saveSettingsSync', () => {
    it('saves settings synchronously', () => {
      const settings: PersistedSettings = {
        version: 1,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 60 },
        quality: { jpg: 75, webp: 85, heic: 85 },
      };

      saveSettingsSync(settings);

      const filePath = getSettingsFilePath();
      const data = fs.readFileSync(filePath, 'utf-8');
      const saved = JSON.parse(data);
      expect(saved).toEqual(settings);
    });

    it('creates directory if it does not exist', () => {
      const nestedDir = path.join(tempDir, 'sync', 'nested');
      setUserDataPath(nestedDir);

      const settings: PersistedSettings = {
        version: 1,
        outputFormat: 'png',
        resize: { mode: 'percent', percent: 100 },
        quality: { jpg: 85, webp: 85, heic: 85 },
      };

      saveSettingsSync(settings);

      const filePath = getSettingsFilePath();
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('getSettings', () => {
    it('returns settings (same as loadSettings)', async () => {
      const settings = await getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('updateSettings', () => {
    it('updates partial settings', async () => {
      await updateSettings({ outputFormat: 'webp' });

      const settings = await loadSettings();
      expect(settings.outputFormat).toBe('webp');
      expect(settings.resize).toEqual(DEFAULT_SETTINGS.resize);
    });

    it('preserves unmodified settings', async () => {
      const initial: PersistedSettings = {
        version: 1,
        outputFormat: 'png',
        resize: { mode: 'percent', percent: 75 },
        quality: { jpg: 90, webp: 80, heic: 70 },
      };
      await saveSettings(initial);

      await updateSettings({ outputFormat: 'jpg' });

      const settings = await loadSettings();
      expect(settings.outputFormat).toBe('jpg');
      expect(settings.resize).toEqual({ mode: 'percent', percent: 75 });
      expect(settings.quality).toEqual({ jpg: 90, webp: 80, heic: 70 });
    });

    it('returns updated settings', async () => {
      const result = await updateSettings({ outputFormat: 'heic' });
      expect(result.outputFormat).toBe('heic');
    });
  });

  describe('resetSettings', () => {
    it('resets to default settings', async () => {
      const custom: PersistedSettings = {
        version: 1,
        outputFormat: 'tiff',
        resize: { mode: 'targetMiB', targetMiB: 10 },
        quality: { jpg: 50, webp: 50, heic: 50 },
      };
      await saveSettings(custom);

      await resetSettings();

      const settings = await loadSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('returns default settings', async () => {
      const result = await resetSettings();
      expect(result).toEqual(DEFAULT_SETTINGS);
    });
  });
});
