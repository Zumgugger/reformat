/**
 * Unit tests for settings schema, validation, and migrations.
 */

import { describe, it, expect } from 'vitest';
import {
  SETTINGS_VERSION,
  DEFAULT_SETTINGS,
  DEFAULT_RESIZE_SETTINGS,
  isValidOutputFormat,
  isValidDrivingDimension,
  isValidQuality,
  validateQualitySettings,
  validateResizeSettings,
  migrateV0ToV1,
  migrateSettings,
  validateSettings,
  cloneSettings,
  settingsEqual,
  type PersistedSettings,
} from './settings';

describe('settings constants', () => {
  it('SETTINGS_VERSION is 1', () => {
    expect(SETTINGS_VERSION).toBe(1);
  });

  it('DEFAULT_SETTINGS has correct structure', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      version: 1,
      outputFormat: 'same',
      resize: {
        mode: 'pixels',
        keepRatio: true,
        driving: 'maxSide',
        maxSide: undefined,
      },
      quality: {
        jpg: 85,
        webp: 85,
        heic: 85,
      },
    });
  });

  it('DEFAULT_RESIZE_SETTINGS has no resize (original size)', () => {
    expect(DEFAULT_RESIZE_SETTINGS).toEqual({
      mode: 'pixels',
      keepRatio: true,
      driving: 'maxSide',
      maxSide: undefined,
    });
  });
});

describe('isValidOutputFormat', () => {
  it('accepts valid formats', () => {
    expect(isValidOutputFormat('same')).toBe(true);
    expect(isValidOutputFormat('jpg')).toBe(true);
    expect(isValidOutputFormat('png')).toBe(true);
    expect(isValidOutputFormat('heic')).toBe(true);
    expect(isValidOutputFormat('webp')).toBe(true);
    expect(isValidOutputFormat('tiff')).toBe(true);
    expect(isValidOutputFormat('bmp')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidOutputFormat('gif')).toBe(false);
    expect(isValidOutputFormat('JPEG')).toBe(false);
    expect(isValidOutputFormat('')).toBe(false);
    expect(isValidOutputFormat(null)).toBe(false);
    expect(isValidOutputFormat(undefined)).toBe(false);
    expect(isValidOutputFormat(123)).toBe(false);
    expect(isValidOutputFormat({})).toBe(false);
  });
});

describe('isValidDrivingDimension', () => {
  it('accepts valid dimensions', () => {
    expect(isValidDrivingDimension('width')).toBe(true);
    expect(isValidDrivingDimension('height')).toBe(true);
    expect(isValidDrivingDimension('maxSide')).toBe(true);
  });

  it('rejects invalid dimensions', () => {
    expect(isValidDrivingDimension('Width')).toBe(false);
    expect(isValidDrivingDimension('minSide')).toBe(false);
    expect(isValidDrivingDimension('')).toBe(false);
    expect(isValidDrivingDimension(null)).toBe(false);
    expect(isValidDrivingDimension(123)).toBe(false);
  });
});

describe('isValidQuality', () => {
  it('accepts valid quality values (40-100)', () => {
    expect(isValidQuality(40)).toBe(true);
    expect(isValidQuality(85)).toBe(true);
    expect(isValidQuality(100)).toBe(true);
    expect(isValidQuality(50.5)).toBe(true);
  });

  it('rejects values outside range', () => {
    expect(isValidQuality(39)).toBe(false);
    expect(isValidQuality(101)).toBe(false);
    expect(isValidQuality(0)).toBe(false);
    expect(isValidQuality(-10)).toBe(false);
  });

  it('rejects non-numbers', () => {
    expect(isValidQuality('85')).toBe(false);
    expect(isValidQuality(null)).toBe(false);
    expect(isValidQuality(undefined)).toBe(false);
    expect(isValidQuality(NaN)).toBe(false);
    expect(isValidQuality(Infinity)).toBe(false);
  });
});

