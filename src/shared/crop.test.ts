/**
 * Unit tests for crop utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  getAspectRatioForPreset,
  createCenteredCropRect,
  normalizedToPixelCrop,
  getEffectiveDimensions,
  normalizedToPixelCropWithTransform,
  clampCropRect,
  isFullImageCrop,
  isCropActive,
  createDefaultCrop,
  cloneCrop,
  cropsEqual,
  cropRectsEqual,
  getCropRectAspectRatio,
  adjustCropToRatio,
  CROP_RATIO_PRESETS,
  getCropPresetLabel,
} from './crop';
import type { CropRect, Crop, Transform } from './types';

describe('crop utilities', () => {
  describe('getAspectRatioForPreset', () => {
    it('should return 1 for 1:1', () => {
      expect(getAspectRatioForPreset('1:1')).toBe(1);
    });

    it('should return correct ratio for portrait presets', () => {
      expect(getAspectRatioForPreset('4:5')).toBeCloseTo(0.8);
      expect(getAspectRatioForPreset('3:4')).toBeCloseTo(0.75);
      expect(getAspectRatioForPreset('9:16')).toBeCloseTo(0.5625);
      expect(getAspectRatioForPreset('2:3')).toBeCloseTo(0.6667, 3);
    });

    it('should return correct ratio for landscape presets', () => {
      expect(getAspectRatioForPreset('16:9')).toBeCloseTo(1.7778, 3);
      expect(getAspectRatioForPreset('3:2')).toBeCloseTo(1.5);
    });

    it('should return null for free preset', () => {
      expect(getAspectRatioForPreset('free')).toBeNull();
    });

    it('should return image ratio for original preset when dimensions provided', () => {
      expect(getAspectRatioForPreset('original', 1920, 1080)).toBeCloseTo(16 / 9);
      expect(getAspectRatioForPreset('original', 1000, 1000)).toBe(1);
      expect(getAspectRatioForPreset('original', 800, 1200)).toBeCloseTo(0.6667, 3);
    });

    it('should return null for original preset without dimensions', () => {
      expect(getAspectRatioForPreset('original')).toBeNull();
      expect(getAspectRatioForPreset('original', 0, 0)).toBeNull();
      expect(getAspectRatioForPreset('original', 100, 0)).toBeNull();
    });
  });

  describe('createCenteredCropRect', () => {
    it('should return full image for null ratio', () => {
      const rect = createCenteredCropRect(null, 1000, 800);
      expect(rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });

    it('should return full image for invalid ratio', () => {
      const rect = createCenteredCropRect(0, 1000, 800);
      expect(rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      
      const rect2 = createCenteredCropRect(-1, 1000, 800);
      expect(rect2).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });

    it('should create square crop in landscape image', () => {
      // 1000x800 image, 1:1 crop
      const rect = createCenteredCropRect(1, 1000, 800);
      expect(rect.height).toBe(1); // Full height
      expect(rect.width).toBeCloseTo(0.8); // 800/1000
      expect(rect.x).toBeCloseTo(0.1); // Centered
      expect(rect.y).toBe(0);
    });

    it('should create square crop in portrait image', () => {
      // 800x1000 image, 1:1 crop
      const rect = createCenteredCropRect(1, 800, 1000);
      expect(rect.width).toBe(1); // Full width
      expect(rect.height).toBeCloseTo(0.8); // 800/1000
      expect(rect.x).toBe(0);
      expect(rect.y).toBeCloseTo(0.1); // Centered
    });

    it('should create 16:9 crop in 4:3 image', () => {
      // 1200x900 (4:3) image, 16:9 crop
      const rect = createCenteredCropRect(16 / 9, 1200, 900);
      expect(rect.width).toBe(1); // Full width
      // Height should be 1200 / (16/9) = 675 pixels = 675/900 = 0.75 normalized
      expect(rect.height).toBeCloseTo(0.75);
      expect(rect.x).toBe(0);
      expect(rect.y).toBeCloseTo(0.125); // Centered
    });

    it('should create 4:5 crop in 16:9 image', () => {
      // 1920x1080 (16:9) image, 4:5 crop (portrait)
      const rect = createCenteredCropRect(4 / 5, 1920, 1080);
      expect(rect.height).toBe(1); // Full height
      // Width should be 1080 * (4/5) = 864 pixels = 864/1920 = 0.45 normalized
      expect(rect.width).toBeCloseTo(0.45);
      expect(rect.x).toBeCloseTo(0.275); // Centered
      expect(rect.y).toBe(0);
    });

    it('should return full image when ratios match', () => {
      // 1920x1080 image, 16:9 crop (same ratio)
      const rect = createCenteredCropRect(16 / 9, 1920, 1080);
      expect(rect.x).toBeCloseTo(0);
      expect(rect.y).toBeCloseTo(0);
      expect(rect.width).toBeCloseTo(1);
      expect(rect.height).toBeCloseTo(1);
    });
  });

  describe('normalizedToPixelCrop', () => {
    it('should convert full image rect', () => {
      const rect: CropRect = { x: 0, y: 0, width: 1, height: 1 };
      const pixel = normalizedToPixelCrop(rect, 1000, 800);
      expect(pixel).toEqual({ left: 0, top: 0, width: 1000, height: 800 });
    });

    it('should convert centered crop', () => {
      const rect: CropRect = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
      const pixel = normalizedToPixelCrop(rect, 1000, 800);
      expect(pixel).toEqual({ left: 250, top: 200, width: 500, height: 400 });
    });

    it('should round to nearest pixel', () => {
      const rect: CropRect = { x: 0.333, y: 0.333, width: 0.333, height: 0.333 };
      const pixel = normalizedToPixelCrop(rect, 100, 100);
      expect(pixel.left).toBe(33);
      expect(pixel.top).toBe(33);
      expect(pixel.width).toBe(33);
      expect(pixel.height).toBe(33);
    });

    it('should clamp to valid bounds', () => {
      const rect: CropRect = { x: -0.1, y: -0.1, width: 1.2, height: 1.2 };
      const pixel = normalizedToPixelCrop(rect, 100, 100);
      expect(pixel.left).toBe(0);
      expect(pixel.top).toBe(0);
      expect(pixel.width).toBeLessThanOrEqual(100);
      expect(pixel.height).toBeLessThanOrEqual(100);
    });

    it('should ensure minimum size of 1 pixel', () => {
      const rect: CropRect = { x: 0.5, y: 0.5, width: 0, height: 0 };
      const pixel = normalizedToPixelCrop(rect, 100, 100);
      expect(pixel.width).toBe(1);
      expect(pixel.height).toBe(1);
    });
  });

  describe('getEffectiveDimensions', () => {
    it('should return original dimensions with no transform', () => {
      const dims = getEffectiveDimensions(1920, 1080);
      expect(dims).toEqual({ width: 1920, height: 1080 });
    });

    it('should return original dimensions with 0° and 180° rotation', () => {
      const identity: Transform = { rotateSteps: 0, flipH: false, flipV: false };
      expect(getEffectiveDimensions(1920, 1080, identity)).toEqual({ width: 1920, height: 1080 });

      const rotate180: Transform = { rotateSteps: 2, flipH: false, flipV: false };
      expect(getEffectiveDimensions(1920, 1080, rotate180)).toEqual({ width: 1920, height: 1080 });
    });

    it('should swap dimensions with 90° rotation', () => {
      const rotate90: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      expect(getEffectiveDimensions(1920, 1080, rotate90)).toEqual({ width: 1080, height: 1920 });
    });

    it('should swap dimensions with 270° rotation', () => {
      const rotate270: Transform = { rotateSteps: 3, flipH: false, flipV: false };
      expect(getEffectiveDimensions(1920, 1080, rotate270)).toEqual({ width: 1080, height: 1920 });
    });

    it('should not affect dimensions with only flips', () => {
      const flipH: Transform = { rotateSteps: 0, flipH: true, flipV: false };
      expect(getEffectiveDimensions(1920, 1080, flipH)).toEqual({ width: 1920, height: 1080 });

      const flipV: Transform = { rotateSteps: 0, flipH: false, flipV: true };
      expect(getEffectiveDimensions(1920, 1080, flipV)).toEqual({ width: 1920, height: 1080 });

      const flipBoth: Transform = { rotateSteps: 0, flipH: true, flipV: true };
      expect(getEffectiveDimensions(1920, 1080, flipBoth)).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe('normalizedToPixelCropWithTransform', () => {
    const identity: Transform = { rotateSteps: 0, flipH: false, flipV: false };
    
    it('should work like normalizedToPixelCrop with no transform', () => {
      const rect: CropRect = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
      const withTransform = normalizedToPixelCropWithTransform(rect, 1000, 800, identity);
      const without = normalizedToPixelCrop(rect, 1000, 800);
      expect(withTransform).toEqual(without);
    });

    it('should handle undefined transform', () => {
      const rect: CropRect = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
      const pixel = normalizedToPixelCropWithTransform(rect, 1000, 800);
      expect(pixel).toEqual({ left: 250, top: 200, width: 500, height: 400 });
    });

    it('should handle horizontal flip', () => {
      const flipH: Transform = { rotateSteps: 0, flipH: true, flipV: false };
      // User selects left quarter in flipped view = right quarter in original
      const rect: CropRect = { x: 0, y: 0, width: 0.25, height: 1 };
      const pixel = normalizedToPixelCropWithTransform(rect, 1000, 800, flipH);
      // In original orientation, this should be the right quarter
      expect(pixel.left).toBe(750); // 1000 - 0 - 250 = 750
      expect(pixel.width).toBe(250);
    });

    it('should handle vertical flip', () => {
      const flipV: Transform = { rotateSteps: 0, flipH: false, flipV: true };
      // User selects top quarter in flipped view = bottom quarter in original
      const rect: CropRect = { x: 0, y: 0, width: 1, height: 0.25 };
      const pixel = normalizedToPixelCropWithTransform(rect, 1000, 800, flipV);
      // In original orientation, this should be the bottom quarter
      expect(pixel.top).toBe(600); // 800 - 0 - 200 = 600
      expect(pixel.height).toBe(200);
    });

    it('should handle 90° rotation', () => {
      const rotate90: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      // Original: 1000x800, after 90° CW rotation: 800x1000
      // User selects top-left quarter in rotated view
      const rect: CropRect = { x: 0, y: 0, width: 0.5, height: 0.5 };
      const pixel = normalizedToPixelCropWithTransform(rect, 1000, 800, rotate90);
      // The crop should map back to original coordinates
      expect(pixel.width + pixel.height).toBeGreaterThan(0); // Valid crop
      expect(pixel.left).toBeGreaterThanOrEqual(0);
      expect(pixel.top).toBeGreaterThanOrEqual(0);
    });

    it('should handle full crop with any transform', () => {
      const transforms: Transform[] = [
        { rotateSteps: 0, flipH: false, flipV: false },
        { rotateSteps: 1, flipH: false, flipV: false },
        { rotateSteps: 2, flipH: false, flipV: false },
        { rotateSteps: 3, flipH: false, flipV: false },
        { rotateSteps: 0, flipH: true, flipV: false },
        { rotateSteps: 0, flipH: false, flipV: true },
        { rotateSteps: 1, flipH: true, flipV: true },
      ];

      const fullRect: CropRect = { x: 0, y: 0, width: 1, height: 1 };
      
      for (const transform of transforms) {
        const pixel = normalizedToPixelCropWithTransform(fullRect, 1000, 800, transform);
        // Full crop should always cover the entire image
        expect(pixel.left).toBe(0);
        expect(pixel.top).toBe(0);
        expect(pixel.width).toBe(1000);
        expect(pixel.height).toBe(800);
      }
    });
  });

  describe('clampCropRect', () => {
    it('should not change valid rect', () => {
      const rect: CropRect = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
      expect(clampCropRect(rect)).toEqual(rect);
    });

    it('should clamp negative x and y', () => {
      const rect: CropRect = { x: -0.5, y: -0.5, width: 0.5, height: 0.5 };
      const clamped = clampCropRect(rect);
      expect(clamped.x).toBe(0);
      expect(clamped.y).toBe(0);
    });

    it('should clamp x and y greater than 1', () => {
      const rect: CropRect = { x: 1.5, y: 1.5, width: 0.5, height: 0.5 };
      const clamped = clampCropRect(rect);
      expect(clamped.x).toBe(1);
      expect(clamped.y).toBe(1);
    });

    it('should clamp width and height to fit within bounds', () => {
      const rect: CropRect = { x: 0.5, y: 0.5, width: 1, height: 1 };
      const clamped = clampCropRect(rect);
      expect(clamped.width).toBe(0.5);
      expect(clamped.height).toBe(0.5);
    });

    it('should ensure minimum width and height', () => {
      const rect: CropRect = { x: 0.5, y: 0.5, width: 0, height: 0 };
      const clamped = clampCropRect(rect);
      expect(clamped.width).toBe(0.01);
      expect(clamped.height).toBe(0.01);
    });
  });

  describe('isFullImageCrop', () => {
    it('should return true for exact full image', () => {
      expect(isFullImageCrop({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    });

    it('should return true for nearly full image (within epsilon)', () => {
      expect(isFullImageCrop({ x: 0.0001, y: 0.0001, width: 0.9999, height: 0.9999 })).toBe(true);
    });

    it('should return false for partial crop', () => {
      expect(isFullImageCrop({ x: 0.1, y: 0, width: 0.8, height: 1 })).toBe(false);
      expect(isFullImageCrop({ x: 0, y: 0.1, width: 1, height: 0.8 })).toBe(false);
      expect(isFullImageCrop({ x: 0, y: 0, width: 0.5, height: 0.5 })).toBe(false);
    });
  });

  describe('isCropActive', () => {
    it('should return false for undefined crop', () => {
      expect(isCropActive(undefined)).toBe(false);
    });

    it('should return false when crop is not active', () => {
      const crop: Crop = {
        active: false,
        ratioPreset: 'free',
        rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      };
      expect(isCropActive(crop)).toBe(false);
    });

    it('should return false when active but full image', () => {
      const crop: Crop = {
        active: true,
        ratioPreset: 'original',
        rect: { x: 0, y: 0, width: 1, height: 1 },
      };
      expect(isCropActive(crop)).toBe(false);
    });

    it('should return true when active and not full image', () => {
      const crop: Crop = {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      };
      expect(isCropActive(crop)).toBe(true);
    });
  });

  describe('createDefaultCrop', () => {
    it('should create inactive crop with full image rect', () => {
      const crop = createDefaultCrop();
      expect(crop.active).toBe(false);
      expect(crop.ratioPreset).toBe('original');
      expect(crop.rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });
  });

  describe('cloneCrop', () => {
    it('should create a deep copy', () => {
      const original: Crop = {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      };
      const cloned = cloneCrop(original);
      
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.rect).not.toBe(original.rect);
    });
  });

  describe('cropsEqual', () => {
    it('should return true for equal crops', () => {
      const a: Crop = {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      };
      const b: Crop = {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      };
      expect(cropsEqual(a, b)).toBe(true);
    });

    it('should return false for different active state', () => {
      const a: Crop = {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      };
      const b: Crop = {
        active: false,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      };
      expect(cropsEqual(a, b)).toBe(false);
    });

    it('should return false for different preset', () => {
      const a: Crop = {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      };
      const b: Crop = {
        active: true,
        ratioPreset: '4:5',
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      };
      expect(cropsEqual(a, b)).toBe(false);
    });

    it('should return false for different rect', () => {
      const a: Crop = {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 },
      };
      const b: Crop = {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
      };
      expect(cropsEqual(a, b)).toBe(false);
    });
  });

  describe('cropRectsEqual', () => {
    it('should return true for equal rects', () => {
      const a: CropRect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
      const b: CropRect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
      expect(cropRectsEqual(a, b)).toBe(true);
    });

    it('should return true for nearly equal rects within epsilon', () => {
      const a: CropRect = { x: 0.1000001, y: 0.2, width: 0.5, height: 0.6 };
      const b: CropRect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
      expect(cropRectsEqual(a, b)).toBe(true);
    });

    it('should return false for different rects', () => {
      const a: CropRect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
      const b: CropRect = { x: 0.2, y: 0.2, width: 0.5, height: 0.6 };
      expect(cropRectsEqual(a, b)).toBe(false);
    });
  });

  describe('getCropRectAspectRatio', () => {
    it('should return correct ratio for square crop', () => {
      const rect: CropRect = { x: 0, y: 0, width: 0.5, height: 0.5 };
      expect(getCropRectAspectRatio(rect, 1000, 1000)).toBe(1);
    });

    it('should return correct ratio for landscape crop', () => {
      const rect: CropRect = { x: 0, y: 0, width: 1, height: 0.5 };
      // In 1000x1000 image: 1000x500 pixels = 2:1 ratio
      expect(getCropRectAspectRatio(rect, 1000, 1000)).toBe(2);
    });

    it('should return correct ratio for portrait crop', () => {
      const rect: CropRect = { x: 0, y: 0, width: 0.5, height: 1 };
      // In 1000x1000 image: 500x1000 pixels = 1:2 ratio
      expect(getCropRectAspectRatio(rect, 1000, 1000)).toBe(0.5);
    });

    it('should handle non-square images', () => {
      const rect: CropRect = { x: 0, y: 0, width: 1, height: 1 };
      // Full image in 1920x1080 = 16:9
      expect(getCropRectAspectRatio(rect, 1920, 1080)).toBeCloseTo(16 / 9);
    });
  });

  describe('adjustCropToRatio', () => {
    it('should not change crop when ratio already matches', () => {
      const rect: CropRect = { x: 0, y: 0, width: 1, height: 1 };
      const adjusted = adjustCropToRatio(rect, 1, 1000, 1000, 'center');
      expect(adjusted.width).toBeCloseTo(1);
      expect(adjusted.height).toBeCloseTo(1);
    });

    it('should shrink width to match portrait ratio', () => {
      const rect: CropRect = { x: 0, y: 0, width: 1, height: 1 };
      const adjusted = adjustCropToRatio(rect, 0.5, 1000, 1000, 'center');
      // Target ratio 0.5 means width = 0.5 * height
      expect(adjusted.width).toBeCloseTo(0.5);
      expect(adjusted.height).toBeCloseTo(1);
      expect(adjusted.x).toBeCloseTo(0.25); // Centered
    });

    it('should shrink height to match landscape ratio', () => {
      const rect: CropRect = { x: 0, y: 0, width: 1, height: 1 };
      const adjusted = adjustCropToRatio(rect, 2, 1000, 1000, 'center');
      // Target ratio 2 means width = 2 * height
      expect(adjusted.width).toBeCloseTo(1);
      expect(adjusted.height).toBeCloseTo(0.5);
      expect(adjusted.y).toBeCloseTo(0.25); // Centered
    });

    it('should anchor to top-left', () => {
      const rect: CropRect = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      const adjusted = adjustCropToRatio(rect, 1, 1000, 1000, 'top-left');
      expect(adjusted.x).toBe(0.1);
      expect(adjusted.y).toBe(0.1);
    });

    it('should anchor to bottom-right', () => {
      const rect: CropRect = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      const adjusted = adjustCropToRatio(rect, 1, 1000, 1000, 'bottom-right');
      // Bottom-right corner should stay at (0.9, 0.9)
      expect(adjusted.x + adjusted.width).toBeCloseTo(0.9);
      expect(adjusted.y + adjusted.height).toBeCloseTo(0.9);
    });
  });

  describe('CROP_RATIO_PRESETS', () => {
    it('should contain all expected presets', () => {
      expect(CROP_RATIO_PRESETS).toContain('original');
      expect(CROP_RATIO_PRESETS).toContain('free');
      expect(CROP_RATIO_PRESETS).toContain('1:1');
      expect(CROP_RATIO_PRESETS).toContain('4:5');
      expect(CROP_RATIO_PRESETS).toContain('3:4');
      expect(CROP_RATIO_PRESETS).toContain('9:16');
      expect(CROP_RATIO_PRESETS).toContain('16:9');
      expect(CROP_RATIO_PRESETS).toContain('2:3');
      expect(CROP_RATIO_PRESETS).toContain('3:2');
    });

    it('should have exactly 9 presets', () => {
      expect(CROP_RATIO_PRESETS).toHaveLength(9);
    });
  });

  describe('getCropPresetLabel', () => {
    it('should return readable labels', () => {
      expect(getCropPresetLabel('original')).toBe('Original');
      expect(getCropPresetLabel('free')).toBe('Free');
      expect(getCropPresetLabel('1:1')).toBe('1:1 (Square)');
      expect(getCropPresetLabel('16:9')).toBe('16:9 (Landscape)');
      expect(getCropPresetLabel('9:16')).toBe('9:16 (Portrait)');
    });
  });
});
