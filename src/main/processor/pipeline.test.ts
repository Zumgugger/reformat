/**
 * Integration tests for image processing pipeline.
 * Uses sharp to generate test images.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import sharp from 'sharp';
import {
  processImage,
  calculateTargetDimensions,
  getSharpFormat,
  getOutputExtension,
  normalizeSourceFormat,
  formatSupportsQuality,
  type ProcessOptions,
} from './pipeline';
import type { ResizeSettings, QualitySettings } from '../../shared/types';
import { DEFAULT_QUALITY } from '../../shared/types';

describe('pipeline', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reformat-pipeline-test-'));
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function createTestImage(
    filename: string,
    width: number,
    height: number,
    format: 'jpeg' | 'png' | 'webp' = 'jpeg',
    options?: { alpha?: boolean }
  ): Promise<string> {
    const filePath = path.join(tempDir, filename);
    
    let image = sharp({
      create: {
        width,
        height,
        channels: options?.alpha ? 4 : 3,
        background: options?.alpha
          ? { r: 100, g: 200, b: 100, alpha: 0.5 }
          : { r: 100, g: 200, b: 100 },
      },
    });

    if (format === 'jpeg') {
      image = image.jpeg({ quality: 90 });
    } else if (format === 'png') {
      image = image.png();
    } else if (format === 'webp') {
      image = image.webp({ quality: 90 });
    }

    await image.toFile(filePath);
    return filePath;
  }

  describe('calculateTargetDimensions', () => {
    it('should handle percent resize', () => {
      const resize: ResizeSettings = { mode: 'percent', percent: 50 };
      const result = calculateTargetDimensions(1000, 800, resize);
      expect(result.width).toBe(500);
      expect(result.height).toBe(400);
    });

    it('should handle pixels resize with width driving', () => {
      const resize: ResizeSettings = {
        mode: 'pixels',
        keepRatio: true,
        driving: 'width',
        width: 500,
      };
      const result = calculateTargetDimensions(1000, 800, resize);
      expect(result.width).toBe(500);
      expect(result.height).toBeUndefined();
    });

    it('should handle pixels resize with height driving', () => {
      const resize: ResizeSettings = {
        mode: 'pixels',
        keepRatio: true,
        driving: 'height',
        height: 400,
      };
      const result = calculateTargetDimensions(1000, 800, resize);
      expect(result.width).toBeUndefined();
      expect(result.height).toBe(400);
    });

    it('should handle pixels resize with maxSide (landscape)', () => {
      const resize: ResizeSettings = {
        mode: 'pixels',
        keepRatio: true,
        driving: 'maxSide',
        maxSide: 600,
      };
      const result = calculateTargetDimensions(1000, 800, resize);
      expect(result.width).toBe(600);
      expect(result.height).toBeUndefined();
    });

    it('should handle pixels resize with maxSide (portrait)', () => {
      const resize: ResizeSettings = {
        mode: 'pixels',
        keepRatio: true,
        driving: 'maxSide',
        maxSide: 600,
      };
      const result = calculateTargetDimensions(800, 1000, resize);
      expect(result.width).toBeUndefined();
      expect(result.height).toBe(600);
    });

    it('should handle exact dimensions (no keep ratio)', () => {
      const resize: ResizeSettings = {
        mode: 'pixels',
        keepRatio: false,
        driving: 'width',
        width: 500,
        height: 300,
      };
      const result = calculateTargetDimensions(1000, 800, resize);
      expect(result.width).toBe(500);
      expect(result.height).toBe(300);
    });

    it('should handle targetMiB mode (no resize currently)', () => {
      const resize: ResizeSettings = { mode: 'targetMiB', targetMiB: 1 };
      const result = calculateTargetDimensions(1000, 800, resize);
      expect(result.width).toBeUndefined();
      expect(result.height).toBeUndefined();
    });
  });

  describe('getSharpFormat', () => {
    it('should map jpg to jpeg', () => {
      expect(getSharpFormat('jpg')).toBe('jpeg');
    });

    it('should map png to png', () => {
      expect(getSharpFormat('png')).toBe('png');
    });

    it('should map webp to webp', () => {
      expect(getSharpFormat('webp')).toBe('webp');
    });

    it('should map tiff to tiff', () => {
      expect(getSharpFormat('tiff')).toBe('tiff');
    });

    it('should map heic to heif', () => {
      expect(getSharpFormat('heic')).toBe('heif');
    });

    it('should use source format for same', () => {
      expect(getSharpFormat('same', 'jpeg')).toBe('jpeg');
      expect(getSharpFormat('same', 'png')).toBe('png');
    });
  });

  describe('normalizeSourceFormat', () => {
    it('should normalize jpeg variants', () => {
      expect(normalizeSourceFormat('jpeg')).toBe('jpeg');
      expect(normalizeSourceFormat('jpg')).toBe('jpeg');
      expect(normalizeSourceFormat('JPEG')).toBe('jpeg');
    });

    it('should normalize gif to png', () => {
      expect(normalizeSourceFormat('gif')).toBe('png');
    });

    it('should normalize bmp to png', () => {
      expect(normalizeSourceFormat('bmp')).toBe('png');
    });

    it('should return null for unknown formats', () => {
      expect(normalizeSourceFormat('xyz')).toBeNull();
      expect(normalizeSourceFormat(undefined)).toBeNull();
    });
  });

  describe('getOutputExtension', () => {
    it('should return correct extensions', () => {
      expect(getOutputExtension('jpg')).toBe('.jpg');
      expect(getOutputExtension('png')).toBe('.png');
      expect(getOutputExtension('webp')).toBe('.webp');
      expect(getOutputExtension('tiff')).toBe('.tiff');
      expect(getOutputExtension('heic')).toBe('.heic');
      expect(getOutputExtension('bmp')).toBe('.bmp');
    });

    it('should use source format for same', () => {
      expect(getOutputExtension('same', 'jpeg')).toBe('.jpg');
      expect(getOutputExtension('same', 'png')).toBe('.png');
    });
  });

  describe('formatSupportsQuality', () => {
    it('should return true for formats with quality', () => {
      expect(formatSupportsQuality('jpg')).toBe(true);
      expect(formatSupportsQuality('jpeg')).toBe(true);
      expect(formatSupportsQuality('webp')).toBe(true);
      expect(formatSupportsQuality('heic')).toBe(true);
      expect(formatSupportsQuality('heif')).toBe(true);
    });

    it('should return false for formats without quality', () => {
      expect(formatSupportsQuality('png')).toBe(false);
      expect(formatSupportsQuality('tiff')).toBe(false);
      expect(formatSupportsQuality('bmp')).toBe(false);
    });
  });

  describe('processImage', () => {
    it('should process a JPEG image successfully', async () => {
      const sourcePath = await createTestImage('test.jpg', 800, 600, 'jpeg');
      const outputPath = path.join(tempDir, 'output.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'pixels', keepRatio: true, driving: 'maxSide', maxSide: 400 },
        quality: DEFAULT_QUALITY,
      });

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(outputPath);
      expect(result.outputBytes).toBeGreaterThan(0);
      expect(result.outputWidth).toBe(400);

      // Verify file exists
      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should convert PNG to JPEG', async () => {
      const sourcePath = await createTestImage('test.png', 500, 500, 'png');
      const outputPath = path.join(tempDir, 'converted.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
      });

      expect(result.success).toBe(true);
      
      // Verify output is JPEG
      const metadata = await sharp(outputPath).metadata();
      expect(metadata.format).toBe('jpeg');
    });

    it('should convert JPEG to PNG', async () => {
      const sourcePath = await createTestImage('test2.jpg', 400, 300, 'jpeg');
      const outputPath = path.join(tempDir, 'converted.png');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'png',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
      });

      expect(result.success).toBe(true);
      
      // Verify output is PNG
      const metadata = await sharp(outputPath).metadata();
      expect(metadata.format).toBe('png');
    });

    it('should resize by percent', async () => {
      const sourcePath = await createTestImage('resize-percent.jpg', 1000, 800, 'jpeg');
      const outputPath = path.join(tempDir, 'resized-percent.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 50 },
        quality: DEFAULT_QUALITY,
        sourceWidth: 1000,
        sourceHeight: 800,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(500);
      expect(result.outputHeight).toBe(400);
    });

    it('should resize with maxSide', async () => {
      const sourcePath = await createTestImage('resize-maxside.jpg', 1920, 1080, 'jpeg');
      const outputPath = path.join(tempDir, 'resized-maxside.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'pixels', keepRatio: true, driving: 'maxSide', maxSide: 960 },
        quality: DEFAULT_QUALITY,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(960);
      // Height should be proportionally scaled (960 * 1080/1920 = 540)
      expect(result.outputHeight).toBe(540);
    });

    it('should keep same format', async () => {
      const sourcePath = await createTestImage('same-format.png', 300, 300, 'png');
      const outputPath = path.join(tempDir, 'same-output.png');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'same',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        sourceFormat: 'png',
      });

      expect(result.success).toBe(true);
      
      const metadata = await sharp(outputPath).metadata();
      expect(metadata.format).toBe('png');
    });

    it('should apply quality setting to JPEG', async () => {
      // Create a larger image with noise/variation to see quality differences
      const width = 800;
      const height = 600;
      const channels = 3 as const;
      
      // Create image with gradient/noise to show quality differences
      const pixels = Buffer.alloc(width * height * channels);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * channels;
          pixels[idx] = (x * 255 / width) | 0;     // R gradient
          pixels[idx + 1] = (y * 255 / height) | 0; // G gradient
          pixels[idx + 2] = ((x + y) % 256);       // B pattern
        }
      }
      
      const sourcePath = path.join(tempDir, 'quality-gradient.jpg');
      await sharp(pixels, { raw: { width, height, channels } })
        .jpeg({ quality: 100 })
        .toFile(sourcePath);
      
      const outputPathHigh = path.join(tempDir, 'quality-high.jpg');
      const outputPathLow = path.join(tempDir, 'quality-low.jpg');

      const highQuality: QualitySettings = { jpg: 95, webp: 95, heic: 95 };
      const lowQuality: QualitySettings = { jpg: 40, webp: 40, heic: 40 };

      const resultHigh = await processImage({
        sourcePath,
        outputPath: outputPathHigh,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: highQuality,
      });

      const resultLow = await processImage({
        sourcePath,
        outputPath: outputPathLow,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: lowQuality,
      });

      expect(resultHigh.success).toBe(true);
      expect(resultLow.success).toBe(true);
      
      // Lower quality should produce smaller file (or at most equal for small files)
      expect(resultLow.outputBytes!).toBeLessThanOrEqual(resultHigh.outputBytes!);
    });

    it('should handle transform rotation', async () => {
      const sourcePath = await createTestImage('rotate-test.jpg', 400, 200, 'jpeg');
      const outputPath = path.join(tempDir, 'rotated.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        transform: { rotateSteps: 1, flipH: false, flipV: false },
        sourceWidth: 400,
        sourceHeight: 200,
      });

      expect(result.success).toBe(true);
      // After 90-degree rotation, dimensions should swap
      expect(result.outputWidth).toBe(200);
      expect(result.outputHeight).toBe(400);
    });

    it('should handle missing source file', async () => {
      const outputPath = path.join(tempDir, 'missing-output.jpg');

      const result = await processImage({
        sourcePath: '/nonexistent/path/image.jpg',
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should convert to WebP', async () => {
      const sourcePath = await createTestImage('webp-source.jpg', 300, 300, 'jpeg');
      const outputPath = path.join(tempDir, 'output.webp');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'webp',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
      });

      expect(result.success).toBe(true);
      
      const metadata = await sharp(outputPath).metadata();
      expect(metadata.format).toBe('webp');
    });

    it('should not upscale images', async () => {
      const sourcePath = await createTestImage('small.jpg', 200, 200, 'jpeg');
      const outputPath = path.join(tempDir, 'no-upscale.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'pixels', keepRatio: true, driving: 'maxSide', maxSide: 800 },
        quality: DEFAULT_QUALITY,
        sourceWidth: 200,
        sourceHeight: 200,
      });

      expect(result.success).toBe(true);
      // Should remain at original size
      expect(result.outputWidth).toBe(200);
      expect(result.outputHeight).toBe(200);
    });
  });
});