describe('validateQualitySettings', () => {
  it('returns defaults for null/undefined', () => {
    expect(validateQualitySettings(null)).toEqual({ jpg: 85, webp: 85, heic: 85 });
    expect(validateQualitySettings(undefined)).toEqual({ jpg: 85, webp: 85, heic: 85 });
  });

  it('returns defaults for non-object', () => {
    expect(validateQualitySettings('string')).toEqual({ jpg: 85, webp: 85, heic: 85 });
    expect(validateQualitySettings(123)).toEqual({ jpg: 85, webp: 85, heic: 85 });
  });

  it('validates individual quality values', () => {
    expect(validateQualitySettings({ jpg: 70, webp: 90, heic: 50 }))
      .toEqual({ jpg: 70, webp: 90, heic: 50 });
  });

  it('uses defaults for invalid individual values', () => {
    expect(validateQualitySettings({ jpg: 30, webp: 110, heic: 'bad' }))
      .toEqual({ jpg: 85, webp: 85, heic: 85 });
  });

  it('preserves valid values while defaulting invalid ones', () => {
    expect(validateQualitySettings({ jpg: 60, webp: 'invalid' }))
      .toEqual({ jpg: 60, webp: 85, heic: 85 });
  });
});

describe('validateResizeSettings', () => {
  it('returns defaults for null/undefined', () => {
    expect(validateResizeSettings(null)).toEqual(DEFAULT_RESIZE_SETTINGS);
    expect(validateResizeSettings(undefined)).toEqual(DEFAULT_RESIZE_SETTINGS);
  });

  it('returns defaults for non-object', () => {
    expect(validateResizeSettings('string')).toEqual(DEFAULT_RESIZE_SETTINGS);
    expect(validateResizeSettings(123)).toEqual(DEFAULT_RESIZE_SETTINGS);
  });

  describe('pixels mode', () => {
    it('validates valid pixels settings', () => {
      const input = {
        mode: 'pixels',
        keepRatio: true,
        driving: 'width',
        width: 1280,
      };
      expect(validateResizeSettings(input)).toEqual(input);
    });

    it('validates pixels with multiple dimensions', () => {
      const input = {
        mode: 'pixels',
        keepRatio: false,
        driving: 'width',
        width: 1280,
        height: 720,
      };
      expect(validateResizeSettings(input)).toEqual(input);
    });

    it('clamps dimension values', () => {
      const input = {
        mode: 'pixels',
        keepRatio: true,
        driving: 'maxSide',
        maxSide: 60000, // exceeds max
      };
      const result = validateResizeSettings(input);
      expect(result.mode).toBe('pixels');
      // Should not set maxSide since it exceeds max (represents "no resize")
      expect((result as any).maxSide).toBeUndefined();
    });

    it('allows pixels mode with no dimensions (represents "no resize")', () => {
      const input = { mode: 'pixels', keepRatio: true, driving: 'width' };
      const result = validateResizeSettings(input);
      // Should NOT default to 1920 anymore - no dimensions means "no resize"
      expect((result as any).maxSide).toBeUndefined();
      expect((result as any).width).toBeUndefined();
      expect((result as any).height).toBeUndefined();
    });

    it('defaults keepRatio to true', () => {
      const input = { mode: 'pixels', driving: 'maxSide', maxSide: 1000 };
      const result = validateResizeSettings(input);
      expect((result as any).keepRatio).toBe(true);
    });

    it('defaults driving to maxSide', () => {
      const input = { mode: 'pixels', maxSide: 1000 };
      const result = validateResizeSettings(input);
      expect((result as any).driving).toBe('maxSide');
    });

    it('rounds dimension values', () => {
      const input = {
        mode: 'pixels',
        keepRatio: true,
        driving: 'width',
        width: 1280.7,
      };
      const result = validateResizeSettings(input);
      expect((result as any).width).toBe(1281);
    });
  });

  describe('percent mode', () => {
    it('validates valid percent settings', () => {
      const input = { mode: 'percent', percent: 50 };
      expect(validateResizeSettings(input)).toEqual(input);
    });

    it('defaults percent to 100 for invalid values', () => {
      expect(validateResizeSettings({ mode: 'percent', percent: -10 }))
        .toEqual({ mode: 'percent', percent: 100 });
      expect(validateResizeSettings({ mode: 'percent', percent: 0 }))
        .toEqual({ mode: 'percent', percent: 100 });
      expect(validateResizeSettings({ mode: 'percent', percent: 1500 }))
        .toEqual({ mode: 'percent', percent: 100 });
    });

    it('accepts percent up to 1000', () => {
      expect(validateResizeSettings({ mode: 'percent', percent: 1000 }))
        .toEqual({ mode: 'percent', percent: 1000 });
    });
  });

  describe('targetMiB mode', () => {
    it('validates valid targetMiB settings', () => {
      const input = { mode: 'targetMiB', targetMiB: 2.5 };
      expect(validateResizeSettings(input)).toEqual(input);
    });

    it('defaults targetMiB to 2 for invalid values', () => {
      expect(validateResizeSettings({ mode: 'targetMiB', targetMiB: -1 }))
        .toEqual({ mode: 'targetMiB', targetMiB: 2 });
      expect(validateResizeSettings({ mode: 'targetMiB', targetMiB: 0 }))
        .toEqual({ mode: 'targetMiB', targetMiB: 2 });
      expect(validateResizeSettings({ mode: 'targetMiB', targetMiB: 150 }))
        .toEqual({ mode: 'targetMiB', targetMiB: 2 });
    });

    it('accepts targetMiB up to 100', () => {
      expect(validateResizeSettings({ mode: 'targetMiB', targetMiB: 100 }))
        .toEqual({ mode: 'targetMiB', targetMiB: 100 });
    });
  });

  describe('unknown mode', () => {
    it('defaults to pixels mode for unknown mode', () => {
      const result = validateResizeSettings({ mode: 'unknown' });
      expect(result.mode).toBe('pixels');
    });
  });
});

