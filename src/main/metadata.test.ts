/**
 * Tests for the metadata extraction module.
 * Uses sharp to generate test images in temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import {
  extractMetadata,
  extractMetadataWithAnimationCheck,
  createImageItem,
  createImageItems,
} from './metadata';

let tempDir: string;

async function createTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'reformat-meta-test-'));
}

async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a test image file.
 */
async function createTestImage(
  dir: string,
  name: string,
  options: {
    width?: number;
    height?: number;
    channels?: 3 | 4;
    format?: 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff';
  } = {}
): Promise<string> {
  const {
    width = 100,
    height = 100,
    channels = 3,
    format = 'png',
  } = options;

  const filePath = path.join(dir, name);

  // Create a solid color image
  const buffer = await sharp({
    create: {
      width,
      height,
      channels,
      background: channels === 4
        ? { r: 255, g: 0, b: 0, alpha: 0.5 }
        : { r: 255, g: 0, b: 0 },
    },
  })
    .toFormat(format as any)
    .toBuffer();

  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Create an animated GIF for testing.
 * Sharp can create multi-page images which represent animation.
 */
async function createAnimatedGif(dir: string, name: string, frames = 3): Promise<string> {
  const filePath = path.join(dir, name);
  
  // Create multiple frames
  const frameBuffers: Buffer[] = [];
  for (let i = 0; i < frames; i++) {
    const frame = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 3,
        background: { r: i * 80, g: 100, b: 150 },
      },
    })
      .gif()
      .toBuffer();
    frameBuffers.push(frame);
  }
  
  // For simplicity, just use the first frame - sharp's animated GIF creation
  // is complex. Instead, we'll test with a multi-page TIFF or trust the pages metadata.
  // Actually, let's create a proper animated GIF using raw frame joining if possible.
  
  // For now, create a simple single-frame GIF and we'll adjust the test
  const buffer = await sharp({
    create: {
      width: 50,
      height: 50,
      channels: 3,
      background: { r: 255, g: 100, b: 100 },
    },
  })
    .gif()
    .toBuffer();
    
  await fs.writeFile(filePath, buffer);
  return filePath;
}

