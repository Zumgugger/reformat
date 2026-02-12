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

    it('should apply crop to center of image', async () => {
      // Create a 400x400 image
      const sourcePath = await createTestImage('crop-center.jpg', 400, 400, 'jpeg');
      const outputPath = path.join(tempDir, 'cropped-center.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        crop: {
          active: true,
          ratioPreset: 'free',
          rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, // Center 200x200
        },
        sourceWidth: 400,
        sourceHeight: 400,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(200);
      expect(result.outputHeight).toBe(200);
    });

    it('should apply crop with transform', async () => {
      // Create a 400x200 landscape image
      const sourcePath = await createTestImage('crop-transform.jpg', 400, 200, 'jpeg');
      const outputPath = path.join(tempDir, 'cropped-transformed.jpg');

      // Rotate 90° CW: original 400x200 becomes 200x400
      // Then crop top half: should get 200x200
      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        transform: { rotateSteps: 1, flipH: false, flipV: false },
        crop: {
          active: true,
          ratioPreset: 'free',
          rect: { x: 0, y: 0, width: 1, height: 0.5 }, // Top half
        },
        sourceWidth: 400,
        sourceHeight: 200,
      });

      expect(result.success).toBe(true);
      // After 90° rotation: 200x400, then crop top half: 200x200
      expect(result.outputWidth).toBe(200);
      expect(result.outputHeight).toBe(200);
    });

    it('should not crop when crop is inactive', async () => {
      const sourcePath = await createTestImage('no-crop.jpg', 300, 300, 'jpeg');
      const outputPath = path.join(tempDir, 'no-crop-output.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        crop: {
          active: false, // Inactive - should not crop
          ratioPreset: '1:1',
          rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        },
        sourceWidth: 300,
        sourceHeight: 300,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(300);
      expect(result.outputHeight).toBe(300);
    });

    it('should not crop when crop rect is full image', async () => {
      const sourcePath = await createTestImage('full-crop.jpg', 300, 300, 'jpeg');
      const outputPath = path.join(tempDir, 'full-crop-output.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        crop: {
          active: true,
          ratioPreset: 'original',
          rect: { x: 0, y: 0, width: 1, height: 1 }, // Full image
        },
        sourceWidth: 300,
        sourceHeight: 300,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(300);
      expect(result.outputHeight).toBe(300);
    });

    it('should apply crop then resize', async () => {
      // Create 400x400, crop to 200x200 center, then resize to 100x100
      const sourcePath = await createTestImage('crop-resize.jpg', 400, 400, 'jpeg');
      const outputPath = path.join(tempDir, 'crop-resize-output.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'pixels', keepRatio: true, driving: 'maxSide', maxSide: 100 },
        quality: DEFAULT_QUALITY,
        crop: {
          active: true,
          ratioPreset: '1:1',
          rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        },
        sourceWidth: 400,
        sourceHeight: 400,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(100);
      expect(result.outputHeight).toBe(100);
    });
  });

  describe('crop with quadrant colors', () => {
    // Creates a 4-quadrant image for validating crop regions
    async function createQuadrantImage(filename: string): Promise<string> {
      const filePath = path.join(tempDir, filename);
      const size = 100;
      
      // Create four 50x50 quadrant images with different colors
      const topLeft = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).raw().toBuffer();
      
      const topRight = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
      }).raw().toBuffer();
      
      const bottomLeft = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } },
      }).raw().toBuffer();
      
      const bottomRight = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 255, b: 0 } },
      }).raw().toBuffer();

      // Compose the quadrants into a single image
      const composite = await sharp({
        create: { width: size, height: size, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .composite([
          { input: topLeft, raw: { width: 50, height: 50, channels: 3 }, left: 0, top: 0 },
          { input: topRight, raw: { width: 50, height: 50, channels: 3 }, left: 50, top: 0 },
          { input: bottomLeft, raw: { width: 50, height: 50, channels: 3 }, left: 0, top: 50 },
          { input: bottomRight, raw: { width: 50, height: 50, channels: 3 }, left: 50, top: 50 },
        ])
        .png()
        .toFile(filePath);

      return filePath;
    }

    // Helper to get the dominant color of an image
    async function getDominantColor(imagePath: string): Promise<{ r: number; g: number; b: number }> {
      const stats = await sharp(imagePath).stats();
      // Get mean color from stats
      return {
        r: Math.round(stats.channels[0].mean),
        g: Math.round(stats.channels[1].mean),
        b: Math.round(stats.channels[2].mean),
      };
    }

    it('should crop top-left quadrant (red)', async () => {
      const sourcePath = await createQuadrantImage('quadrant-tl.png');
      const outputPath = path.join(tempDir, 'quadrant-tl-cropped.png');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'png',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        crop: {
          active: true,
          ratioPreset: '1:1',
          rect: { x: 0, y: 0, width: 0.5, height: 0.5 }, // Top-left quadrant
        },
        sourceWidth: 100,
        sourceHeight: 100,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(50);
      expect(result.outputHeight).toBe(50);

      const color = await getDominantColor(outputPath);
      // Should be mostly red
      expect(color.r).toBeGreaterThan(200);
      expect(color.g).toBeLessThan(50);
      expect(color.b).toBeLessThan(50);
    });

    it('should crop bottom-right quadrant (yellow)', async () => {
      const sourcePath = await createQuadrantImage('quadrant-br.png');
      const outputPath = path.join(tempDir, 'quadrant-br-cropped.png');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'png',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        crop: {
          active: true,
          ratioPreset: '1:1',
          rect: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }, // Bottom-right quadrant
        },
        sourceWidth: 100,
        sourceHeight: 100,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(50);
      expect(result.outputHeight).toBe(50);

      const color = await getDominantColor(outputPath);
      // Should be mostly yellow (red + green)
      expect(color.r).toBeGreaterThan(200);
      expect(color.g).toBeGreaterThan(200);
      expect(color.b).toBeLessThan(50);
    });

    it('should crop top-right after 90° rotation (becomes top-left of rotated view)', async () => {
      // Original: TL=red, TR=green, BL=blue, BR=yellow
      // After 90° CW: TL=blue, TR=red, BL=yellow, BR=green
      const sourcePath = await createQuadrantImage('quadrant-rotated.png');
      const outputPath = path.join(tempDir, 'quadrant-rotated-cropped.png');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'png',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        transform: { rotateSteps: 1, flipH: false, flipV: false },
        crop: {
          active: true,
          ratioPreset: '1:1',
          rect: { x: 0, y: 0, width: 0.5, height: 0.5 }, // Top-left of rotated view
        },
        sourceWidth: 100,
        sourceHeight: 100,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(50);
      expect(result.outputHeight).toBe(50);

      const color = await getDominantColor(outputPath);
      // After 90° CW rotation, the original bottom-left (blue) becomes top-left
      expect(color.r).toBeLessThan(50);
      expect(color.g).toBeLessThan(50);
      expect(color.b).toBeGreaterThan(200);
    });

    it('should crop center region (mix of all colors)', async () => {
      const sourcePath = await createQuadrantImage('quadrant-center.png');
      const outputPath = path.join(tempDir, 'quadrant-center-cropped.png');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'png',
        resize: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        crop: {
          active: true,
          ratioPreset: '1:1',
          rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, // Center region
        },
        sourceWidth: 100,
        sourceHeight: 100,
      });

      expect(result.success).toBe(true);
      expect(result.outputWidth).toBe(50);
      expect(result.outputHeight).toBe(50);

      const color = await getDominantColor(outputPath);
      // Center should be a mix of all colors (grayish/brownish)
      // All channels should have some contribution
      expect(color.r).toBeGreaterThan(50);
      expect(color.g).toBeGreaterThan(50);
      expect(color.b).toBeGreaterThan(50);
    });
  });

  describe('targetMiB resize mode', () => {
    it('should resize to achieve target MiB within tolerance', async () => {
      // Create a noisy image that won't compress well
      const sourcePath = path.join(tempDir, 'large-for-target.jpg');
      const width = 2000;
      const height = 1500;
      
      // Create a buffer with random noise to prevent excessive compression
      const channels = 3;
      const rawPixels = Buffer.alloc(width * height * channels);
      for (let i = 0; i < rawPixels.length; i++) {
        rawPixels[i] = Math.floor(Math.random() * 256);
      }
      
      await sharp(rawPixels, {
        raw: {
          width,
          height,
          channels,
        },
      })
        .jpeg({ quality: 95 })
        .toFile(sourcePath);

      const outputPath = path.join(tempDir, 'target-mib-output.jpg');
      const targetMiB = 0.25; // 250 KiB - reasonable target for noisy image

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'targetMiB', targetMiB },
        quality: DEFAULT_QUALITY,
        sourceWidth: width,
        sourceHeight: height,
      });

      expect(result.success).toBe(true);
      expect(result.outputBytes).toBeDefined();

      // Check that output is within ±10% of target
      const targetBytes = targetMiB * 1024 * 1024;
      const lowerBound = targetBytes * 0.9;
      const upperBound = targetBytes * 1.1;
      
      expect(result.outputBytes!).toBeGreaterThanOrEqual(lowerBound);
      expect(result.outputBytes!).toBeLessThanOrEqual(upperBound);

      // Check that dimensions were reduced
      expect(result.outputWidth!).toBeLessThan(width);
      expect(result.outputHeight!).toBeLessThan(height);
    }, 30000); // Increase timeout for iterative encoding

    it('should not upscale if original is smaller than target', async () => {
      // Create a small image
      const sourcePath = path.join(tempDir, 'small-for-target.jpg');
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 100, g: 100, b: 100 },
        },
      })
        .jpeg({ quality: 85 })
        .toFile(sourcePath);

      const outputPath = path.join(tempDir, 'target-mib-small-output.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'targetMiB', targetMiB: 10 }, // Much larger than possible
        quality: DEFAULT_QUALITY,
        sourceWidth: 100,
        sourceHeight: 100,
      });

      expect(result.success).toBe(true);
      // Should not upscale - dimensions should be unchanged
      expect(result.outputWidth).toBe(100);
      expect(result.outputHeight).toBe(100);
      // Should have a warning about being smaller than target
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('smaller than target');
    });

    it('should work with WebP format', async () => {
      const sourcePath = path.join(tempDir, 'webp-target.jpg');
      await sharp({
        create: {
          width: 2000,
          height: 1500,
          channels: 3,
          background: { r: 50, g: 100, b: 150 },
        },
      })
        .jpeg({ quality: 90 })
        .toFile(sourcePath);

      const outputPath = path.join(tempDir, 'target-mib-webp-output.webp');
      const targetMiB = 0.2;

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'webp',
        resize: { mode: 'targetMiB', targetMiB },
        quality: DEFAULT_QUALITY,
        sourceWidth: 2000,
        sourceHeight: 1500,
      });

      expect(result.success).toBe(true);
      
      // Verify it's actually a WebP file
      const metadata = await sharp(outputPath).metadata();
      expect(metadata.format).toBe('webp');
    });

    it('should respect transform when calculating target size', async () => {
      const sourcePath = path.join(tempDir, 'transform-target.jpg');
      await sharp({
        create: {
          width: 2000,
          height: 1000, // Landscape
          channels: 3,
          background: { r: 100, g: 150, b: 200 },
        },
      })
        .jpeg({ quality: 90 })
        .toFile(sourcePath);

      const outputPath = path.join(tempDir, 'target-mib-rotated-output.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'targetMiB', targetMiB: 0.15 },
        quality: DEFAULT_QUALITY,
        transform: { rotateSteps: 1, flipH: false, flipV: false }, // 90° rotation
        sourceWidth: 2000,
        sourceHeight: 1000,
      });

      expect(result.success).toBe(true);
      // After 90° rotation, should be portrait (height > width)
      expect(result.outputHeight!).toBeGreaterThan(result.outputWidth!);
    });

    it('should respect crop when calculating target size', async () => {
      const sourcePath = path.join(tempDir, 'crop-target.jpg');
      await sharp({
        create: {
          width: 2000,
          height: 2000,
          channels: 3,
          background: { r: 200, g: 100, b: 50 },
        },
      })
        .jpeg({ quality: 90 })
        .toFile(sourcePath);

      const outputPath = path.join(tempDir, 'target-mib-cropped-output.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'targetMiB', targetMiB: 0.1 },
        quality: DEFAULT_QUALITY,
        crop: {
          active: true,
          ratioPreset: '16:9',
          rect: { x: 0, y: 0.25, width: 1, height: 0.5 }, // Horizontal strip
        },
        sourceWidth: 2000,
        sourceHeight: 2000,
      });

      expect(result.success).toBe(true);
      // Should maintain 16:9-ish aspect ratio
      const ratio = result.outputWidth! / result.outputHeight!;
      expect(ratio).toBeGreaterThan(1.5); // Wider than tall
    });

    it('should warn when target is unreachable at minimum dimensions', async () => {
      const sourcePath = path.join(tempDir, 'unreachable-target.jpg');
      await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .jpeg({ quality: 90 })
        .toFile(sourcePath);

      const outputPath = path.join(tempDir, 'target-mib-unreachable-output.jpg');

      const result = await processImage({
        sourcePath,
        outputPath,
        outputFormat: 'jpg',
        resize: { mode: 'targetMiB', targetMiB: 0.0001 }, // Impossibly small
        quality: DEFAULT_QUALITY,
        sourceWidth: 500,
        sourceHeight: 500,
      });

      expect(result.success).toBe(true); // Still writes a file
      expect(result.warnings.length).toBeGreaterThan(0);
      // Should have hit minimum dimension
      expect(result.outputWidth).toBeLessThanOrEqual(100);
      expect(result.outputHeight).toBeLessThanOrEqual(100);
    });
  });
});