describe('migrateV0ToV1', () => {
  it('returns unchanged for v1 settings', () => {
    const v1Settings = { version: 1, outputFormat: 'jpg' };
    const result = migrateV0ToV1(v1Settings);
    expect(result).toEqual(v1Settings);
  });

  it('adds version 1 to v0 settings', () => {
    const v0Settings = { outputFormat: 'png' };
    const result = migrateV0ToV1(v0Settings);
    expect(result.version).toBe(1);
    expect(result.outputFormat).toBe('png');
  });

  it('renames "format" to "outputFormat"', () => {
    const v0Settings = { format: 'webp' };
    const result = migrateV0ToV1(v0Settings);
    expect(result.outputFormat).toBe('webp');
    expect(result.format).toBeUndefined();
  });

  it('renames "resizeSettings" to "resize"', () => {
    const v0Settings = { resizeSettings: { mode: 'percent', percent: 75 } };
    const result = migrateV0ToV1(v0Settings);
    expect(result.resize).toEqual({ mode: 'percent', percent: 75 });
    expect(result.resizeSettings).toBeUndefined();
  });

  it('handles settings with version 0', () => {
    const v0Settings = { version: 0, format: 'jpg' };
    const result = migrateV0ToV1(v0Settings);
    expect(result.version).toBe(1);
    expect(result.outputFormat).toBe('jpg');
  });
});

describe('migrateSettings', () => {
  it('runs all migrations', () => {
    const v0Settings = { format: 'heic', resizeSettings: { mode: 'percent', percent: 50 } };
    const result = migrateSettings(v0Settings);
    expect(result.version).toBe(1);
    expect(result.outputFormat).toBe('heic');
    expect(result.resize).toEqual({ mode: 'percent', percent: 50 });
  });

  it('preserves already-migrated settings', () => {
    const v1Settings = {
      version: 1,
      outputFormat: 'png',
      resize: { mode: 'pixels', keepRatio: true, driving: 'maxSide', maxSide: 2000 },
    };
    const result = migrateSettings(v1Settings);
    expect(result).toEqual(v1Settings);
  });
});

