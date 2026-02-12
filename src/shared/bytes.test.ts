import { describe, it, expect } from 'vitest';
import {
  BYTES_PER_MIB,
  bytesToMiB,
  mibToBytes,
  formatMiB,
  parseMiBString,
} from './bytes';

describe('bytes.ts', () => {
  describe('BYTES_PER_MIB constant', () => {
    it('should be 2^20 = 1,048,576', () => {
      expect(BYTES_PER_MIB).toBe(1_048_576);
      expect(BYTES_PER_MIB).toBe(Math.pow(2, 20));
    });
  });

  describe('bytesToMiB', () => {
    it('should convert 0 bytes to 0 MiB', () => {
      expect(bytesToMiB(0)).toBe(0);
    });

    it('should convert exactly 1 MiB', () => {
      expect(bytesToMiB(1_048_576)).toBe(1);
    });

    it('should convert 2.5 MiB correctly', () => {
      expect(bytesToMiB(2_621_440)).toBe(2.5);
    });

    it('should handle small values (less than 1 MiB)', () => {
      expect(bytesToMiB(524_288)).toBe(0.5);
      expect(bytesToMiB(104_857.6)).toBeCloseTo(0.1, 5);
    });

    it('should handle large values', () => {
      // 1 GiB = 1024 MiB
      expect(bytesToMiB(1_073_741_824)).toBe(1024);
    });

    it('should throw for negative bytes', () => {
      expect(() => bytesToMiB(-1)).toThrow('Bytes cannot be negative');
    });
  });

  describe('mibToBytes', () => {
    it('should convert 0 MiB to 0 bytes', () => {
      expect(mibToBytes(0)).toBe(0);
    });

    it('should convert exactly 1 MiB', () => {
      expect(mibToBytes(1)).toBe(1_048_576);
    });

    it('should convert fractional MiB and round', () => {
      expect(mibToBytes(2.5)).toBe(2_621_440);
      expect(mibToBytes(0.1)).toBe(104_858); // rounded
    });

    it('should handle large values', () => {
      expect(mibToBytes(1024)).toBe(1_073_741_824);
    });

    it('should throw for negative MiB', () => {
      expect(() => mibToBytes(-1)).toThrow('MiB cannot be negative');
    });
  });

  describe('formatMiB', () => {
    it('should format 0 bytes as "0.0 MiB"', () => {
      expect(formatMiB(0)).toBe('0.0 MiB');
    });

    it('should format exactly 1 MiB', () => {
      expect(formatMiB(1_048_576)).toBe('1.0 MiB');
    });

    it('should format with 1 decimal place', () => {
      expect(formatMiB(2_411_725)).toBe('2.3 MiB'); // 2.3 MiB = 2,411,724.8 bytes
    });

    it('should round correctly at edge boundaries', () => {
      // 2.34 MiB should round to 2.3
      const bytes_2_34 = Math.round(2.34 * BYTES_PER_MIB);
      expect(formatMiB(bytes_2_34)).toBe('2.3 MiB');

      // 2.35 MiB should round to 2.4 (toFixed rounds half-up)
      const bytes_2_35 = Math.round(2.35 * BYTES_PER_MIB);
      expect(formatMiB(bytes_2_35)).toBe('2.4 MiB');

      // 2.36 MiB should round to 2.4
      const bytes_2_36 = Math.round(2.36 * BYTES_PER_MIB);
      expect(formatMiB(bytes_2_36)).toBe('2.4 MiB');
    });

    it('should handle very small values', () => {
      expect(formatMiB(1)).toBe('0.0 MiB');
      expect(formatMiB(52_428)).toBe('0.0 MiB'); // ~0.05 MiB rounds to 0.0
      expect(formatMiB(104_858)).toBe('0.1 MiB'); // ~0.1 MiB
    });

    it('should handle large values', () => {
      // 1 GiB = 1024 MiB
      expect(formatMiB(1_073_741_824)).toBe('1024.0 MiB');
      // 15.7 MiB
      expect(formatMiB(16_462_028)).toBe('15.7 MiB');
    });

    it('should throw for negative bytes', () => {
      expect(() => formatMiB(-1)).toThrow('Bytes cannot be negative');
    });
  });

  describe('parseMiBString', () => {
    it('should parse "0 MiB"', () => {
      expect(parseMiBString('0 MiB')).toBe(0);
    });

    it('should parse "1 MiB"', () => {
      expect(parseMiBString('1 MiB')).toBe(1_048_576);
    });

    it('should parse "2.3 MiB"', () => {
      expect(parseMiBString('2.3 MiB')).toBe(mibToBytes(2.3));
    });

    it('should parse without "MiB" suffix', () => {
      expect(parseMiBString('5.5')).toBe(mibToBytes(5.5));
    });

    it('should be case-insensitive for suffix', () => {
      expect(parseMiBString('3.0 mib')).toBe(mibToBytes(3.0));
      expect(parseMiBString('3.0 MIB')).toBe(mibToBytes(3.0));
    });

    it('should handle whitespace', () => {
      expect(parseMiBString('  2.0 MiB  ')).toBe(mibToBytes(2.0));
      expect(parseMiBString('2.0  MiB')).toBe(mibToBytes(2.0));
    });

    it('should return NaN for invalid input', () => {
      expect(parseMiBString('abc')).toBeNaN();
      expect(parseMiBString('')).toBeNaN();
      expect(parseMiBString('MiB')).toBeNaN();
    });

    it('should return NaN for negative values', () => {
      expect(parseMiBString('-5 MiB')).toBeNaN();
    });
  });
});
