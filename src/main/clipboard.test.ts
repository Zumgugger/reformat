/**
 * Tests for clipboard import functionality.
 * Uses mocking since real clipboard access isn't available in CI.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NativeImage } from 'electron';
import sharp from 'sharp';
import {
  readClipboardImage,
  hasClipboardImage,
  createClipboardImageItem,
  pasteFromClipboard,
  storeClipboardBuffer,
  getClipboardBuffer,
  removeClipboardBuffer,
  clearClipboardBuffers,
  getClipboardBufferCount,
  generateClipboardItemId,
} from './clipboard';
import { getClipboardBasename } from '../shared/naming';

/** Create a mock NativeImage that is empty */
function createEmptyNativeImage(): NativeImage {
  return {
    isEmpty: () => true,
    toPNG: () => Buffer.from([]),
    toJPEG: () => Buffer.from([]),
    toBitmap: () => Buffer.from([]),
    toDataURL: () => '',
    getSize: () => ({ width: 0, height: 0 }),
    getAspectRatio: () => 0,
    getBitmap: () => Buffer.from([]),
    getNativeHandle: () => Buffer.from([]),
    isMacTemplateImage: false,
    isTemplateImage: false,
    crop: () => createEmptyNativeImage(),
    resize: () => createEmptyNativeImage(),
    addRepresentation: () => {},
  } as unknown as NativeImage;
}

/** Create a test PNG buffer using sharp */
async function createTestPngBuffer(
  width: number = 100,
  height: number = 100,
  hasAlpha: boolean = false
): Promise<Buffer> {
  const channels = hasAlpha ? 4 : 3;
  const data = Buffer.alloc(width * height * channels);
  
  // Fill with a gradient for visibility
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      data[idx] = Math.floor((x / width) * 255); // R
      data[idx + 1] = Math.floor((y / height) * 255); // G
      data[idx + 2] = 128; // B
      if (hasAlpha) {
        data[idx + 3] = 255; // A
      }
    }
  }

  return await sharp(data, {
    raw: { width, height, channels },
  }).png().toBuffer();
}

/** Create a mock NativeImage with actual image data */
function createMockNativeImage(pngBuffer: Buffer): NativeImage {
  return {
    isEmpty: () => false,
    toPNG: () => pngBuffer,
    toJPEG: () => Buffer.from([]),
    toBitmap: () => Buffer.from([]),
    toDataURL: () => '',
    getSize: () => ({ width: 100, height: 100 }),
    getAspectRatio: () => 1,
    getBitmap: () => Buffer.from([]),
    getNativeHandle: () => Buffer.from([]),
    isMacTemplateImage: false,
    isTemplateImage: false,
    crop: () => createMockNativeImage(pngBuffer),
    resize: () => createMockNativeImage(pngBuffer),
    addRepresentation: () => {},
  } as unknown as NativeImage;
}

