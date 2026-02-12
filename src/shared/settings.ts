/**
 * Settings schema and persistence utilities.
 * Settings are versioned for migration support.
 */

import type {
  OutputFormat,
  ResizeSettings,
  QualitySettings,
  DrivingDimension,
  CropRatioPreset,
} from './types';
import { DEFAULT_QUALITY } from './types';

/** Current settings schema version */
export const SETTINGS_VERSION = 1;

/**
 * Persisted settings schema (v1).
 * All fields must be serializable to JSON.
 */
export interface PersistedSettings {
  /** Schema version for migrations */
  version: number;
  /** Output format setting */
  outputFormat: OutputFormat;
  /** Resize settings */
  resize: ResizeSettings;
  /** Quality settings per format */
  quality: QualitySettings;
  /** Crop ratio preset selection persisted across sessions */
  cropRatioPreset?: CropRatioPreset;
}

/**
 * Raw settings data from file (may be any version or malformed).
 */
export type RawSettings = Record<string, unknown>;

/**
 * Default resize settings: no resize (keep original pixel size).
 * Per spec: "On first launch (no saved settings yet): default is 'no resize'"
 */
export const DEFAULT_RESIZE_SETTINGS: ResizeSettings = {
  mode: 'pixels',
  keepRatio: true,
  driving: 'maxSide',
  maxSide: undefined, // No resize when undefined
};

/**
 * Default persisted settings.
 */
export const DEFAULT_SETTINGS: PersistedSettings = {
  version: SETTINGS_VERSION,
  outputFormat: 'same',
  resize: DEFAULT_RESIZE_SETTINGS,
  quality: { ...DEFAULT_QUALITY },
};

/**
 * Validate output format value.
 */
export function isValidOutputFormat(value: unknown): value is OutputFormat {
  const validFormats: OutputFormat[] = [
    'same',
    'jpg',
    'png',
    'heic',
    'webp',
    'tiff',
    'bmp',
  ];
  return typeof value === 'string' && validFormats.includes(value as OutputFormat);
}

/**
 * Validate driving dimension value.
 */
export function isValidDrivingDimension(value: unknown): value is DrivingDimension {
  const valid: DrivingDimension[] = ['width', 'height', 'maxSide'];
  return typeof value === 'string' && valid.includes(value as DrivingDimension);
}

/**
 * Validate quality value (40-100).
 */
export function isValidQuality(value: unknown): value is number {
  return typeof value === 'number' && value >= 40 && value <= 100 && Number.isFinite(value);
}

/**
 * Validate quality settings object.
 */
export function validateQualitySettings(raw: unknown): QualitySettings {
  const defaults = { ...DEFAULT_QUALITY };
  
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  
  const obj = raw as Record<string, unknown>;
  
  return {
    jpg: isValidQuality(obj.jpg) ? obj.jpg : defaults.jpg,
    webp: isValidQuality(obj.webp) ? obj.webp : defaults.webp,
    heic: isValidQuality(obj.heic) ? obj.heic : defaults.heic,
  };
}

/**
 * Validate resize settings.
 */
export function validateResizeSettings(raw: unknown): ResizeSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_RESIZE_SETTINGS };
  }
  
  const obj = raw as Record<string, unknown>;
  const mode = obj.mode;
  
  if (mode === 'percent') {
    const percent = typeof obj.percent === 'number' && obj.percent > 0 && obj.percent <= 1000
      ? obj.percent
      : 100;
    return { mode: 'percent', percent };
  }
  
  if (mode === 'targetMiB') {
    const targetMiB = typeof obj.targetMiB === 'number' && obj.targetMiB > 0 && obj.targetMiB <= 100
      ? obj.targetMiB
      : 2;
    return { mode: 'targetMiB', targetMiB };
  }
  
  // Default to pixels mode
  const keepRatio = typeof obj.keepRatio === 'boolean' ? obj.keepRatio : true;
  const driving = isValidDrivingDimension(obj.driving) ? obj.driving : 'maxSide';
  
  const result: ResizeSettings = {
    mode: 'pixels',
    keepRatio,
    driving,
  };
  
  if (typeof obj.width === 'number' && obj.width > 0 && obj.width <= 50000) {
    result.width = Math.round(obj.width);
  }
  if (typeof obj.height === 'number' && obj.height > 0 && obj.height <= 50000) {
    result.height = Math.round(obj.height);
  }
  if (typeof obj.maxSide === 'number' && obj.maxSide > 0 && obj.maxSide <= 50000) {
    result.maxSide = Math.round(obj.maxSide);
  }
  
  // If no dimensions set, leave undefined to represent "no resize" (spec default)
  // This allows the renderer to show "Original size" state
  
  return result;
}