describe('validateSettings', () => {
  it('returns defaults for null/undefined', () => {
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for non-object', () => {
    expect(validateSettings('string')).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(123)).toEqual(DEFAULT_SETTINGS);
  });

  it('validates complete valid settings', () => {
    const input = {
      version: 1,
      outputFormat: 'webp',
      resize: { mode: 'percent', percent: 75 },
      quality: { jpg: 90, webp: 80, heic: 70 },
    };
    expect(validateSettings(input)).toEqual(input);
  });

  it('runs migrations before validation', () => {
    const v0Input = { format: 'tiff' };
    const result = validateSettings(v0Input);
    expect(result.version).toBe(1);
    expect(result.outputFormat).toBe('tiff');
  });

  it('defaults invalid outputFormat', () => {
    const input = { version: 1, outputFormat: 'invalid' };
    const result = validateSettings(input);
    expect(result.outputFormat).toBe('same');
  });

  it('validates resize settings within', () => {
    const input = {
      version: 1,
      outputFormat: 'jpg',
      resize: { mode: 'percent', percent: -50 }, // invalid
    };
    const result = validateSettings(input);
    expect(result.resize).toEqual({ mode: 'percent', percent: 100 });
  });

  it('validates quality settings within', () => {
    const input = {
      version: 1,
      outputFormat: 'jpg',
      quality: { jpg: 999, webp: 85, heic: 85 }, // invalid jpg
    };
    const result = validateSettings(input);
    expect(result.quality.jpg).toBe(85);
    expect(result.quality.webp).toBe(85);
    expect(result.quality.heic).toBe(85);
  });

  it('always sets version to current', () => {
    const input = { version: 999, outputFormat: 'png' };
    const result = validateSettings(input);
    expect(result.version).toBe(SETTINGS_VERSION);
  });

  it('validates cropRatioPreset', () => {
    // Valid preset
    const valid = {
      version: 1,
      outputFormat: 'jpg',
      resize: DEFAULT_RESIZE_SETTINGS,
      quality: { jpg: 85, webp: 85, heic: 85 },
      cropRatioPreset: 'golden',
    };
    const result1 = validateSettings(valid);
    expect(result1.cropRatioPreset).toBe('golden');

    // Invalid preset is filtered out
    const invalid = {
      version: 1,
      outputFormat: 'jpg',
      resize: DEFAULT_RESIZE_SETTINGS,
      quality: { jpg: 85, webp: 85, heic: 85 },
      cropRatioPreset: 'invalid-preset',
    };
    const result2 = validateSettings(invalid);
    expect(result2.cropRatioPreset).toBeUndefined();

    // Missing preset stays undefined
    const missing = {
      version: 1,
      outputFormat: 'jpg',
      resize: DEFAULT_RESIZE_SETTINGS,
      quality: { jpg: 85, webp: 85, heic: 85 },
    };
    const result3 = validateSettings(missing);
    expect(result3.cropRatioPreset).toBeUndefined();
  });
});

describe('cloneSettings', () => {
  it('creates a deep clone', () => {
    const original: PersistedSettings = {
      version: 1,
      outputFormat: 'jpg',
      resize: { mode: 'pixels', keepRatio: true, driving: 'width', width: 1000 },
      quality: { jpg: 90, webp: 85, heic: 80 },
    };
    const clone = cloneSettings(original);
    
    // Should be equal
    expect(clone).toEqual(original);
    
    // But not the same reference
    expect(clone).not.toBe(original);
    expect(clone.resize).not.toBe(original.resize);
    expect(clone.quality).not.toBe(original.quality);
  });

  it('modifications to clone do not affect original', () => {
    const original: PersistedSettings = {
      version: 1,
      outputFormat: 'jpg',
      resize: { mode: 'percent', percent: 50 },
      quality: { jpg: 90, webp: 85, heic: 80 },
    };
    const clone = cloneSettings(original);
    
    clone.outputFormat = 'png';
    clone.quality.jpg = 70;
    
    expect(original.outputFormat).toBe('jpg');
    expect(original.quality.jpg).toBe(90);
  });
});