describe('clipboard', () => {
  beforeEach(() => {
    clearClipboardBuffers();
  });

  afterEach(() => {
    clearClipboardBuffers();
  });

  describe('readClipboardImage', () => {
    it('should return null when clipboard is empty', () => {
      const result = readClipboardImage({
        readImage: () => createEmptyNativeImage(),
      });
      expect(result).toBeNull();
    });

    it('should return PNG buffer when clipboard has image', async () => {
      const testBuffer = await createTestPngBuffer(50, 50);
      const result = readClipboardImage({
        readImage: () => createMockNativeImage(testBuffer),
      });
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Buffer);
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should return null when toPNG returns empty buffer', () => {
      const emptyPngImage = {
        isEmpty: () => false,
        toPNG: () => Buffer.from([]),
      } as unknown as NativeImage;

      const result = readClipboardImage({
        readImage: () => emptyPngImage,
      });
      expect(result).toBeNull();
    });
  });

  describe('hasClipboardImage', () => {
    it('should return false when clipboard is empty', () => {
      const result = hasClipboardImage({
        readImage: () => createEmptyNativeImage(),
      });
      expect(result).toBe(false);
    });

    it('should return true when clipboard has image', async () => {
      const testBuffer = await createTestPngBuffer();
      const result = hasClipboardImage({
        readImage: () => createMockNativeImage(testBuffer),
      });
      expect(result).toBe(true);
    });
  });

  describe('createClipboardImageItem', () => {
    it('should create ImageItem with correct properties', async () => {
      const buffer = await createTestPngBuffer(200, 150);
      const item = await createClipboardImageItem(buffer);

      expect(item.id).toMatch(/^clipboard-/);
      expect(item.source).toBe('clipboard');
      expect(item.sourcePath).toBeUndefined();
      expect(item.originalName).toBe(getClipboardBasename());
      expect(item.width).toBe(200);
      expect(item.height).toBe(150);
      expect(item.format).toBe('png');
      expect(item.bytes).toBe(buffer.length);
    });

    it('should detect alpha channel', async () => {
      const bufferWithAlpha = await createTestPngBuffer(100, 100, true);
      const item = await createClipboardImageItem(bufferWithAlpha);
      expect(item.hasAlpha).toBe(true);
    });

    it('should detect no alpha channel', async () => {
      const bufferNoAlpha = await createTestPngBuffer(100, 100, false);
      const item = await createClipboardImageItem(bufferNoAlpha);
      expect(item.hasAlpha).toBe(false);
    });

    it('should generate unique IDs for each item', async () => {
      const buffer = await createTestPngBuffer();
      const item1 = await createClipboardImageItem(buffer);
      const item2 = await createClipboardImageItem(buffer);
      expect(item1.id).not.toBe(item2.id);
    });

    it('should throw for invalid image data', async () => {
      const invalidBuffer = Buffer.from('not an image');
      await expect(createClipboardImageItem(invalidBuffer)).rejects.toThrow();
    });
  });

  describe('pasteFromClipboard', () => {
    it('should return hasImage false when clipboard is empty', async () => {
      const result = await pasteFromClipboard({
        readImage: () => createEmptyNativeImage(),
      });
      expect(result.hasImage).toBe(false);
      expect(result.item).toBeUndefined();
      expect(result.buffer).toBeUndefined();
    });

    it('should return item and buffer when clipboard has image', async () => {
      const testBuffer = await createTestPngBuffer(120, 80);
      const result = await pasteFromClipboard({
        readImage: () => createMockNativeImage(testBuffer),
      });

      expect(result.hasImage).toBe(true);
      expect(result.item).toBeDefined();
      expect(result.item!.source).toBe('clipboard');
      expect(result.item!.width).toBe(120);
      expect(result.item!.height).toBe(80);
      expect(result.buffer).toBeDefined();
      expect(result.buffer!.length).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      const result = await pasteFromClipboard({
        readImage: () => {
          throw new Error('Clipboard access denied');
        },
      });
      expect(result.hasImage).toBe(false);
      expect(result.error).toBe('Clipboard access denied');
    });
  });

  describe('clipboard buffer storage', () => {
    it('should store and retrieve buffers', async () => {
      const buffer = await createTestPngBuffer();
      storeClipboardBuffer('item-1', buffer);
      
      const retrieved = getClipboardBuffer('item-1');
      expect(retrieved).toBe(buffer);
    });

    it('should return undefined for unknown item ID', () => {
      const retrieved = getClipboardBuffer('unknown');
      expect(retrieved).toBeUndefined();
    });

    it('should remove buffers', async () => {
      const buffer = await createTestPngBuffer();
      storeClipboardBuffer('item-1', buffer);
      removeClipboardBuffer('item-1');
      
      const retrieved = getClipboardBuffer('item-1');
      expect(retrieved).toBeUndefined();
    });

    it('should clear all buffers', async () => {
      const buffer = await createTestPngBuffer();
      storeClipboardBuffer('item-1', buffer);
      storeClipboardBuffer('item-2', buffer);
      
      expect(getClipboardBufferCount()).toBe(2);
      clearClipboardBuffers();
      expect(getClipboardBufferCount()).toBe(0);
    });

    it('should track buffer count', async () => {
      const buffer = await createTestPngBuffer();
      expect(getClipboardBufferCount()).toBe(0);
      
      storeClipboardBuffer('item-1', buffer);
      expect(getClipboardBufferCount()).toBe(1);
      
      storeClipboardBuffer('item-2', buffer);
      expect(getClipboardBufferCount()).toBe(2);
      
      removeClipboardBuffer('item-1');
      expect(getClipboardBufferCount()).toBe(1);
    });

    it('should overwrite existing buffer with same ID', async () => {
      const buffer1 = await createTestPngBuffer(50, 50);
      const buffer2 = await createTestPngBuffer(100, 100);
      
      storeClipboardBuffer('item-1', buffer1);
      storeClipboardBuffer('item-1', buffer2);
      
      expect(getClipboardBufferCount()).toBe(1);
      expect(getClipboardBuffer('item-1')).toBe(buffer2);
    });
  });
});
