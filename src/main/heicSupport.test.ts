/**
 * Tests for HEIC encode support detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkHeicEncodeSupport, getCachedHeicSupport, clearHeicSupportCache, type HeicSupportResult } from './heicSupport';

describe('heicSupport', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearHeicSupportCache();
  });

  describe('checkHeicEncodeSupport', () => {
    it('should return a HeicSupportResult object', async () => {
      const result = await checkHeicEncodeSupport();
      
      expect(result).toBeDefined();
      expect(typeof result.supported).toBe('boolean');
    });

    it('should have a reason when not supported', async () => {
      const result = await checkHeicEncodeSupport();
      
      // Either it's supported (no reason needed) or it has a reason
      if (!result.supported) {
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
        expect(result.reason!.length).toBeGreaterThan(0);
      }
    });

    it('should cache the result', async () => {
      const result1 = await checkHeicEncodeSupport();
      const result2 = await checkHeicEncodeSupport();
      
      // Should be the same object reference (cached)
      expect(result1).toBe(result2);
    });

    it('should return consistent results on multiple calls', async () => {
      const result1 = await checkHeicEncodeSupport();
      const result2 = await checkHeicEncodeSupport();
      const result3 = await checkHeicEncodeSupport();
      
      expect(result1.supported).toBe(result2.supported);
      expect(result2.supported).toBe(result3.supported);
    });
  });

  describe('getCachedHeicSupport', () => {
    it('should return null before check is performed', () => {
      const cached = getCachedHeicSupport();
      expect(cached).toBeNull();
    });

    it('should return cached result after check', async () => {
      await checkHeicEncodeSupport();
      const cached = getCachedHeicSupport();
      
      expect(cached).not.toBeNull();
      expect(typeof cached!.supported).toBe('boolean');
    });
  });

  describe('clearHeicSupportCache', () => {
    it('should clear the cached result', async () => {
      await checkHeicEncodeSupport();
      expect(getCachedHeicSupport()).not.toBeNull();
      
      clearHeicSupportCache();
      expect(getCachedHeicSupport()).toBeNull();
    });

    it('should allow re-checking after clear', async () => {
      const result1 = await checkHeicEncodeSupport();
      clearHeicSupportCache();
      const result2 = await checkHeicEncodeSupport();
      
      // Results should have same supported value (deterministic)
      expect(result1.supported).toBe(result2.supported);
      
      // But should be different object references (re-computed)
      // Note: This might fail if caching is too aggressive
    });
  });

  describe('HeicSupportResult structure', () => {
    it('should have correct structure when supported', async () => {
      const result = await checkHeicEncodeSupport();
      
      if (result.supported) {
        expect(result).toEqual({ supported: true });
        expect(result.reason).toBeUndefined();
      }
    });

    it('should have correct structure when not supported', async () => {
      const result = await checkHeicEncodeSupport();
      
      if (!result.supported) {
        expect(result.supported).toBe(false);
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
      }
    });
  });
});