describe('settingsEqual', () => {
  it('returns true for identical settings', () => {
    const a: PersistedSettings = { ...DEFAULT_SETTINGS };
    const b: PersistedSettings = { ...DEFAULT_SETTINGS };
    expect(settingsEqual(a, b)).toBe(true);
  });

  it('returns false for different versions', () => {
    const a: PersistedSettings = { ...DEFAULT_SETTINGS, version: 1 };
    const b: PersistedSettings = { ...DEFAULT_SETTINGS, version: 2 };
    expect(settingsEqual(a, b)).toBe(false);
  });

  it('returns false for different outputFormat', () => {
    const a: PersistedSettings = { ...DEFAULT_SETTINGS, outputFormat: 'jpg' };
    const b: PersistedSettings = { ...DEFAULT_SETTINGS, outputFormat: 'png' };
    expect(settingsEqual(a, b)).toBe(false);
  });

  it('returns false for different resize mode', () => {
    const a: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'percent', percent: 50 },
    };
    const b: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'targetMiB', targetMiB: 2 },
    };
    expect(settingsEqual(a, b)).toBe(false);
  });

  it('compares pixels mode settings correctly', () => {
    const base: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'pixels', keepRatio: true, driving: 'width', width: 1000 },
    };
    
    // Same
    expect(settingsEqual(base, {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'pixels', keepRatio: true, driving: 'width', width: 1000 },
    })).toBe(true);
    
    // Different keepRatio
    expect(settingsEqual(base, {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'pixels', keepRatio: false, driving: 'width', width: 1000 },
    })).toBe(false);
    
    // Different driving
    expect(settingsEqual(base, {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'pixels', keepRatio: true, driving: 'height', width: 1000 },
    })).toBe(false);
    
    // Different width
    expect(settingsEqual(base, {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'pixels', keepRatio: true, driving: 'width', width: 2000 },
    })).toBe(false);
  });

  it('compares percent mode settings correctly', () => {
    const a: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'percent', percent: 50 },
    };
    const b: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'percent', percent: 75 },
    };
    expect(settingsEqual(a, b)).toBe(false);
    
    const c: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'percent', percent: 50 },
    };
    expect(settingsEqual(a, c)).toBe(true);
  });

  it('compares targetMiB mode settings correctly', () => {
    const a: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'targetMiB', targetMiB: 2 },
    };
    const b: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'targetMiB', targetMiB: 5 },
    };
    expect(settingsEqual(a, b)).toBe(false);
    
    const c: PersistedSettings = {
      ...DEFAULT_SETTINGS,
      resize: { mode: 'targetMiB', targetMiB: 2 },
    };
    expect(settingsEqual(a, c)).toBe(true);
  });

  it('compares quality settings correctly', () => {
    const base: PersistedSettings = { ...DEFAULT_SETTINGS };
    
    // Different jpg quality
    expect(settingsEqual(base, {
      ...DEFAULT_SETTINGS,
      quality: { jpg: 70, webp: 85, heic: 85 },
    })).toBe(false);
    
    // Different webp quality
    expect(settingsEqual(base, {
      ...DEFAULT_SETTINGS,
      quality: { jpg: 85, webp: 70, heic: 85 },
    })).toBe(false);
    
    // Different heic quality
    expect(settingsEqual(base, {
      ...DEFAULT_SETTINGS,
      quality: { jpg: 85, webp: 85, heic: 70 },
    })).toBe(false);
  });

  it('compares cropRatioPreset correctly', () => {
    const base: PersistedSettings = { ...DEFAULT_SETTINGS };
    
    // Same cropRatioPreset (both undefined)
    expect(settingsEqual(base, { ...DEFAULT_SETTINGS })).toBe(true);
    
    // Different cropRatioPreset
    expect(settingsEqual(base, {
      ...DEFAULT_SETTINGS,
      cropRatioPreset: 'square',
    })).toBe(false);
    
    // Same cropRatioPreset (both 'golden')
    expect(settingsEqual(
      { ...DEFAULT_SETTINGS, cropRatioPreset: 'golden' },
      { ...DEFAULT_SETTINGS, cropRatioPreset: 'golden' }
    )).toBe(true);
  });});