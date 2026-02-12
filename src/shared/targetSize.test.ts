/**
 * Unit tests for target size algorithm.
 * Uses mocked encode size functions to test algorithm behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_DIMENSION,
  SIZE_TOLERANCE,
  isWithinTolerance,
  isAtMinDimension,
  calculateScaledDimensions,
  estimateBytesPerPixel,
  estimateDimensionsForTarget,
  estimateFileSize,
  findTargetSize,
  type EncodeSizeFunction,
  type TargetSizeOptions,
} from './targetSize';
import { mibToBytes, bytesToMiB, BYTES_PER_MIB } from './bytes';

describe('targetSize', () => {
  describe('constants', () => {
    it('should have MIN_DIMENSION of 48', () => {
      expect(MIN_DIMENSION).toBe(48);
    });

    it('should have SIZE_TOLERANCE of 0.10 (10%)', () => {
      expect(SIZE_TOLERANCE).toBe(0.10);
    });
  });

  describe('isWithinTolerance', () => {
    it('should return true when actual equals target', () => {
      expect(isWithinTolerance(1000000, 1000000)).toBe(true);
    });

    it('should return true at lower bound (target - 10%)', () => {
      const target = 1000000;
      const lowerBound = target * 0.9;
      expect(isWithinTolerance(lowerBound, target)).toBe(true);
    });

    it('should return true at upper bound (target + 10%)', () => {
      const target = 1000000;
      const upperBound = target * 1.1;
      expect(isWithinTolerance(upperBound, target)).toBe(true);
    });

    it('should return false below lower bound', () => {
      const target = 1000000;
      const belowLower = target * 0.89;
      expect(isWithinTolerance(belowLower, target)).toBe(false);
    });

    it('should return false above upper bound', () => {
      const target = 1000000;
      const aboveUpper = target * 1.11;
      expect(isWithinTolerance(aboveUpper, target)).toBe(false);
    });

    it('should handle small target values', () => {
      expect(isWithinTolerance(90, 100)).toBe(true);
      expect(isWithinTolerance(110, 100)).toBe(true);
      expect(isWithinTolerance(89, 100)).toBe(false);
    });

    it('should handle zero target', () => {
      expect(isWithinTolerance(0, 0)).toBe(true);
      expect(isWithinTolerance(1, 0)).toBe(false);
    });
  });

  describe('isAtMinDimension', () => {
    it('should return true when width equals MIN_DIMENSION', () => {
      expect(isAtMinDimension(MIN_DIMENSION, 100)).toBe(true);
    });

    it('should return true when height equals MIN_DIMENSION', () => {
      expect(isAtMinDimension(100, MIN_DIMENSION)).toBe(true);
    });

    it('should return true when both equal MIN_DIMENSION', () => {
      expect(isAtMinDimension(MIN_DIMENSION, MIN_DIMENSION)).toBe(true);
    });

    it('should return true when width is below MIN_DIMENSION', () => {
      expect(isAtMinDimension(MIN_DIMENSION - 1, 100)).toBe(true);
    });

    it('should return true when height is below MIN_DIMENSION', () => {
      expect(isAtMinDimension(100, MIN_DIMENSION - 1)).toBe(true);
    });

    it('should return false when both dimensions are above MIN_DIMENSION', () => {
      expect(isAtMinDimension(MIN_DIMENSION + 1, MIN_DIMENSION + 1)).toBe(false);
      expect(isAtMinDimension(100, 100)).toBe(false);
      expect(isAtMinDimension(1920, 1080)).toBe(false);
    });
  });

  describe('calculateScaledDimensions', () => {
    it('should scale dimensions correctly at 50%', () => {
      const result = calculateScaledDimensions(1000, 800, 0.5);
      expect(result.width).toBe(500);
      expect(result.height).toBe(400);
    });

    it('should scale dimensions correctly at 100%', () => {
      const result = calculateScaledDimensions(1920, 1080, 1.0);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });

    it('should scale dimensions correctly at 25%', () => {
      const result = calculateScaledDimensions(2000, 1600, 0.25);
      expect(result.width).toBe(500);
      expect(result.height).toBe(400);
    });

    it('should round to nearest integer', () => {
      const result = calculateScaledDimensions(1000, 1000, 0.333);
      expect(result.width).toBe(333);
      expect(result.height).toBe(333);
    });

    it('should clamp to MIN_DIMENSION when scaling very small', () => {
      const result = calculateScaledDimensions(100, 100, 0.1);
      // 100 * 0.1 = 10, but should clamp to MIN_DIMENSION (48)
      expect(result.width).toBe(MIN_DIMENSION);
      expect(result.height).toBe(MIN_DIMENSION);
    });

    it('should clamp only the smaller dimension to MIN_DIMENSION', () => {
      const result = calculateScaledDimensions(1000, 100, 0.1);
      // width: 1000 * 0.1 = 100 (above MIN)
      // height: 100 * 0.1 = 10 (below MIN, clamp to 48)
      expect(result.width).toBe(100);
      expect(result.height).toBe(MIN_DIMENSION);
    });
  });

  describe('estimateBytesPerPixel', () => {
    it('should return lower value for quality 40', () => {
      const bpp = estimateBytesPerPixel(40);
      expect(bpp).toBeCloseTo(0.1, 1);
    });

    it('should return higher value for quality 100', () => {
      const bpp = estimateBytesPerPixel(100);
      expect(bpp).toBeCloseTo(0.8, 1);
    });

    it('should return middle value for quality 70', () => {
      const bpp = estimateBytesPerPixel(70);
      // (70 - 40) / 60 = 0.5
      // 0.1 + 0.5 * 0.7 = 0.45
      expect(bpp).toBeGreaterThan(0.4);
      expect(bpp).toBeLessThan(0.5);
    });

    it('should increase monotonically with quality', () => {
      let prev = 0;
      for (let q = 40; q <= 100; q += 10) {
        const bpp = estimateBytesPerPixel(q);
        expect(bpp).toBeGreaterThan(prev);
        prev = bpp;
      }
    });
  });

  describe('estimateDimensionsForTarget', () => {
    it('should estimate smaller dimensions for 1 MiB target from large image', () => {
      const result = estimateDimensionsForTarget(4000, 3000, 1, 85);
      expect(result.width).toBeLessThan(4000);
      expect(result.height).toBeLessThan(3000);
      expect(result.scale).toBeLessThan(1);
    });

    it('should estimate scale of 1 when target is large enough for original', () => {
      // Small image, large target
      const result = estimateDimensionsForTarget(100, 100, 10, 85);
      expect(result.scale).toBeCloseTo(1, 1);
    });

    it('should maintain aspect ratio', () => {
      const result = estimateDimensionsForTarget(1600, 900, 0.5, 85);
      const originalRatio = 1600 / 900;
      const resultRatio = result.width / result.height;
      expect(resultRatio).toBeCloseTo(originalRatio, 1);
    });

    it('should not scale below MIN_SCALE', () => {
      const result = estimateDimensionsForTarget(10000, 10000, 0.001, 85);
      expect(result.scale).toBeGreaterThanOrEqual(0.01);
    });
  });

  describe('estimateFileSize', () => {
    it('should estimate larger size for higher quality', () => {
      const lowQ = estimateFileSize(1000, 1000, 40);
      const highQ = estimateFileSize(1000, 1000, 100);
      expect(highQ).toBeGreaterThan(lowQ);
    });

    it('should estimate larger size for larger dimensions', () => {
      const small = estimateFileSize(500, 500, 85);
      const large = estimateFileSize(2000, 2000, 85);
      expect(large).toBeGreaterThan(small);
    });

    it('should return reasonable estimates (within order of magnitude)', () => {
      // 1000x1000 at quality 85 should be roughly 400KB-800KB
      const size = estimateFileSize(1000, 1000, 85);
      expect(size).toBeGreaterThan(100000); // > 100KB
      expect(size).toBeLessThan(2000000); // < 2MB
    });
  });

  describe('findTargetSize', () => {
    // Helper to create a mock encode function with predictable output
    function createMockEncode(bytesPerPixel: number): EncodeSizeFunction {
      return async (width: number, height: number, _quality: number) => {
        return Math.round(width * height * bytesPerPixel);
      };
    }

    // Mock encode that respects quality
    function createQualityAwareEncode(): EncodeSizeFunction {
      return async (width: number, height: number, quality: number) => {
        const bpp = 0.1 + ((quality - 40) / 60) * 0.7;
        return Math.round(width * height * bpp);
      };
    }

    describe('success within tolerance', () => {
      it('should succeed when original is already within tolerance', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 1000,
          sourceHeight: 1000,
          targetMiB: 0.5,
          quality: 85,
        };
        
        // 0.5 bytes per pixel: 1000*1000*0.5 = 500KB = ~0.477 MiB
        // Target: 0.5 MiB = ~524KB
        // Within 10% tolerance
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(true);
        expect(result.width).toBe(1000);
        expect(result.height).toBe(1000);
        expect(result.scale).toBe(1);
      });

      it('should find scaled dimensions within tolerance', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 2000,
          sourceHeight: 2000,
          targetMiB: 0.5,
          quality: 85,
        };
        
        // 0.5 bytes per pixel: 2000*2000*0.5 = 2MB
        // Need to scale down to reach 0.5 MiB (~524KB)
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(true);
        expect(result.scale).toBeLessThan(1);
        expect(result.width).toBeLessThan(2000);
        expect(result.height).toBeLessThan(2000);
        
        // Verify result is within tolerance
        const targetBytes = mibToBytes(0.5);
        expect(isWithinTolerance(result.bytes, targetBytes)).toBe(true);
      });

      it('should work with quality-aware encoding', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 3000,
          sourceHeight: 2000,
          targetMiB: 1.0,
          quality: 80,
        };
        
        const encode = createQualityAwareEncode();
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(true);
        const targetBytes = mibToBytes(1.0);
        expect(isWithinTolerance(result.bytes, targetBytes)).toBe(true);
      });
    });

    describe('unreachable target', () => {
      it('should handle target smaller than minimum possible size', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 1000,
          sourceHeight: 1000,
          targetMiB: 0.0001, // Impossibly small
          quality: 85,
        };
        
        // Even at minimum 48x48, the file will be larger than 0.0001 MiB
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(false);
        expect(result.warning).toBeDefined();
        expect(result.width).toBe(MIN_DIMENSION);
        expect(result.height).toBe(MIN_DIMENSION);
      });

      it('should include warning message when target unreachable', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 500,
          sourceHeight: 500,
          targetMiB: 0.0001,
          quality: 85,
        };
        
        const encode = createMockEncode(1.0);
        const result = await findTargetSize(options, encode);
        
        expect(result.warning).toContain('Cannot reach target');
        expect(result.warning).toContain(`${MIN_DIMENSION}`);
      });
    });

    describe('min-size stop', () => {
      it('should stop at MIN_DIMENSION when scaling would go below', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 200,
          sourceHeight: 200,
          targetMiB: 0.001, // Very small target
          quality: 85,
        };
        
        const encode = createMockEncode(1.0);
        const result = await findTargetSize(options, encode);
        
        // Should stop at or near MIN_DIMENSION
        expect(result.width).toBeGreaterThanOrEqual(MIN_DIMENSION);
        expect(result.height).toBeGreaterThanOrEqual(MIN_DIMENSION);
      });

      it('should preserve aspect ratio even at minimum scale', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 1600,
          sourceHeight: 900,
          targetMiB: 0.001,
          quality: 85,
        };
        
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        // At minimum, one dimension should be MIN_DIMENSION
        expect(
          result.width === MIN_DIMENSION || result.height === MIN_DIMENSION
        ).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle zero target MiB', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 1000,
          sourceHeight: 1000,
          targetMiB: 0,
          quality: 85,
        };
        
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(false);
        expect(result.warning).toContain('greater than 0');
      });

      it('should handle negative target MiB', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 1000,
          sourceHeight: 1000,
          targetMiB: -1,
          quality: 85,
        };
        
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(false);
      });

      it('should handle when original is smaller than target', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 100,
          sourceHeight: 100,
          targetMiB: 10, // Much larger than possible
          quality: 85,
        };
        
        // 100*100*0.5 = 5000 bytes = ~0.005 MiB
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(true);
        expect(result.scale).toBe(1); // Should not scale up
        expect(result.warning).toContain('smaller than target');
      });

      it('should track iteration count', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 2000,
          sourceHeight: 2000,
          targetMiB: 0.5,
          quality: 85,
        };
        
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.iterations).toBeGreaterThan(0);
        expect(result.iterations).toBeLessThanOrEqual(20);
      });

      it('should handle square images', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 1500,
          sourceHeight: 1500,
          targetMiB: 0.3,
          quality: 85,
        };
        
        const encode = createMockEncode(0.4);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(true);
        // Result should also be roughly square
        expect(Math.abs(result.width - result.height)).toBeLessThan(5);
      });

      it('should handle portrait images', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 1000,
          sourceHeight: 2000,
          targetMiB: 0.4,
          quality: 85,
        };
        
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(true);
        expect(result.height).toBeGreaterThan(result.width);
      });

      it('should handle landscape images', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 2000,
          sourceHeight: 1000,
          targetMiB: 0.4,
          quality: 85,
        };
        
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        expect(result.success).toBe(true);
        expect(result.width).toBeGreaterThan(result.height);
      });
    });

    describe('iteration efficiency', () => {
      it('should find result in reasonable iterations', async () => {
        const options: TargetSizeOptions = {
          sourceWidth: 4000,
          sourceHeight: 3000,
          targetMiB: 0.5,
          quality: 85,
        };
        
        const encode = createMockEncode(0.5);
        const result = await findTargetSize(options, encode);
        
        // Binary search should find result in ~10-15 iterations
        expect(result.iterations).toBeLessThan(20);
      });
    });
  });

  describe('tolerance calculations', () => {
    it('should correctly calculate 10% bounds', () => {
      const target = BYTES_PER_MIB; // 1 MiB
      const low = target * 0.9; // 0.9 MiB
      const high = target * 1.1; // 1.1 MiB
      
      expect(isWithinTolerance(low, target)).toBe(true);
      expect(isWithinTolerance(high, target)).toBe(true);
      expect(isWithinTolerance(low - 1, target)).toBe(false);
      expect(isWithinTolerance(high + 1, target)).toBe(false);
    });
  });
});
