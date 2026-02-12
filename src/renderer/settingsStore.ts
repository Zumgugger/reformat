/**
 * Renderer settings store.
 * Manages settings state with support for locking during runs.
 */

import type {
  PersistedSettings,
  OutputFormat,
  QualitySettings,
  ResizeSettings,
} from './types';
import {
  DEFAULT_SETTINGS,
  cloneSettings,
  settingsEqual,
} from '../shared/settings';

/** Settings store state */
export interface SettingsState {
  /** Current settings (may differ from persisted if not yet saved) */
  settings: PersistedSettings;
  /** Whether settings are locked (during a run) */
  locked: boolean;
  /** Whether settings have been modified since last save */
  dirty: boolean;
  /** Whether settings are currently loading */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
}

/** Settings store event types */
export type SettingsEvent =
  | 'change'
  | 'loaded'
  | 'saved'
  | 'locked'
  | 'unlocked'
  | 'error';

/** Settings store event listener */
export type SettingsListener = (state: SettingsState, event: SettingsEvent) => void;

/**
 * Create a new settings store instance.
 */
export function createSettingsStore() {
  let state: SettingsState = {
    settings: cloneSettings(DEFAULT_SETTINGS),
    locked: false,
    dirty: false,
    loading: false,
    error: null,
  };

  /** Persisted settings snapshot (for dirty tracking) */
  let persistedSettings: PersistedSettings = cloneSettings(DEFAULT_SETTINGS);

  const listeners = new Set<SettingsListener>();

  function emit(event: SettingsEvent) {
    for (const listener of listeners) {
      listener(state, event);
    }
  }

  function updateDirty() {
    state.dirty = !settingsEqual(state.settings, persistedSettings);
  }

  return {
    /** Get current state (read-only snapshot) */
    getState(): Readonly<SettingsState> {
      return state;
    },

    /** Get current settings (cloned) */
    getSettings(): PersistedSettings {
      return cloneSettings(state.settings);
    },

    /** Subscribe to state changes */
    subscribe(listener: SettingsListener): () => void {
      listeners.add(listener);
      // Call immediately with current state
      listener(state, 'change');
      // Return unsubscribe function
      return () => listeners.delete(listener);
    },

    /** Load settings from main process */
    async load(): Promise<void> {
      state = { ...state, loading: true, error: null };
      emit('change');

      try {
        const loaded = await window.reformat.loadSettings();
        persistedSettings = cloneSettings(loaded);
        state = {
          ...state,
          settings: cloneSettings(loaded),
          loading: false,
          dirty: false,
          error: null,
        };
        emit('loaded');
        emit('change');
      } catch (error) {
        state = {
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load settings',
        };
        emit('error');
        emit('change');
      }
    },

    /** Save current settings to main process */
    async save(): Promise<void> {
      if (state.locked) {
        console.warn('Cannot save settings while locked');
        return;
      }

      try {
        await window.reformat.saveSettings(state.settings);
        persistedSettings = cloneSettings(state.settings);
        state = { ...state, dirty: false, error: null };
        emit('saved');
        emit('change');
      } catch (error) {
        state = {
          ...state,
          error: error instanceof Error ? error.message : 'Failed to save settings',
        };
        emit('error');
        emit('change');
      }
    },

    /** Update output format */
    setOutputFormat(format: OutputFormat): boolean {
      if (state.locked) {
        console.warn('Cannot modify settings while locked');
        return false;
      }

      state = {
        ...state,
        settings: {
          ...state.settings,
          outputFormat: format,
        },
      };
      updateDirty();
      emit('change');
      return true;
    },

    /** Update resize settings */
    setResizeSettings(resize: ResizeSettings): boolean {
      if (state.locked) {
        console.warn('Cannot modify settings while locked');
        return false;
      }

      state = {
        ...state,
        settings: {
          ...state.settings,
          resize: { ...resize } as ResizeSettings,
        },
      };
      updateDirty();
      emit('change');
      return true;
    },

    /** Update quality settings */
    setQualitySettings(quality: QualitySettings): boolean {
      if (state.locked) {
        console.warn('Cannot modify settings while locked');
        return false;
      }

      state = {
        ...state,
        settings: {
          ...state.settings,
          quality: { ...quality },
        },
      };
      updateDirty();
      emit('change');
      return true;
    },

    /** Update a single quality value */
    setQuality(format: keyof QualitySettings, value: number): boolean {
      if (state.locked) {
        console.warn('Cannot modify settings while locked');
        return false;
      }

      // Clamp to valid range
      const clamped = Math.max(40, Math.min(100, Math.round(value)));

      state = {
        ...state,
        settings: {
          ...state.settings,
          quality: {
            ...state.settings.quality,
            [format]: clamped,
          },
        },
      };
      updateDirty();
      emit('change');
      return true;
    },

    /** Update all settings at once */
    setSettings(settings: PersistedSettings): boolean {
      if (state.locked) {
        console.warn('Cannot modify settings while locked');
        return false;
      }

      state = {
        ...state,
        settings: cloneSettings(settings),
      };
      updateDirty();
      emit('change');
      return true;
    },

    /** Lock settings (during a run) */
    lock(): void {
      if (state.locked) return;

      state = { ...state, locked: true };
      emit('locked');
      emit('change');
    },

    /** Unlock settings (after a run) */
    unlock(): void {
      if (!state.locked) return;

      state = { ...state, locked: false };
      emit('unlocked');
      emit('change');
    },

    /** Reset to default settings */
    async reset(): Promise<void> {
      if (state.locked) {
        console.warn('Cannot reset settings while locked');
        return;
      }

      try {
        const defaults = await window.reformat.resetSettings();
        persistedSettings = cloneSettings(defaults);
        state = {
          ...state,
          settings: cloneSettings(defaults),
          dirty: false,
          error: null,
        };
        emit('saved');
        emit('change');
      } catch (error) {
        state = {
          ...state,
          error: error instanceof Error ? error.message : 'Failed to reset settings',
        };
        emit('error');
        emit('change');
      }
    },

    /** Discard unsaved changes and reload from persisted */
    discardChanges(): boolean {
      if (state.locked) {
        console.warn('Cannot discard changes while locked');
        return false;
      }

      state = {
        ...state,
        settings: cloneSettings(persistedSettings),
        dirty: false,
      };
      emit('change');
      return true;
    },

    /** Check if a specific format uses quality setting */
    formatUsesQuality(format: OutputFormat): boolean {
      return format === 'jpg' || format === 'webp' || format === 'heic';
    },

    /** Get the effective quality for current format */
    getEffectiveQuality(): number | null {
      const format = state.settings.outputFormat;
      if (format === 'same') {
        // For "same", quality depends on the input format
        // Return jpg quality as default
        return state.settings.quality.jpg;
      }
      if (format === 'jpg') return state.settings.quality.jpg;
      if (format === 'webp') return state.settings.quality.webp;
      if (format === 'heic') return state.settings.quality.heic;
      return null; // PNG, TIFF, BMP don't use quality
    },
  };
}

/** Export store type for testing */
export type SettingsStore = ReturnType<typeof createSettingsStore>;

/** The global settings store instance */
export const settingsStore = createSettingsStore();
