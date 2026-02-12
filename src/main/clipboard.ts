/**
 * Clipboard image import module.
 * Handles reading images from the system clipboard and creating ImageItems.
 */

import { clipboard, nativeImage, NativeImage } from 'electron';
import sharp from 'sharp';
import type { ImageItem } from '../shared/types';
import { getClipboardBasename } from '../shared/naming';

/** Counter for generating unique clipboard item IDs */
let clipboardIdCounter = 0;

/**
 * Generate a unique ID for a clipboard image item.
 */
export function generateClipboardItemId(): string {
  return `clipboard-${Date.now()}-${++clipboardIdCounter}`;
}

/** Result of clipboard paste operation */
export interface ClipboardPasteResult {
  /** Whether an image was found in the clipboard */
  hasImage: boolean;
  /** The imported image item (if hasImage is true) */
  item?: ImageItem;
  /** PNG buffer of the clipboard image (for preview/export) */
  buffer?: Buffer;
  /** Error message if something went wrong */
  error?: string;
}

/** Options for reading clipboard */
export interface ClipboardReadOptions {
  /** Function to read the native image from clipboard (for testing/mocking) */
  readImage?: () => NativeImage;
}

/**
 * Read an image from the system clipboard.
 * Returns the image as a PNG buffer or null if no image is present.
 * 
 * @param options - Options including optional mock for testing
 * @returns PNG buffer or null
 */
export function readClipboardImage(options: ClipboardReadOptions = {}): Buffer | null {
  const readImage = options.readImage ?? (() => clipboard.readImage());
  const nativeImg = readImage();

  if (nativeImg.isEmpty()) {
    return null;
  }

  // Convert to PNG buffer for maximum compatibility
  const pngBuffer = nativeImg.toPNG();

  if (pngBuffer.length === 0) {
    return null;
  }

  return pngBuffer;
}

/**
 * Check if the clipboard contains an image.
 * 
 * @param options - Options including optional mock for testing
 * @returns True if clipboard has an image
 */
export function hasClipboardImage(options: ClipboardReadOptions = {}): boolean {
  const readImage = options.readImage ?? (() => clipboard.readImage());
  const nativeImg = readImage();
  return !nativeImg.isEmpty();
}

/**
 * Create an ImageItem from a clipboard image buffer.
 * 
 * @param buffer - PNG buffer from clipboard
 * @returns ImageItem with clipboard source
 */
export async function createClipboardImageItem(buffer: Buffer): Promise<ImageItem> {
  // Extract metadata using sharp
  const metadata = await sharp(buffer).metadata();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width === 0 || height === 0) {
    throw new Error('Invalid clipboard image dimensions');
  }

  const item: ImageItem = {
    id: generateClipboardItemId(),
    source: 'clipboard',
    sourcePath: undefined, // Clipboard items have no file path
    originalName: getClipboardBasename(),
    bytes: buffer.length,
    width,
    height,
    format: 'png', // We always convert clipboard to PNG
    hasAlpha: metadata.hasAlpha ?? false,
  };

  return item;
}

/**
 * Paste an image from the clipboard and create an ImageItem.
 * This is the main entry point for clipboard import.
 * 
 * @param options - Options including optional mock for testing
 * @returns ClipboardPasteResult with item and buffer if successful
 */
export async function pasteFromClipboard(
  options: ClipboardReadOptions = {}
): Promise<ClipboardPasteResult> {
  try {
    const buffer = readClipboardImage(options);

    if (!buffer) {
      return { hasImage: false };
    }

    const item = await createClipboardImageItem(buffer);

    return {
      hasImage: true,
      item,
      buffer,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error reading clipboard';
    return {
      hasImage: false,
      error: message,
    };
  }
}

/** In-memory storage for clipboard image buffers by item ID */
const clipboardBuffers = new Map<string, Buffer>();

/**
 * Store a clipboard buffer for later use (preview/export).
 * 
 * @param itemId - The item ID to associate with the buffer
 * @param buffer - The PNG buffer
 */
export function storeClipboardBuffer(itemId: string, buffer: Buffer): void {
  clipboardBuffers.set(itemId, buffer);
}

/**
 * Get a stored clipboard buffer.
 * 
 * @param itemId - The item ID
 * @returns The stored buffer or undefined
 */
export function getClipboardBuffer(itemId: string): Buffer | undefined {
  return clipboardBuffers.get(itemId);
}

/**
 * Remove a stored clipboard buffer.
 * 
 * @param itemId - The item ID
 */
export function removeClipboardBuffer(itemId: string): void {
  clipboardBuffers.delete(itemId);
}

/**
 * Clear all stored clipboard buffers.
 */
export function clearClipboardBuffers(): void {
  clipboardBuffers.clear();
}

/**
 * Get the count of stored clipboard buffers.
 */
export function getClipboardBufferCount(): number {
  return clipboardBuffers.size;
}
