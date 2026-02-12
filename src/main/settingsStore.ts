/**
 * Main process settings persistence.
 * Handles loading and saving settings to the user data directory.
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  type PersistedSettings,
  DEFAULT_SETTINGS,
  validateSettings,
  cloneSettings,
} from '../shared/settings';

/** Settings filename */
const SETTINGS_FILENAME = 'settings.json';

/** In-memory settings cache */
let cachedSettings: PersistedSettings | null = null;

/** Custom user data path for testing */
let customUserDataPath: string | null = null;

/**
 * Set a custom user data path (for testing).
 */
export function setUserDataPath(customPath: string | null): void {
  customUserDataPath = customPath;
  cachedSettings = null; // Clear cache when path changes
}

/**
 * Get the path to the settings file.
 */
export function getSettingsFilePath(): string {
  const userDataPath = customUserDataPath ?? app.getPath('userData');
  return path.join(userDataPath, SETTINGS_FILENAME);
}

/**
 * Load settings from disk.
 * Returns default settings if file doesn't exist or is invalid.
 */
export async function loadSettings(): Promise<PersistedSettings> {
  if (cachedSettings) {
    return cloneSettings(cachedSettings);
  }

  const filePath = getSettingsFilePath();

  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    const raw = JSON.parse(data);
    cachedSettings = validateSettings(raw);
    return cloneSettings(cachedSettings);
  } catch (error) {
    // File doesn't exist or is unreadable - use defaults
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      cachedSettings = cloneSettings(DEFAULT_SETTINGS);
      return cloneSettings(cachedSettings);
    }

    // JSON parse error or other error - use defaults
    console.warn('Failed to load settings, using defaults:', error);
    cachedSettings = cloneSettings(DEFAULT_SETTINGS);
    return cloneSettings(cachedSettings);
  }
}

/**
 * Load settings synchronously (for startup).
 * Returns default settings if file doesn't exist or is invalid.
 */
export function loadSettingsSync(): PersistedSettings {
  if (cachedSettings) {
    return cloneSettings(cachedSettings);
  }

  const filePath = getSettingsFilePath();

  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const raw = JSON.parse(data);
    cachedSettings = validateSettings(raw);
    return cloneSettings(cachedSettings);
  } catch (error) {
    // File doesn't exist or is unreadable - use defaults
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      cachedSettings = cloneSettings(DEFAULT_SETTINGS);
      return cloneSettings(cachedSettings);
    }

    // JSON parse error or other error - use defaults
    console.warn('Failed to load settings synchronously, using defaults:', error);
    cachedSettings = cloneSettings(DEFAULT_SETTINGS);
    return cloneSettings(cachedSettings);
  }
}

/**
 * Save settings to disk atomically.
 * Writes to a temp file first, then renames to avoid corruption.
 */
export async function saveSettings(settings: PersistedSettings): Promise<void> {
  const filePath = getSettingsFilePath();
  const tempPath = filePath + '.tmp';
  const dirPath = path.dirname(filePath);

  // Validate settings before saving
  const validated = validateSettings(settings);

  // Ensure directory exists
  await fs.promises.mkdir(dirPath, { recursive: true });

  // Write to temp file
  const json = JSON.stringify(validated, null, 2);
  await fs.promises.writeFile(tempPath, json, 'utf-8');

  // Atomic rename
  await fs.promises.rename(tempPath, filePath);

  // Update cache
  cachedSettings = cloneSettings(validated);
}

/**
 * Save settings synchronously.
 * Used during app shutdown when async operations may not complete.
 */
export function saveSettingsSync(settings: PersistedSettings): void {
  const filePath = getSettingsFilePath();
  const tempPath = filePath + '.tmp';
  const dirPath = path.dirname(filePath);

  // Validate settings before saving
  const validated = validateSettings(settings);

  // Ensure directory exists
  fs.mkdirSync(dirPath, { recursive: true });

  // Write to temp file
  const json = JSON.stringify(validated, null, 2);
  fs.writeFileSync(tempPath, json, 'utf-8');

  // Atomic rename
  fs.renameSync(tempPath, filePath);

  // Update cache
  cachedSettings = cloneSettings(validated);
}

/**
 * Get current settings from cache or load from disk.
 */
export async function getSettings(): Promise<PersistedSettings> {
  return loadSettings();
}

/**
 * Update settings (partial update).
 */
export async function updateSettings(
  partial: Partial<PersistedSettings>
): Promise<PersistedSettings> {
  const current = await loadSettings();
  const updated: PersistedSettings = {
    ...current,
    ...partial,
    // Ensure version is always current
    version: current.version,
  };

  await saveSettings(updated);
  return cloneSettings(updated);
}

/**
 * Reset settings to defaults.
 */
export async function resetSettings(): Promise<PersistedSettings> {
  const defaults = cloneSettings(DEFAULT_SETTINGS);
  await saveSettings(defaults);
  return defaults;
}

/**
 * Clear the settings cache (for testing).
 */
export function clearSettingsCache(): void {
  cachedSettings = null;
}
