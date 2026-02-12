/**
 * Tests for lens utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  createCenteredLens,
  calculateLensDimensions,
  screenToNormalizedLens,
  normalizedToScreenLens,
  normalizedToPixelRegion,
  clampLensPosition,
  moveLens,
  isLensFullCoverage,
  getDetailDimensions,
  cloneLens,
  lensEqual,
  type LensPosition,
} from './lens';
import type { Transform } from './types';

describe('createCenteredLens', () => {
  it('should create a centered lens with given dimensions', () => {
    const lens = createCenteredLens(0.5, 0.5);
    expect(lens).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  });

  it('should center small lens', () => {
    const lens = createCenteredLens(0.2, 0.1);
    expect(lens.x).toBeCloseTo(0.4);
    expect(lens.y).toBeCloseTo(0.45);
    expect(lens.width).toBe(0.2);
    expect(lens.height).toBe(0.1);
  });

  it('should center full-size lens at origin', () => {
    const lens = createCenteredLens(1, 1);
    expect(lens).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('should clamp dimensions to valid range', () => {
    const lens = createCenteredLens(1.5, -0.1);
    expect(lens.width).toBe(1);
    expect(lens.height).toBe(0.01); // minimum
  });

  it('should handle zero dimensions by clamping to minimum', () => {
    const lens = createCenteredLens(0, 0);
    expect(lens.width).toBe(0.01);
    expect(lens.height).toBe(0.01);
  });
});

describe('calculateLensDimensions', () => {
  it('should calculate lens dimensions for a detail panel smaller than image', () => {
    const dims = calculateLensDimensions(1000, 800, 200, 200);
    expect(dims.width).toBeCloseTo(0.2); // 200/1000
    expect(dims.height).toBeCloseTo(0.25); // 200/800
  });

  it('should cap lens dimensions at 1 when panel is larger than image', () => {
    const dims = calculateLensDimensions(100, 100, 500, 500);
    expect(dims.width).toBe(1);
    expect(dims.height).toBe(1);
  });

  it('should account for 90° rotation (dimensions swapped)', () => {
    const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
    const dims = calculateLensDimensions(1000, 500, 200, 200, transform);
    // After 90° rotation, effective dims are 500x1000
    expect(dims.width).toBeCloseTo(0.4); // 200/500
    expect(dims.height).toBeCloseTo(0.2); // 200/1000
  });

  it('should account for 270° rotation (dimensions swapped)', () => {
    const transform: Transform = { rotateSteps: 3, flipH: false, flipV: false };
    const dims = calculateLensDimensions(1000, 500, 200, 200, transform);
    // After 270° rotation, effective dims are 500x1000
    expect(dims.width).toBeCloseTo(0.4); // 200/500
    expect(dims.height).toBeCloseTo(0.2); // 200/1000
  });

  it('should not swap dimensions for 180° rotation', () => {
    const transform: Transform = { rotateSteps: 2, flipH: false, flipV: false };
    const dims = calculateLensDimensions(1000, 500, 200, 200, transform);
    expect(dims.width).toBeCloseTo(0.2); // 200/1000
    expect(dims.height).toBeCloseTo(0.4); // 200/500
  });

  it('should not change dimensions for flips (no rotation)', () => {
    const transform: Transform = { rotateSteps: 0, flipH: true, flipV: true };
    const dims = calculateLensDimensions(1000, 500, 200, 200, transform);
    expect(dims.width).toBeCloseTo(0.2);
    expect(dims.height).toBeCloseTo(0.4);
  });

  it('should throw for invalid image dimensions', () => {
    expect(() => calculateLensDimensions(0, 500, 200, 200)).toThrow('Invalid image dimensions');
    expect(() => calculateLensDimensions(500, 0, 200, 200)).toThrow('Invalid image dimensions');
    expect(() => calculateLensDimensions(-1, 500, 200, 200)).toThrow('Invalid image dimensions');
  });

  it('should throw for invalid panel dimensions', () => {
    expect(() => calculateLensDimensions(500, 500, 0, 200)).toThrow('Invalid panel dimensions');
    expect(() => calculateLensDimensions(500, 500, 200, 0)).toThrow('Invalid panel dimensions');
    expect(() => calculateLensDimensions(500, 500, -1, 200)).toThrow('Invalid panel dimensions');
  });
});

describe('screenToNormalizedLens', () => {
  it('should convert center screen position to centered lens', () => {
    const lens = screenToNormalizedLens(250, 200, 500, 400, 0.2, 0.25);
    // Center click at (250, 200) on 500x400 preview
    // Lens should be centered around (0.5, 0.5)
    expect(lens.x).toBeCloseTo(0.4); // 0.5 - 0.2/2
    expect(lens.y).toBeCloseTo(0.375); // 0.5 - 0.25/2
    expect(lens.width).toBe(0.2);
    expect(lens.height).toBe(0.25);
  });

  it('should clamp lens to top-left corner', () => {
    const lens = screenToNormalizedLens(0, 0, 500, 400, 0.2, 0.25);
    expect(lens.x).toBe(0);
    expect(lens.y).toBe(0);
  });

  it('should clamp lens to bottom-right corner', () => {
    const lens = screenToNormalizedLens(500, 400, 500, 400, 0.2, 0.25);
    expect(lens.x).toBeCloseTo(0.8); // 1 - 0.2
    expect(lens.y).toBeCloseTo(0.75); // 1 - 0.25
  });

  it('should handle full-size lens', () => {
    const lens = screenToNormalizedLens(250, 200, 500, 400, 1, 1);
    expect(lens.x).toBe(0);
    expect(lens.y).toBe(0);
    expect(lens.width).toBe(1);
    expect(lens.height).toBe(1);
  });

  it('should return centered lens for invalid screen dimensions', () => {
    const lens = screenToNormalizedLens(100, 100, 0, 0, 0.2, 0.2);
    expect(lens.x).toBeCloseTo(0.4);
    expect(lens.y).toBeCloseTo(0.4);
  });
});

describe('normalizedToScreenLens', () => {
  it('should convert normalized lens to screen coordinates', () => {
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const screen = normalizedToScreenLens(lens, 400, 300);
    expect(screen).toEqual({ x: 100, y: 75, width: 200, height: 150 });
  });

  it('should round to integers', () => {
    const lens: LensPosition = { x: 0.33, y: 0.33, width: 0.34, height: 0.34 };
    const screen = normalizedToScreenLens(lens, 100, 100);
    expect(Number.isInteger(screen.x)).toBe(true);
    expect(Number.isInteger(screen.y)).toBe(true);
    expect(Number.isInteger(screen.width)).toBe(true);
    expect(Number.isInteger(screen.height)).toBe(true);
  });

  it('should handle lens at origin', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 0.1, height: 0.1 };
    const screen = normalizedToScreenLens(lens, 500, 400);
    expect(screen.x).toBe(0);
    expect(screen.y).toBe(0);
    expect(screen.width).toBe(50);
    expect(screen.height).toBe(40);
  });

  it('should handle full coverage lens', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 1, height: 1 };
    const screen = normalizedToScreenLens(lens, 500, 400);
    expect(screen).toEqual({ x: 0, y: 0, width: 500, height: 400 });
  });
});

describe('normalizedToPixelRegion', () => {
  it('should convert normalized lens to pixel coordinates', () => {
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const region = normalizedToPixelRegion(lens, 1000, 800);
    expect(region).toEqual({ left: 250, top: 200, width: 500, height: 400 });
  });

  it('should handle lens at origin', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 0.2, height: 0.3 };
    const region = normalizedToPixelRegion(lens, 1000, 800);
    expect(region).toEqual({ left: 0, top: 0, width: 200, height: 240 });
  });

  it('should handle full coverage lens', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 1, height: 1 };
    const region = normalizedToPixelRegion(lens, 500, 400);
    expect(region).toEqual({ left: 0, top: 0, width: 500, height: 400 });
  });

  it('should clamp to valid bounds', () => {
    const lens: LensPosition = { x: 0.9, y: 0.9, width: 0.5, height: 0.5 };
    const region = normalizedToPixelRegion(lens, 100, 100);
    // Left = 90, but width would be 50 which exceeds bounds
    expect(region.left).toBe(90);
    expect(region.top).toBe(90);
    expect(region.width).toBe(10); // Clamped: min(50, 100-90)
    expect(region.height).toBe(10);
  });

  it('should account for 90° rotation', () => {
    const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const region = normalizedToPixelRegion(lens, 1000, 500, transform);
    // After 90° rotation, effective dims are 500x1000
    expect(region.left).toBe(125); // 0.25 * 500
    expect(region.top).toBe(250); // 0.25 * 1000
    expect(region.width).toBe(250); // 0.5 * 500
    expect(region.height).toBe(500); // 0.5 * 1000
  });

  it('should not swap dimensions for 180° rotation', () => {
    const transform: Transform = { rotateSteps: 2, flipH: false, flipV: false };
    const lens: LensPosition = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    const region = normalizedToPixelRegion(lens, 1000, 500, transform);
    // 180° doesn't swap dimensions
    expect(region.left).toBe(100);
    expect(region.top).toBe(50);
    expect(region.width).toBe(200);
    expect(region.height).toBe(100);
  });

  it('should handle very small lens (at least 1px)', () => {
    const lens: LensPosition = { x: 0.5, y: 0.5, width: 0.001, height: 0.001 };
    const region = normalizedToPixelRegion(lens, 100, 100);
    expect(region.width).toBeGreaterThanOrEqual(1);
    expect(region.height).toBeGreaterThanOrEqual(1);
  });
});

describe('clampLensPosition', () => {
  it('should not modify valid lens', () => {
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const clamped = clampLensPosition(lens);
    expect(clamped).toEqual(lens);
  });

  it('should clamp negative x', () => {
    const lens: LensPosition = { x: -0.1, y: 0.25, width: 0.5, height: 0.5 };
    const clamped = clampLensPosition(lens);
    expect(clamped.x).toBe(0);
  });

  it('should clamp negative y', () => {
    const lens: LensPosition = { x: 0.25, y: -0.1, width: 0.5, height: 0.5 };
    const clamped = clampLensPosition(lens);
    expect(clamped.y).toBe(0);
  });

  it('should clamp x when lens extends beyond right edge', () => {
    const lens: LensPosition = { x: 0.8, y: 0.25, width: 0.5, height: 0.25 };
    const clamped = clampLensPosition(lens);
    expect(clamped.x).toBe(0.5); // 1 - 0.5
  });

  it('should clamp y when lens extends beyond bottom edge', () => {
    const lens: LensPosition = { x: 0.25, y: 0.8, width: 0.25, height: 0.5 };
    const clamped = clampLensPosition(lens);
    expect(clamped.y).toBe(0.5); // 1 - 0.5
  });

  it('should clamp width to minimum 0.01', () => {
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0, height: 0.5 };
    const clamped = clampLensPosition(lens);
    expect(clamped.width).toBe(0.01);
  });

  it('should clamp height to minimum 0.01', () => {
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0.5, height: 0 };
    const clamped = clampLensPosition(lens);
    expect(clamped.height).toBe(0.01);
  });

  it('should clamp width to maximum 1', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 1.5, height: 0.5 };
    const clamped = clampLensPosition(lens);
    expect(clamped.width).toBe(1);
  });
});

describe('moveLens', () => {
  it('should move lens by delta', () => {
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const moved = moveLens(lens, 0.1, 0.1);
    expect(moved.x).toBeCloseTo(0.35);
    expect(moved.y).toBeCloseTo(0.35);
    expect(moved.width).toBe(0.5);
    expect(moved.height).toBe(0.5);
  });

  it('should move lens with negative delta', () => {
    const lens: LensPosition = { x: 0.5, y: 0.5, width: 0.2, height: 0.2 };
    const moved = moveLens(lens, -0.2, -0.3);
    expect(moved.x).toBeCloseTo(0.3);
    expect(moved.y).toBeCloseTo(0.2);
  });

  it('should clamp movement to top-left', () => {
    const lens: LensPosition = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    const moved = moveLens(lens, -0.5, -0.5);
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(0);
  });

  it('should clamp movement to bottom-right', () => {
    const lens: LensPosition = { x: 0.5, y: 0.5, width: 0.3, height: 0.3 };
    const moved = moveLens(lens, 0.5, 0.5);
    expect(moved.x).toBeCloseTo(0.7); // 1 - 0.3
    expect(moved.y).toBeCloseTo(0.7);
  });

  it('should not move with zero delta', () => {
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const moved = moveLens(lens, 0, 0);
    expect(moved.x).toBe(0.25);
    expect(moved.y).toBe(0.25);
  });
});

describe('isLensFullCoverage', () => {
  it('should return true for full coverage lens', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 1, height: 1 };
    expect(isLensFullCoverage(lens)).toBe(true);
  });

  it('should return true for near-full coverage lens', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 0.9999, height: 0.9999 };
    expect(isLensFullCoverage(lens)).toBe(true);
  });

  it('should return false for partial width', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 0.9, height: 1 };
    expect(isLensFullCoverage(lens)).toBe(false);
  });

  it('should return false for partial height', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 1, height: 0.9 };
    expect(isLensFullCoverage(lens)).toBe(false);
  });

  it('should return false for small lens', () => {
    const lens: LensPosition = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    expect(isLensFullCoverage(lens)).toBe(false);
  });
});

describe('getDetailDimensions', () => {
  it('should return pixel dimensions of detail region', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 0.5, height: 0.25 };
    const dims = getDetailDimensions(lens, 1000, 800);
    expect(dims).toEqual({ width: 500, height: 200 });
  });

  it('should return full dimensions for full coverage lens', () => {
    const lens: LensPosition = { x: 0, y: 0, width: 1, height: 1 };
    const dims = getDetailDimensions(lens, 400, 300);
    expect(dims).toEqual({ width: 400, height: 300 });
  });

  it('should account for rotation', () => {
    const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
    const lens: LensPosition = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const dims = getDetailDimensions(lens, 1000, 500, transform);
    // After 90° rotation: 500x1000
    expect(dims).toEqual({ width: 250, height: 500 });
  });
});

describe('cloneLens', () => {
  it('should create a copy of lens', () => {
    const lens: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.3 };
    const cloned = cloneLens(lens);
    expect(cloned).toEqual(lens);
    expect(cloned).not.toBe(lens);
  });

  it('should create independent copy', () => {
    const lens: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.3 };
    const cloned = cloneLens(lens);
    cloned.x = 0.5;
    expect(lens.x).toBe(0.25);
  });
});

describe('lensEqual', () => {
  it('should return true for equal lenses', () => {
    const a: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.3 };
    const b: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.3 };
    expect(lensEqual(a, b)).toBe(true);
  });

  it('should return false for different x', () => {
    const a: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.3 };
    const b: LensPosition = { x: 0.26, y: 0.35, width: 0.4, height: 0.3 };
    expect(lensEqual(a, b)).toBe(false);
  });

  it('should return false for different y', () => {
    const a: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.3 };
    const b: LensPosition = { x: 0.25, y: 0.36, width: 0.4, height: 0.3 };
    expect(lensEqual(a, b)).toBe(false);
  });

  it('should return false for different width', () => {
    const a: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.3 };
    const b: LensPosition = { x: 0.25, y: 0.35, width: 0.5, height: 0.3 };
    expect(lensEqual(a, b)).toBe(false);
  });

  it('should return false for different height', () => {
    const a: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.3 };
    const b: LensPosition = { x: 0.25, y: 0.35, width: 0.4, height: 0.4 };
    expect(lensEqual(a, b)).toBe(false);
  });
});
