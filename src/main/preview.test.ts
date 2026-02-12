/**
 * Tests for preview generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { generatePreview, generatePreviewFromBuffer, generateDetailPreview, generateDetailPreviewFromBuffer } from './preview';
import type { Transform } from '../shared/types';

describe('preview generation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reformat-preview-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function createTestImage(
    filename: string,
    width: number,
    height: number,
    hasAlpha = false
  ): Promise<string> {
    const filePath = path.join(tempDir, filename);
    const channels = hasAlpha ? 4 : 3;
    const rawData = Buffer.alloc(width * height * channels, 0);
    
    // Fill with a color pattern for testing
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        rawData[idx] = x % 256;     // R
        rawData[idx + 1] = y % 256; // G
        rawData[idx + 2] = 128;     // B
        if (hasAlpha) {
          rawData[idx + 3] = 255;   // A
        }
      }
    }

    await sharp(rawData, {
      raw: { width, height, channels },
    })
      .toFormat('png')
      .toFile(filePath);

    return filePath;
  }

  describe('generatePreview', () => {
    it('should generate a preview from a file', async () => {
      const testFile = await createTestImage('test.png', 200, 100);
      
      const result = await generatePreview(testFile, { maxSize: 800 });
      
      expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(result.originalWidth).toBe(200);
      expect(result.originalHeight).toBe(100);
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('should downscale large images', async () => {
      const testFile = await createTestImage('large.png', 2000, 1000);
      
      const result = await generatePreview(testFile, { maxSize: 400 });
      
      expect(result.width).toBeLessThanOrEqual(400);
      expect(result.height).toBeLessThanOrEqual(400);
      expect(result.originalWidth).toBe(2000);
      expect(result.originalHeight).toBe(1000);
    });

    it('should maintain aspect ratio when downscaling', async () => {
      const testFile = await createTestImage('wide.png', 1600, 800);
      
      const result = await generatePreview(testFile, { maxSize: 400 });
      
      expect(result.width).toBe(400);
      expect(result.height).toBe(200);
    });

    it('should handle tall images', async () => {
      const testFile = await createTestImage('tall.png', 800, 1600);
      
      const result = await generatePreview(testFile, { maxSize: 400 });
      
      expect(result.width).toBe(200);
      expect(result.height).toBe(400);
    });

    it('should not upscale small images', async () => {
      const testFile = await createTestImage('small.png', 100, 80);
      
      const result = await generatePreview(testFile, { maxSize: 800 });
      
      expect(result.width).toBe(100);
      expect(result.height).toBe(80);
    });

    it('should generate PNG when format is png', async () => {
      const testFile = await createTestImage('test.png', 200, 100);
      
      const result = await generatePreview(testFile, { maxSize: 800, format: 'png' });
      
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should apply rotation transform', async () => {
      const testFile = await createTestImage('rotate.png', 200, 100);
      const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      
      const result = await generatePreview(testFile, { maxSize: 800, transform });
      
      // After 90° rotation, dimensions should swap
      expect(result.width).toBe(100);
      expect(result.height).toBe(200);
    });

    it('should apply 180° rotation', async () => {
      const testFile = await createTestImage('rotate180.png', 200, 100);
      const transform: Transform = { rotateSteps: 2, flipH: false, flipV: false };
      
      const result = await generatePreview(testFile, { maxSize: 800, transform });
      
      // 180° rotation maintains dimensions
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('should apply 270° rotation', async () => {
      const testFile = await createTestImage('rotate270.png', 200, 100);
      const transform: Transform = { rotateSteps: 3, flipH: false, flipV: false };
      
      const result = await generatePreview(testFile, { maxSize: 800, transform });
      
      // After 270° rotation, dimensions should swap
      expect(result.width).toBe(100);
      expect(result.height).toBe(200);
    });

    it('should handle combined rotation and resize', async () => {
      const testFile = await createTestImage('combo.png', 1000, 500);
      const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      
      const result = await generatePreview(testFile, { maxSize: 200, transform });
      
      // Original is 1000x500, rotated becomes 500x1000
      // Scaled to fit 200x200: 100x200
      expect(result.width).toBeLessThanOrEqual(200);
      expect(result.height).toBeLessThanOrEqual(200);
    });

    it('should apply horizontal flip (dimensions unchanged)', async () => {
      const testFile = await createTestImage('fliph.png', 200, 100);
      const transform: Transform = { rotateSteps: 0, flipH: true, flipV: false };
      
      const result = await generatePreview(testFile, { maxSize: 800, transform });
      
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('should apply vertical flip (dimensions unchanged)', async () => {
      const testFile = await createTestImage('flipv.png', 200, 100);
      const transform: Transform = { rotateSteps: 0, flipH: false, flipV: true };
      
      const result = await generatePreview(testFile, { maxSize: 800, transform });
      
      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('should reject invalid images', async () => {
      const invalidFile = path.join(tempDir, 'invalid.txt');
      await fs.writeFile(invalidFile, 'not an image');
      
      await expect(generatePreview(invalidFile)).rejects.toThrow();
    });

    it('should reject non-existent files', async () => {
      const missingFile = path.join(tempDir, 'missing.png');
      
      await expect(generatePreview(missingFile)).rejects.toThrow();
    });
  });

  describe('generatePreviewFromBuffer', () => {
    it('should generate a preview from a buffer', async () => {
      const buffer = await sharp({
        create: { width: 200, height: 100, channels: 3, background: { r: 100, g: 150, b: 200 } },
      })
        .png()
        .toBuffer();
      
      const result = await generatePreviewFromBuffer(buffer, { maxSize: 800 });
      
      expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(result.originalWidth).toBe(200);
      expect(result.originalHeight).toBe(100);
    });

    it('should downscale large buffer images', async () => {
      const buffer = await sharp({
        create: { width: 1000, height: 500, channels: 3, background: { r: 100, g: 150, b: 200 } },
      })
        .png()
        .toBuffer();
      
      const result = await generatePreviewFromBuffer(buffer, { maxSize: 200 });
      
      expect(result.width).toBeLessThanOrEqual(200);
      expect(result.height).toBeLessThanOrEqual(200);
    });

    it('should apply transform to buffer preview', async () => {
      const buffer = await sharp({
        create: { width: 200, height: 100, channels: 3, background: { r: 100, g: 150, b: 200 } },
      })
        .png()
        .toBuffer();
      
      const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      const result = await generatePreviewFromBuffer(buffer, { maxSize: 800, transform });
      
      // Dimensions should be swapped after 90° rotation
      expect(result.width).toBe(100);
      expect(result.height).toBe(200);
    });
  });

  describe('generateDetailPreview', () => {
    it('should extract a region at 1:1 from a file', async () => {
      const testFile = await createTestImage('test.png', 400, 300);
      
      const result = await generateDetailPreview(testFile, {
        region: { left: 100, top: 50, width: 200, height: 150 },
      });
      
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(result.width).toBe(200);
      expect(result.height).toBe(150);
    });

    it('should not scale the region (1:1 extraction)', async () => {
      const testFile = await createTestImage('large.png', 1000, 800);
      
      const result = await generateDetailPreview(testFile, {
        region: { left: 200, top: 200, width: 100, height: 100 },
      });
      
      // Should be exactly 100x100, not scaled
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should clamp region to valid bounds', async () => {
      const testFile = await createTestImage('small.png', 100, 100);
      
      // Try to extract beyond image bounds
      const result = await generateDetailPreview(testFile, {
        region: { left: 80, top: 80, width: 100, height: 100 },
      });
      
      // Should be clamped to available pixels
      expect(result.width).toBeLessThanOrEqual(20);
      expect(result.height).toBeLessThanOrEqual(20);
    });

    it('should handle region at image origin', async () => {
      const testFile = await createTestImage('test.png', 200, 150);
      
      const result = await generateDetailPreview(testFile, {
        region: { left: 0, top: 0, width: 100, height: 75 },
      });
      
      expect(result.width).toBe(100);
      expect(result.height).toBe(75);
    });

    it('should apply transform before extracting region', async () => {
      const testFile = await createTestImage('wide.png', 400, 200);
      
      const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      const result = await generateDetailPreview(testFile, {
        region: { left: 0, top: 0, width: 100, height: 100 },
        transform,
      });
      
      // After 90° rotation, source is 200x400
      // Region should work in transformed coordinate space
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should throw for invalid image', async () => {
      const invalidPath = path.join(tempDir, 'nonexistent.png');
      
      await expect(generateDetailPreview(invalidPath, {
        region: { left: 0, top: 0, width: 100, height: 100 },
      })).rejects.toThrow();
    });
  });

  describe('generateDetailPreviewFromBuffer', () => {
    it('should extract a region at 1:1 from a buffer', async () => {
      const buffer = await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 100, g: 150, b: 200 } },
      })
        .png()
        .toBuffer();
      
      const result = await generateDetailPreviewFromBuffer(buffer, {
        region: { left: 50, top: 50, width: 100, height: 100 },
      });
      
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should apply transform to buffer before extraction', async () => {
      const buffer = await sharp({
        create: { width: 200, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();
      
      const transform: Transform = { rotateSteps: 1, flipH: false, flipV: false };
      const result = await generateDetailPreviewFromBuffer(buffer, {
        region: { left: 0, top: 0, width: 50, height: 50 },
        transform,
      });
      
      // After 90° rotation, source is 100x200
      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    });

    it('should clamp region to buffer bounds', async () => {
      const buffer = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
      })
        .png()
        .toBuffer();
      
      const result = await generateDetailPreviewFromBuffer(buffer, {
        region: { left: 40, top: 40, width: 100, height: 100 },
      });
      
      // Should be clamped
      expect(result.width).toBeLessThanOrEqual(10);
      expect(result.height).toBeLessThanOrEqual(10);
    });
  });
});
