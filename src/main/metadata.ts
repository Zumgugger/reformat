/**
 * Image metadata extraction using sharp.
 * Provides width, height, hasAlpha, and file size information.
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import type { ImageItem, ImageSource } from '../shared/types';
import { getExtension, isPotentiallyAnimated, AnimationCheckResult } from '../shared/supportedFormats';

/** Result of metadata extraction */
export interface MetadataResult {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** File size in bytes */
  bytes: number;
  /** Detected image format (e.g., 'jpeg', 'png') */
  format: string;
  /** Best-effort detection of alpha channel */
  hasAlpha: boolean;
  /** Animation check result for GIF/WebP */
  animation?: AnimationCheckResult;
}

/**
 * Extract metadata from an image file.
 * 
 * @param filePath - Path to the image file
 * @returns Metadata including dimensions, format, and alpha detection
 */
export async function extractMetadata(filePath: string): Promise<MetadataResult> {
  // Get file size
  const stats = await fs.stat(filePath);
  const bytes = stats.size;

  // Get image metadata via sharp
  const image = sharp(filePath);
  const metadata = await image.metadata();

  let width = metadata.width ?? 0;
  let height = metadata.height ?? 0;
  const format = metadata.format ?? getExtension(filePath);

  // Account for EXIF orientation
  // Orientations 5, 6, 7, 8 involve 90° rotations that swap dimensions
  const exifOrientation = metadata.orientation ?? 1;
  if (exifOrientation >= 5 && exifOrientation <= 8) {
    [width, height] = [height, width];
  }

  // Best-effort alpha detection
  // Sharp reports hasAlpha for formats that support it
  const hasAlpha = metadata.hasAlpha ?? false;

  // Build result
  const result: MetadataResult = {
    width,
    height,
    bytes,
    format,
    hasAlpha,
  };

  // Check for animation in GIF/WebP
  const ext = getExtension(filePath);
  if (isPotentiallyAnimated(ext)) {
    const pages = metadata.pages ?? 1;
    result.animation = {
      isAnimated: pages > 1,
      frameCount: pages,
    };
  }

  return result;
}

/**
 * Extract metadata and check for animation.
 * Returns null if the image is animated (unsupported).
 * 
 * @param filePath - Path to the image file
 * @returns Metadata or null if animated
 */
export async function extractMetadataWithAnimationCheck(
  filePath: string
): Promise<MetadataResult | null> {
  const metadata = await extractMetadata(filePath);
  
  if (metadata.animation?.isAnimated) {
    return null;
  }
  
  return metadata;
}

/**
 * Generate a unique ID for an image item.
 */
let idCounter = 0;
export function generateImageId(): string {
  return `img-${Date.now()}-${++idCounter}`;
}

/**
 * Create an ImageItem from a file path with extracted metadata.
 * 
 * @param filePath - Path to the image file
 * @param source - Source type (file or clipboard)
 * @returns ImageItem with metadata, or null if extraction fails or image is animated
 */
export async function createImageItem(
  filePath: string,
  source: ImageSource = 'file'
): Promise<ImageItem | null> {
  try {
    const metadata = await extractMetadata(filePath);
    
    // Reject animated images
    if (metadata.animation?.isAnimated) {
      return null;
    }
    
    // Extract filename from path
    const pathParts = filePath.split(/[/\\]/);
    const originalName = pathParts[pathParts.length - 1] || 'unknown';
    
    return {
      id: generateImageId(),
      source,
      sourcePath: filePath,
      originalName,
      bytes: metadata.bytes,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      hasAlpha: metadata.hasAlpha,
    };
  } catch (error) {
    // Failed to extract metadata - file may be corrupted or inaccessible
    console.error(`Failed to extract metadata from ${filePath}:`, error);
    return null;
  }
}

/**
 * Create ImageItems from multiple file paths.
 * Skips files that fail metadata extraction or are animated.
 * 
 * @param filePaths - Array of file paths
 * @param source - Source type for all items
 * @returns Object with successfully created items and list of failed paths
 */
export async function createImageItems(
  filePaths: string[],
  source: ImageSource = 'file'
): Promise<{
  items: ImageItem[];
  failed: { path: string; reason: string }[];
}> {
  const items: ImageItem[] = [];
  const failed: { path: string; reason: string }[] = [];
  
  for (const filePath of filePaths) {
    try {
      const metadata = await extractMetadata(filePath);
      
      if (metadata.animation?.isAnimated) {
        const pathParts = filePath.split(/[/\\]/);
        const name = pathParts[pathParts.length - 1] || filePath;
        const ext = getExtension(filePath);
        failed.push({
          path: filePath,
          reason: `Animated ${ext.toUpperCase()} files are not supported`,
        });
        continue;
      }
      
      const pathParts = filePath.split(/[/\\]/);
      const originalName = pathParts[pathParts.length - 1] || 'unknown';
      
      items.push({
        id: generateImageId(),
        source,
        sourcePath: filePath,
        originalName,
        bytes: metadata.bytes,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        hasAlpha: metadata.hasAlpha,
      });
    } catch (error) {
      const pathParts = filePath.split(/[/\\]/);
      const name = pathParts[pathParts.length - 1] || filePath;
      failed.push({
        path: filePath,
        reason: error instanceof Error ? error.message : 'Failed to read image',
      });
    }
  }
  
  return { items, failed };
}