/**
 * Migrate settings from v0 (or missing version) to v1.
 * v0 had no version field and potentially different field names.
 */
export function migrateV0ToV1(raw: RawSettings): RawSettings {
  // If version exists and is >= 1, no migration needed
  if (typeof raw.version === 'number' && raw.version >= 1) {
    return raw;
  }
  
  // v0 migration: just add version and ensure structure
  const migrated: RawSettings = {
    ...raw,
    version: 1,
  };
  
  // v0 might have had 'format' instead of 'outputFormat'
  if ('format' in raw && !('outputFormat' in raw)) {
    migrated.outputFormat = raw.format;
    delete migrated.format;
  }
  
  // v0 might have had 'resizeSettings' instead of 'resize'
  if ('resizeSettings' in raw && !('resize' in raw)) {
    migrated.resize = raw.resizeSettings;
    delete migrated.resizeSettings;
  }
  
  return migrated;
}

/**
 * Run all migrations on raw settings data.
 */
export function migrateSettings(raw: RawSettings): RawSettings {
  let migrated = raw;
  
  // Run v0 -> v1 migration
  migrated = migrateV0ToV1(migrated);
  
  // Future migrations would be added here:
  // if (migrated.version === 1) {
  //   migrated = migrateV1ToV2(migrated);
  // }
  
  return migrated;
}

/**
 * Validate and normalize raw settings data to PersistedSettings.
 * Returns defaults for any invalid/missing fields.
 */
export function validateSettings(raw: unknown): PersistedSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }
  
  // Run migrations first
  const migrated = migrateSettings(raw as RawSettings);
  
  // Validate crop ratio preset if present (should be one of the valid presets)
  const validPresets: CropRatioPreset[] = ['original', 'free', '1:1', '4:5', '3:4', '9:16', '16:9', '2:3', '3:2'];
  const cropRatioPreset = validPresets.includes(migrated.cropRatioPreset as CropRatioPreset)
    ? (migrated.cropRatioPreset as CropRatioPreset)
    : undefined;

  return {
    version: SETTINGS_VERSION,
    outputFormat: isValidOutputFormat(migrated.outputFormat)
      ? migrated.outputFormat
      : DEFAULT_SETTINGS.outputFormat,
    resize: validateResizeSettings(migrated.resize),
    quality: validateQualitySettings(migrated.quality),
    cropRatioPreset,
  };
}

/**
 * Create a deep clone of settings (for snapshot purposes).
 */
export function cloneSettings(settings: PersistedSettings): PersistedSettings {
  return {
    version: settings.version,
    outputFormat: settings.outputFormat,
    resize: { ...settings.resize } as ResizeSettings,
    quality: { ...settings.quality },
    cropRatioPreset: settings.cropRatioPreset,
  };
}

/**
 * Check if two settings objects are equal.
 */
export function settingsEqual(a: PersistedSettings, b: PersistedSettings): boolean {
  if (a.version !== b.version) return false;
  if (a.outputFormat !== b.outputFormat) return false;
  if (a.cropRatioPreset !== b.cropRatioPreset) return false;
  
  // Compare resize settings
  if (a.resize.mode !== b.resize.mode) return false;
  
  if (a.resize.mode === 'pixels' && b.resize.mode === 'pixels') {
    if (a.resize.keepRatio !== b.resize.keepRatio) return false;
    if (a.resize.driving !== b.resize.driving) return false;
    if (a.resize.width !== b.resize.width) return false;
    if (a.resize.height !== b.resize.height) return false;
    if (a.resize.maxSide !== b.resize.maxSide) return false;
  } else if (a.resize.mode === 'percent' && b.resize.mode === 'percent') {
    if (a.resize.percent !== b.resize.percent) return false;
  } else if (a.resize.mode === 'targetMiB' && b.resize.mode === 'targetMiB') {
    if (a.resize.targetMiB !== b.resize.targetMiB) return false;
  }
  
  // Compare quality settings
  if (a.quality.jpg !== b.quality.jpg) return false;
  if (a.quality.webp !== b.quality.webp) return false;
  if (a.quality.heic !== b.quality.heic) return false;
  
  return true;
}
