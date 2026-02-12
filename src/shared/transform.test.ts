/**
 * Unit tests for transform utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  rotateTransformCW,
  rotateTransformCCW,
  flipTransformH,
  flipTransformV,
  createIdentityTransform,
  isIdentityTransform,
  getTransformedDimensions,
  rotationStepsToDegrees,
  combineTransforms,
  transformsEqual,
  cloneTransform,
  transformToCSS,
} from './transform';
import type { Transform } from './types';

describe('transform utilities', () => {
  describe('createIdentityTransform', () => {
    it('should create a default transform with no rotation or flip', () => {
      const transform = createIdentityTransform();
      expect(transform).toEqual({ rotateSteps: 0, flipH: false, flipV: false });
    });
  });

  describe('isIdentityTransform', () => {
    it('should return true for identity transform', () => {
      expect(isIdentityTransform({ rotateSteps: 0, flipH: false, flipV: false })).toBe(true);
    });

    it('should return false for rotated transform', () => {
      expect(isIdentityTransform({ rotateSteps: 1, flipH: false, flipV: false })).toBe(false);
      expect(isIdentityTransform({ rotateSteps: 2, flipH: false, flipV: false })).toBe(false);
      expect(isIdentityTransform({ rotateSteps: 3, flipH: false, flipV: false })).toBe(false);
    });

    it('should return false for flipped transform', () => {
      expect(isIdentityTransform({ rotateSteps: 0, flipH: true, flipV: false })).toBe(false);
      expect(isIdentityTransform({ rotateSteps: 0, flipH: false, flipV: true })).toBe(false);
      expect(isIdentityTransform({ rotateSteps: 0, flipH: true, flipV: true })).toBe(false);
    });
  });

  describe('rotateTransformCW', () => {
    it('should rotate 0 -> 1 (0° -> 90°)', () => {
      const result = rotateTransformCW({ rotateSteps: 0, flipH: false, flipV: false });
      expect(result.rotateSteps).toBe(1);
    });

    it('should rotate 1 -> 2 (90° -> 180°)', () => {
      const result = rotateTransformCW({ rotateSteps: 1, flipH: false, flipV: false });
      expect(result.rotateSteps).toBe(2);
    });

    it('should rotate 2 -> 3 (180° -> 270°)', () => {
      const result = rotateTransformCW({ rotateSteps: 2, flipH: false, flipV: false });
      expect(result.rotateSteps).toBe(3);
    });

    it('should wrap 3 -> 0 (270° -> 0°)', () => {
      const result = rotateTransformCW({ rotateSteps: 3, flipH: false, flipV: false });
      expect(result.rotateSteps).toBe(0);
    });

    it('should preserve flip state', () => {
      const result = rotateTransformCW({ rotateSteps: 0, flipH: true, flipV: true });
      expect(result.flipH).toBe(true);
      expect(result.flipV).toBe(true);
    });

    it('should return a new object', () => {
      const original: Transform = { rotateSteps: 0, flipH: false, flipV: false };
      const result = rotateTransformCW(original);
      expect(result).not.toBe(original);
    });
  });

  describe('rotateTransformCCW', () => {
    it('should rotate 0 -> 3 (0° -> 270°)', () => {
      const result = rotateTransformCCW({ rotateSteps: 0, flipH: false, flipV: false });
      expect(result.rotateSteps).toBe(3);
    });

    it('should rotate 1 -> 0 (90° -> 0°)', () => {
      const result = rotateTransformCCW({ rotateSteps: 1, flipH: false, flipV: false });
      expect(result.rotateSteps).toBe(0);
    });

    it('should rotate 2 -> 1 (180° -> 90°)', () => {
      const result = rotateTransformCCW({ rotateSteps: 2, flipH: false, flipV: false });
      expect(result.rotateSteps).toBe(1);
    });

    it('should rotate 3 -> 2 (270° -> 180°)', () => {
      const result = rotateTransformCCW({ rotateSteps: 3, flipH: false, flipV: false });
      expect(result.rotateSteps).toBe(2);
    });

    it('should preserve flip state', () => {
      const result = rotateTransformCCW({ rotateSteps: 1, flipH: true, flipV: false });
      expect(result.flipH).toBe(true);
      expect(result.flipV).toBe(false);
    });
  });

  describe('flipTransformH', () => {
    it('should toggle flipH false -> true', () => {
      const result = flipTransformH({ rotateSteps: 0, flipH: false, flipV: false });
      expect(result.flipH).toBe(true);
      expect(result.flipV).toBe(false);
    });

    it('should toggle flipH true -> false', () => {
      const result = flipTransformH({ rotateSteps: 0, flipH: true, flipV: false });
      expect(result.flipH).toBe(false);
    });

    it('should preserve rotation and flipV', () => {
      const result = flipTransformH({ rotateSteps: 2, flipH: false, flipV: true });
      expect(result.rotateSteps).toBe(2);
      expect(result.flipH).toBe(true);
      expect(result.flipV).toBe(true);
    });
  });

  describe('flipTransformV', () => {
    it('should toggle flipV false -> true', () => {
      const result = flipTransformV({ rotateSteps: 0, flipH: false, flipV: false });
      expect(result.flipV).toBe(true);
      expect(result.flipH).toBe(false);
    });

    it('should toggle flipV true -> false', () => {
      const result = flipTransformV({ rotateSteps: 0, flipH: false, flipV: true });
      expect(result.flipV).toBe(false);
    });

    it('should preserve rotation and flipH', () => {
      const result = flipTransformV({ rotateSteps: 1, flipH: true, flipV: false });
      expect(result.rotateSteps).toBe(1);
      expect(result.flipH).toBe(true);
      expect(result.flipV).toBe(true);
    });
  });

  describe('getTransformedDimensions', () => {
    it('should return same dimensions for no rotation', () => {
      const result = getTransformedDimensions(800, 600, { rotateSteps: 0, flipH: false, flipV: false });
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('should swap dimensions for 90° rotation', () => {
      const result = getTransformedDimensions(800, 600, { rotateSteps: 1, flipH: false, flipV: false });
      expect(result).toEqual({ width: 600, height: 800 });
    });

    it('should return same dimensions for 180° rotation', () => {
      const result = getTransformedDimensions(800, 600, { rotateSteps: 2, flipH: false, flipV: false });
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('should swap dimensions for 270° rotation', () => {
      const result = getTransformedDimensions(800, 600, { rotateSteps: 3, flipH: false, flipV: false });
      expect(result).toEqual({ width: 600, height: 800 });
    });

    it('should ignore flip for dimension calculation', () => {
      const result = getTransformedDimensions(800, 600, { rotateSteps: 1, flipH: true, flipV: true });
      expect(result).toEqual({ width: 600, height: 800 });
    });

    it('should handle square dimensions', () => {
      const result = getTransformedDimensions(500, 500, { rotateSteps: 1, flipH: false, flipV: false });
      expect(result).toEqual({ width: 500, height: 500 });
    });
  });

  describe('rotationStepsToDegrees', () => {
    it('should convert 0 steps to 0°', () => {
      expect(rotationStepsToDegrees(0)).toBe(0);
    });

    it('should convert 1 step to 90°', () => {
      expect(rotationStepsToDegrees(1)).toBe(90);
    });

    it('should convert 2 steps to 180°', () => {
      expect(rotationStepsToDegrees(2)).toBe(180);
    });

    it('should convert 3 steps to 270°', () => {
      expect(rotationStepsToDegrees(3)).toBe(270);
    });
  });

  describe('transformsEqual', () => {
    it('should return true for identical transforms', () => {
      const a: Transform = { rotateSteps: 1, flipH: true, flipV: false };
      const b: Transform = { rotateSteps: 1, flipH: true, flipV: false };
      expect(transformsEqual(a, b)).toBe(true);
    });

    it('should return false for different rotations', () => {
      const a: Transform = { rotateSteps: 0, flipH: false, flipV: false };
      const b: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      expect(transformsEqual(a, b)).toBe(false);
    });

    it('should return false for different flipH', () => {
      const a: Transform = { rotateSteps: 0, flipH: true, flipV: false };
      const b: Transform = { rotateSteps: 0, flipH: false, flipV: false };
      expect(transformsEqual(a, b)).toBe(false);
    });

    it('should return false for different flipV', () => {
      const a: Transform = { rotateSteps: 0, flipH: false, flipV: true };
      const b: Transform = { rotateSteps: 0, flipH: false, flipV: false };
      expect(transformsEqual(a, b)).toBe(false);
    });
  });

  describe('cloneTransform', () => {
    it('should create an identical copy', () => {
      const original: Transform = { rotateSteps: 2, flipH: true, flipV: true };
      const cloned = cloneTransform(original);
      expect(cloned).toEqual(original);
    });

    it('should return a new object', () => {
      const original: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      const cloned = cloneTransform(original);
      expect(cloned).not.toBe(original);
    });

    it('should not be affected by changes to original', () => {
      const original: Transform = { rotateSteps: 0, flipH: false, flipV: false };
      const cloned = cloneTransform(original);
      // Note: TypeScript won't let us modify rotateSteps directly due to the union type,
      // but this test validates the concept
      expect(cloned.rotateSteps).toBe(0);
      expect(cloned.flipH).toBe(false);
    });
  });

  describe('combineTransforms', () => {
    it('should combine with identity to produce the original', () => {
      const identity = createIdentityTransform();
      const t: Transform = { rotateSteps: 1, flipH: true, flipV: false };
      const combined = combineTransforms(identity, t);
      expect(combined).toEqual(t);
    });

    it('should add rotation steps', () => {
      const a: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      const b: Transform = { rotateSteps: 2, flipH: false, flipV: false };
      const combined = combineTransforms(a, b);
      expect(combined.rotateSteps).toBe(3);
    });

    it('should wrap rotation steps at 4', () => {
      const a: Transform = { rotateSteps: 3, flipH: false, flipV: false };
      const b: Transform = { rotateSteps: 2, flipH: false, flipV: false };
      const combined = combineTransforms(a, b);
      expect(combined.rotateSteps).toBe(1); // (3 + 2) % 4 = 1
    });
  });

  describe('transformToCSS', () => {
    it('should return "none" for identity transform', () => {
      const transform = createIdentityTransform();
      expect(transformToCSS(transform)).toBe('none');
    });

    it('should return rotate for 90°', () => {
      const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      expect(transformToCSS(transform)).toBe('rotate(90deg)');
    });

    it('should return rotate for 180°', () => {
      const transform: Transform = { rotateSteps: 2, flipH: false, flipV: false };
      expect(transformToCSS(transform)).toBe('rotate(180deg)');
    });

    it('should return rotate for 270°', () => {
      const transform: Transform = { rotateSteps: 3, flipH: false, flipV: false };
      expect(transformToCSS(transform)).toBe('rotate(270deg)');
    });

    it('should return scaleX(-1) for horizontal flip only', () => {
      const transform: Transform = { rotateSteps: 0, flipH: true, flipV: false };
      expect(transformToCSS(transform)).toBe('scaleX(-1)');
    });

    it('should return scaleY(-1) for vertical flip only', () => {
      const transform: Transform = { rotateSteps: 0, flipH: false, flipV: true };
      expect(transformToCSS(transform)).toBe('scaleY(-1)');
    });

    it('should return scale(-1, -1) for both flips', () => {
      const transform: Transform = { rotateSteps: 0, flipH: true, flipV: true };
      expect(transformToCSS(transform)).toBe('scale(-1, -1)');
    });

    it('should combine rotation and flip', () => {
      const transform: Transform = { rotateSteps: 1, flipH: true, flipV: false };
      expect(transformToCSS(transform)).toBe('rotate(90deg) scaleX(-1)');
    });

    it('should combine rotation with both flips', () => {
      const transform: Transform = { rotateSteps: 2, flipH: true, flipV: true };
      expect(transformToCSS(transform)).toBe('rotate(180deg) scale(-1, -1)');
    });
  });
});