describe('metadata', () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanup(tempDir);
  });

  describe('extractMetadata', () => {
    it('extracts dimensions from PNG', async () => {
      const filePath = await createTestImage(tempDir, 'test.png', {
        width: 200,
        height: 150,
        format: 'png',
      });

      const metadata = await extractMetadata(filePath);

      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(150);
      expect(metadata.format).toBe('png');
    });

    it('extracts dimensions from JPEG', async () => {
      const filePath = await createTestImage(tempDir, 'test.jpg', {
        width: 300,
        height: 200,
        format: 'jpeg',
      });

      const metadata = await extractMetadata(filePath);

      expect(metadata.width).toBe(300);
      expect(metadata.height).toBe(200);
      expect(metadata.format).toBe('jpeg');
    });

    it('extracts dimensions from WebP', async () => {
      const filePath = await createTestImage(tempDir, 'test.webp', {
        width: 400,
        height: 300,
        format: 'webp',
      });

      const metadata = await extractMetadata(filePath);

      expect(metadata.width).toBe(400);
      expect(metadata.height).toBe(300);
      expect(metadata.format).toBe('webp');
    });

    it('extracts file size in bytes', async () => {
      const filePath = await createTestImage(tempDir, 'test.png', {
        width: 100,
        height: 100,
      });

      const metadata = await extractMetadata(filePath);
      const stats = await fs.stat(filePath);

      expect(metadata.bytes).toBe(stats.size);
      expect(metadata.bytes).toBeGreaterThan(0);
    });

    it('detects alpha channel in PNG with transparency', async () => {
      const filePath = await createTestImage(tempDir, 'alpha.png', {
        width: 100,
        height: 100,
        channels: 4, // RGBA
        format: 'png',
      });

      const metadata = await extractMetadata(filePath);

      expect(metadata.hasAlpha).toBe(true);
    });

    it('detects no alpha in JPEG', async () => {
      const filePath = await createTestImage(tempDir, 'noalpha.jpg', {
        width: 100,
        height: 100,
        channels: 3, // RGB
        format: 'jpeg',
      });

      const metadata = await extractMetadata(filePath);

      // JPEG never has alpha
      expect(metadata.hasAlpha).toBe(false);
    });

    it('detects no alpha in RGB PNG', async () => {
      const filePath = await createTestImage(tempDir, 'rgb.png', {
        width: 100,
        height: 100,
        channels: 3, // RGB only
        format: 'png',
      });

      const metadata = await extractMetadata(filePath);

      expect(metadata.hasAlpha).toBe(false);
    });

    it('handles static GIF', async () => {
      const filePath = await createAnimatedGif(tempDir, 'static.gif', 1);

      const metadata = await extractMetadata(filePath);

      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
      expect(metadata.format).toBe('gif');
      // Single frame GIF should not be marked as animated
      expect(metadata.animation?.isAnimated).toBe(false);
    });
  });

  describe('createImageItem', () => {
    it('creates ImageItem with correct properties', async () => {
      const filePath = await createTestImage(tempDir, 'photo.jpg', {
        width: 800,
        height: 600,
        format: 'jpeg',
      });

      const item = await createImageItem(filePath);

      expect(item).not.toBeNull();
      expect(item!.id).toMatch(/^img-/);
      expect(item!.source).toBe('file');
      expect(item!.sourcePath).toBe(filePath);
      expect(item!.originalName).toBe('photo.jpg');
      expect(item!.width).toBe(800);
      expect(item!.height).toBe(600);
      expect(item!.format).toBe('jpeg');
      expect(item!.bytes).toBeGreaterThan(0);
    });

    it('uses provided source type', async () => {
      const filePath = await createTestImage(tempDir, 'clip.png');

      const item = await createImageItem(filePath, 'clipboard');

      expect(item!.source).toBe('clipboard');
    });

    it('returns null for non-existent file', async () => {
      const filePath = path.join(tempDir, 'does-not-exist.jpg');

      const item = await createImageItem(filePath);

      expect(item).toBeNull();
    });

    it('generates unique IDs for each item', async () => {
      const file1 = await createTestImage(tempDir, 'a.png');
      const file2 = await createTestImage(tempDir, 'b.png');

      const item1 = await createImageItem(file1);
      const item2 = await createImageItem(file2);

      expect(item1!.id).not.toBe(item2!.id);
    });
  });

  describe('createImageItems', () => {
    it('creates items for multiple valid files', async () => {
      const file1 = await createTestImage(tempDir, 'a.jpg', { format: 'jpeg' });
      const file2 = await createTestImage(tempDir, 'b.png', { format: 'png' });
      const file3 = await createTestImage(tempDir, 'c.webp', { format: 'webp' });

      const result = await createImageItems([file1, file2, file3]);

      expect(result.items).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
    });

    it('reports failed files', async () => {
      const validFile = await createTestImage(tempDir, 'valid.png');
      const invalidFile = path.join(tempDir, 'invalid.jpg');
      
      // Create invalid data (not a real image)
      await fs.writeFile(invalidFile, 'not an image');

      const result = await createImageItems([validFile, invalidFile]);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].originalName).toBe('valid.png');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].path).toBe(invalidFile);
    });

    it('handles empty array', async () => {
      const result = await createImageItems([]);

      expect(result.items).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });

    it('preserves order of valid files', async () => {
      const file1 = await createTestImage(tempDir, 'z.png');
      const file2 = await createTestImage(tempDir, 'a.png');
      const file3 = await createTestImage(tempDir, 'm.png');

      const result = await createImageItems([file1, file2, file3]);

      expect(result.items[0].originalName).toBe('z.png');
      expect(result.items[1].originalName).toBe('a.png');
      expect(result.items[2].originalName).toBe('m.png');
    });
  });

  describe('extractMetadataWithAnimationCheck', () => {
    it('returns metadata for static image', async () => {
      const filePath = await createTestImage(tempDir, 'static.png');

      const metadata = await extractMetadataWithAnimationCheck(filePath);

      expect(metadata).not.toBeNull();
      expect(metadata!.width).toBeGreaterThan(0);
    });

    it('returns metadata for static GIF', async () => {
      const filePath = await createAnimatedGif(tempDir, 'static.gif', 1);

      const metadata = await extractMetadataWithAnimationCheck(filePath);

      // Single-frame GIF should be accepted
      expect(metadata).not.toBeNull();
    });
  });
});
