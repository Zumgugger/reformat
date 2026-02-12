/**
 * Unit tests for renderer settings store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSettingsStore, type SettingsStore, type SettingsEvent } from './settingsStore';
import { DEFAULT_SETTINGS, cloneSettings, type PersistedSettings } from '../shared/settings';

// Mock the window.reformat API
const mockReformat = {
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
  updateSettings: vi.fn(),
  resetSettings: vi.fn(),
};

// Set up global window.reformat mock
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).window = {
    reformat: mockReformat,
  };
});

describe('createSettingsStore', () => {
  let store: SettingsStore;

  beforeEach(() => {
    store = createSettingsStore();
  });

  describe('initial state', () => {
    it('starts with default settings', () => {
      const state = store.getState();
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('starts unlocked', () => {
      expect(store.getState().locked).toBe(false);
    });

    it('starts not dirty', () => {
      expect(store.getState().dirty).toBe(false);
    });

    it('starts not loading', () => {
      expect(store.getState().loading).toBe(false);
    });

    it('starts with no error', () => {
      expect(store.getState().error).toBeNull();
    });
  });

  describe('getSettings', () => {
    it('returns a clone of settings', () => {
      const settings1 = store.getSettings();
      const settings2 = store.getSettings();
      expect(settings1).toEqual(settings2);
      expect(settings1).not.toBe(settings2);
    });

    it('mutations do not affect store', () => {
      const settings = store.getSettings();
      settings.outputFormat = 'tiff';
      expect(store.getState().settings.outputFormat).toBe('same');
    });
  });

  describe('subscribe', () => {
    it('calls listener immediately with current state', () => {
      const listener = vi.fn();
      store.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(store.getState(), 'change');
    });

    it('returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      expect(typeof unsubscribe).toBe('function');

      listener.mockClear();
      store.setOutputFormat('jpg');
      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      unsubscribe();
      store.setOutputFormat('png');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('load', () => {
    it('loads settings from main process', async () => {
      const customSettings: PersistedSettings = {
        ...DEFAULT_SETTINGS,
        outputFormat: 'webp',
      };
      mockReformat.loadSettings.mockResolvedValue(customSettings);

      await store.load();

      expect(mockReformat.loadSettings).toHaveBeenCalled();
      expect(store.getState().settings.outputFormat).toBe('webp');
    });

    it('sets loading state during load', async () => {
      const states: boolean[] = [];
      mockReformat.loadSettings.mockImplementation(async () => {
        states.push(store.getState().loading);
        return DEFAULT_SETTINGS;
      });

      store.subscribe(() => {
        states.push(store.getState().loading);
      });

      await store.load();

      // Should have been true at some point
      expect(states).toContain(true);
      // Should end as false
      expect(store.getState().loading).toBe(false);
    });

    it('emits loaded event', async () => {
      mockReformat.loadSettings.mockResolvedValue(DEFAULT_SETTINGS);

      const events: SettingsEvent[] = [];
      store.subscribe((_, event) => events.push(event));

      await store.load();

      expect(events).toContain('loaded');
    });

    it('sets error on failure', async () => {
      mockReformat.loadSettings.mockRejectedValue(new Error('Network error'));

      await store.load();

      expect(store.getState().error).toBe('Network error');
      expect(store.getState().loading).toBe(false);
    });

    it('clears dirty flag after load', async () => {
      mockReformat.loadSettings.mockResolvedValue(DEFAULT_SETTINGS);

      store.setOutputFormat('jpg'); // Make dirty
      expect(store.getState().dirty).toBe(true);

      await store.load();

      expect(store.getState().dirty).toBe(false);
    });
  });

  describe('save', () => {
    it('saves settings to main process', async () => {
      mockReformat.saveSettings.mockResolvedValue(undefined);

      store.setOutputFormat('png');
      await store.save();

      expect(mockReformat.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ outputFormat: 'png' })
      );
    });

    it('clears dirty flag after save', async () => {
      mockReformat.saveSettings.mockResolvedValue(undefined);

      store.setOutputFormat('jpg');
      expect(store.getState().dirty).toBe(true);

      await store.save();

      expect(store.getState().dirty).toBe(false);
    });

    it('emits saved event', async () => {
      mockReformat.saveSettings.mockResolvedValue(undefined);

      const events: SettingsEvent[] = [];
      store.subscribe((_, event) => events.push(event));

      await store.save();

      expect(events).toContain('saved');
    });

    it('does not save when locked', async () => {
      store.lock();
      await store.save();

      expect(mockReformat.saveSettings).not.toHaveBeenCalled();
    });

    it('sets error on failure', async () => {
      mockReformat.saveSettings.mockRejectedValue(new Error('Write error'));

      await store.save();

      expect(store.getState().error).toBe('Write error');
    });
  });

  describe('setOutputFormat', () => {
    it('updates output format', () => {
      store.setOutputFormat('webp');
      expect(store.getState().settings.outputFormat).toBe('webp');
    });

    it('marks settings as dirty', () => {
      store.setOutputFormat('jpg');
      expect(store.getState().dirty).toBe(true);
    });

    it('returns true on success', () => {
      expect(store.setOutputFormat('png')).toBe(true);
    });

    it('returns false when locked', () => {
      store.lock();
      expect(store.setOutputFormat('jpg')).toBe(false);
    });

    it('does not modify when locked', () => {
      store.lock();
      store.setOutputFormat('tiff');
      expect(store.getState().settings.outputFormat).toBe('same');
    });

    it('emits change event', () => {
      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.setOutputFormat('bmp');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('setResizeSettings', () => {
    it('updates resize settings', () => {
      store.setResizeSettings({ mode: 'percent', percent: 75 });
      expect(store.getState().settings.resize).toEqual({ mode: 'percent', percent: 75 });
    });

    it('marks settings as dirty', () => {
      store.setResizeSettings({ mode: 'percent', percent: 50 });
      expect(store.getState().dirty).toBe(true);
    });

    it('returns false when locked', () => {
      store.lock();
      expect(store.setResizeSettings({ mode: 'percent', percent: 25 })).toBe(false);
    });

    it('clones resize settings', () => {
      const resize = { mode: 'percent' as const, percent: 80 };
      store.setResizeSettings(resize);
      resize.percent = 10;
      expect((store.getState().settings.resize as any).percent).toBe(80);
    });
  });

  describe('setQualitySettings', () => {
    it('updates quality settings', () => {
      store.setQualitySettings({ jpg: 90, webp: 80, heic: 70 });
      expect(store.getState().settings.quality).toEqual({ jpg: 90, webp: 80, heic: 70 });
    });

    it('returns false when locked', () => {
      store.lock();
      expect(store.setQualitySettings({ jpg: 50, webp: 50, heic: 50 })).toBe(false);
    });
  });

  describe('setQuality', () => {
    it('updates individual quality value', () => {
      store.setQuality('jpg', 90);
      expect(store.getState().settings.quality.jpg).toBe(90);
      expect(store.getState().settings.quality.webp).toBe(85); // unchanged
    });

    it('clamps value to valid range (40-100)', () => {
      store.setQuality('jpg', 25);
      expect(store.getState().settings.quality.jpg).toBe(40);

      store.setQuality('webp', 150);
      expect(store.getState().settings.quality.webp).toBe(100);
    });

    it('rounds value to integer', () => {
      store.setQuality('heic', 77.7);
      expect(store.getState().settings.quality.heic).toBe(78);
    });

    it('returns false when locked', () => {
      store.lock();
      expect(store.setQuality('jpg', 60)).toBe(false);
    });
  });

  describe('setSettings', () => {
    it('updates all settings at once', () => {
      const newSettings: PersistedSettings = {
        version: 1,
        outputFormat: 'heic',
        resize: { mode: 'targetMiB', targetMiB: 5 },
        quality: { jpg: 70, webp: 70, heic: 70 },
      };
      store.setSettings(newSettings);
      expect(store.getState().settings).toEqual(newSettings);
    });

    it('returns false when locked', () => {
      store.lock();
      expect(store.setSettings(DEFAULT_SETTINGS)).toBe(false);
    });
  });

  describe('lock / unlock', () => {
    it('locks settings', () => {
      store.lock();
      expect(store.getState().locked).toBe(true);
    });

    it('unlocks settings', () => {
      store.lock();
      store.unlock();
      expect(store.getState().locked).toBe(false);
    });

    it('emits locked event', () => {
      const events: SettingsEvent[] = [];
      store.subscribe((_, event) => events.push(event));

      store.lock();

      expect(events).toContain('locked');
    });

    it('emits unlocked event', () => {
      store.lock();

      const events: SettingsEvent[] = [];
      store.subscribe((_, event) => events.push(event));

      store.unlock();

      expect(events).toContain('unlocked');
    });

    it('does not emit if already locked', () => {
      store.lock();

      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.lock();

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not emit if already unlocked', () => {
      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.unlock();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('resets to default settings via main process', async () => {
      mockReformat.resetSettings.mockResolvedValue(cloneSettings(DEFAULT_SETTINGS));

      store.setOutputFormat('tiff');
      await store.reset();

      expect(mockReformat.resetSettings).toHaveBeenCalled();
      expect(store.getState().settings.outputFormat).toBe('same');
    });

    it('does not reset when locked', async () => {
      store.lock();
      await store.reset();

      expect(mockReformat.resetSettings).not.toHaveBeenCalled();
    });

    it('clears dirty flag after reset', async () => {
      mockReformat.resetSettings.mockResolvedValue(cloneSettings(DEFAULT_SETTINGS));

      store.setOutputFormat('jpg');
      await store.reset();

      expect(store.getState().dirty).toBe(false);
    });
  });

  describe('discardChanges', () => {
    it('reverts to persisted settings', async () => {
      const persisted: PersistedSettings = {
        ...DEFAULT_SETTINGS,
        outputFormat: 'webp',
      };
      mockReformat.loadSettings.mockResolvedValue(persisted);

      await store.load();
      store.setOutputFormat('tiff');
      expect(store.getState().settings.outputFormat).toBe('tiff');

      store.discardChanges();

      expect(store.getState().settings.outputFormat).toBe('webp');
    });

    it('clears dirty flag', async () => {
      mockReformat.loadSettings.mockResolvedValue(DEFAULT_SETTINGS);
      await store.load();

      store.setOutputFormat('jpg');
      expect(store.getState().dirty).toBe(true);

      store.discardChanges();

      expect(store.getState().dirty).toBe(false);
    });

    it('returns false when locked', () => {
      store.lock();
      expect(store.discardChanges()).toBe(false);
    });
  });

  describe('formatUsesQuality', () => {
    it('returns true for jpg, webp, heic', () => {
      expect(store.formatUsesQuality('jpg')).toBe(true);
      expect(store.formatUsesQuality('webp')).toBe(true);
      expect(store.formatUsesQuality('heic')).toBe(true);
    });

    it('returns false for png, tiff, bmp, same', () => {
      expect(store.formatUsesQuality('png')).toBe(false);
      expect(store.formatUsesQuality('tiff')).toBe(false);
      expect(store.formatUsesQuality('bmp')).toBe(false);
      expect(store.formatUsesQuality('same')).toBe(false);
    });
  });

  describe('getEffectiveQuality', () => {
    it('returns jpg quality for same format', () => {
      store.setQuality('jpg', 90);
      expect(store.getEffectiveQuality()).toBe(90);
    });

    it('returns correct quality for each format', () => {
      store.setQualitySettings({ jpg: 90, webp: 80, heic: 70 });

      store.setOutputFormat('jpg');
      expect(store.getEffectiveQuality()).toBe(90);

      store.setOutputFormat('webp');
      expect(store.getEffectiveQuality()).toBe(80);

      store.setOutputFormat('heic');
      expect(store.getEffectiveQuality()).toBe(70);
    });

    it('returns null for formats without quality', () => {
      store.setOutputFormat('png');
      expect(store.getEffectiveQuality()).toBeNull();

      store.setOutputFormat('tiff');
      expect(store.getEffectiveQuality()).toBeNull();

      store.setOutputFormat('bmp');
      expect(store.getEffectiveQuality()).toBeNull();
    });
  });

  describe('dirty tracking', () => {
    it('becomes dirty when settings change', () => {
      expect(store.getState().dirty).toBe(false);
      store.setOutputFormat('jpg');
      expect(store.getState().dirty).toBe(true);
    });

    it('becomes clean when reverted to original', async () => {
      mockReformat.loadSettings.mockResolvedValue(DEFAULT_SETTINGS);
      await store.load();

      store.setOutputFormat('jpg');
      expect(store.getState().dirty).toBe(true);

      store.setOutputFormat('same');
      expect(store.getState().dirty).toBe(false);
    });

    it('tracks resize changes', () => {
      store.setResizeSettings({ mode: 'percent', percent: 50 });
      expect(store.getState().dirty).toBe(true);
    });

    it('tracks quality changes', () => {
      store.setQuality('jpg', 90);
      expect(store.getState().dirty).toBe(true);
    });
  });
});
