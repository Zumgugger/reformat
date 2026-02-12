/**
 * Preview generation module.
 * Creates downscaled preview images as data URLs for the renderer.
 */

import sharp from 'sharp';
import type { Transform } from '../shared/types';

/** Result of preview generation */
export interface PreviewResult {
  /** Base64 data URL of the preview image */
  dataUrl: string;
  /** Preview image width */
  width: number;
  /** Preview image height */
  height: number;
  /** Original image width */
  originalWidth: number;
  /** Original image height */
  originalHeight: number;
}

/** Options for preview generation */
export interface PreviewOptions {
  /** Maximum size for the longest edge (default: 800) */
  maxSize?: number;
  /** Transform to apply to preview */
  transform?: Transform;
  /** Output format: 'jpeg' or 'png' (default: 'jpeg') */
  format?: 'jpeg' | 'png';
  /** JPEG quality (default: 80) */
  quality?: number;
}

const DEFAULT_MAX_SIZE = 800;
const DEFAULT_QUALITY = 80;

/**
 * Generate a preview image as a data URL.
 * 
 * @param filePath - Path to the source image
 * @param options - Preview generation options
 * @returns Preview result with data URL and dimensions
 */
export async function generatePreview(
  filePath: string,
  options: PreviewOptions = {}
): Promise<PreviewResult> {
  const {
    maxSize = DEFAULT_MAX_SIZE,
    transform,
    format = 'jpeg',
    quality = DEFAULT_QUALITY,
  } = options;

  // Load image and get metadata
  let image = sharp(filePath);
  const metadata = await image.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Apply EXIF orientation correction first
  image = image.rotate();

  // Apply transform if provided
  if (transform) {
    image = applyTransform(image, transform);
  }

  // Calculate preview dimensions (fit within maxSize)
  // After rotation, we need to account for swapped dimensions
  let effectiveWidth = originalWidth;
  let effectiveHeight = originalHeight;
  
  // If we have an odd number of 90° rotations, dimensions are swapped
  if (transform && (transform.rotateSteps === 1 || transform.rotateSteps === 3)) {
    effectiveWidth = originalHeight;
    effectiveHeight = originalWidth;
  }

  const { width: previewWidth, height: previewHeight } = calculatePreviewDimensions(
    effectiveWidth,
    effectiveHeight,
    maxSize
  );

  // Resize to preview dimensions
  image = image.resize(previewWidth, previewHeight, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Encode to buffer
  let buffer: Buffer;
  let mimeType: string;

  if (format === 'png') {
    buffer = await image.png().toBuffer();
    mimeType = 'image/png';
  } else {
    buffer = await image.jpeg({ quality }).toBuffer();
    mimeType = 'image/jpeg';
  }

  // Get actual output dimensions
  const outputMeta = await sharp(buffer).metadata();
  const actualWidth = outputMeta.width ?? previewWidth;
  const actualHeight = outputMeta.height ?? previewHeight;

  // Create data URL
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    width: actualWidth,
    height: actualHeight,
    originalWidth,
    originalHeight,
  };
}

/**
 * Generate a preview from a buffer (for clipboard images).
 * 
 * @param buffer - Image buffer
 * @param options - Preview generation options
 * @returns Preview result with data URL and dimensions
 */
export async function generatePreviewFromBuffer(
  buffer: Buffer,
  options: PreviewOptions = {}
): Promise<PreviewResult> {
  const {
    maxSize = DEFAULT_MAX_SIZE,
    transform,
    format = 'jpeg',
    quality = DEFAULT_QUALITY,
  } = options;

  // Load image and get metadata
  let image = sharp(buffer);
  const metadata = await image.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Apply transform if provided
  if (transform) {
    image = applyTransform(image, transform);
  }

  // Calculate preview dimensions
  let effectiveWidth = originalWidth;
  let effectiveHeight = originalHeight;
  
  if (transform && (transform.rotateSteps === 1 || transform.rotateSteps === 3)) {
    effectiveWidth = originalHeight;
    effectiveHeight = originalWidth;
  }

  const { width: previewWidth, height: previewHeight } = calculatePreviewDimensions(
    effectiveWidth,
    effectiveHeight,
    maxSize
  );

  // Resize to preview dimensions
  image = image.resize(previewWidth, previewHeight, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Encode to buffer
  let outputBuffer: Buffer;
  let mimeType: string;

  if (format === 'png') {
    outputBuffer = await image.png().toBuffer();
    mimeType = 'image/png';
  } else {
    outputBuffer = await image.jpeg({ quality }).toBuffer();
    mimeType = 'image/jpeg';
  }

  // Get actual output dimensions
  const outputMeta = await sharp(outputBuffer).metadata();
  const actualWidth = outputMeta.width ?? previewWidth;
  const actualHeight = outputMeta.height ?? previewHeight;

  // Create data URL
  const base64 = outputBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    width: actualWidth,
    height: actualHeight,
    originalWidth,
    originalHeight,
  };
}

/**
 * Apply transform operations to a sharp instance.
 */
function applyTransform(image: sharp.Sharp, transform: Transform): sharp.Sharp {
  // Apply rotation (90° steps clockwise)
  if (transform.rotateSteps > 0) {
    const degrees = transform.rotateSteps * 90;
    image = image.rotate(degrees);
  }

  // Apply flips
  // Note: flips are applied after rotation
  if (transform.flipH) {
    image = image.flop(); // horizontal flip
  }
  if (transform.flipV) {
    image = image.flip(); // vertical flip
  }

  return image;
}

/**
 * Calculate preview dimensions maintaining aspect ratio.
 */
function calculatePreviewDimensions(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const ratio = width / height;

  if (width > height) {
    return {
      width: maxSize,
      height: Math.round(maxSize / ratio),
    };
  } else {
    return {
      width: Math.round(maxSize * ratio),
      height: maxSize,
    };
  }
}

/**
 * Apply a single transform step (for individual button clicks).
 */
export function rotateTransformCW(transform: Transform): Transform {
  const newSteps = ((transform.rotateSteps + 1) % 4) as 0 | 1 | 2 | 3;
  return { ...transform, rotateSteps: newSteps };
}

export function rotateTransformCCW(transform: Transform): Transform {
  const newSteps = ((transform.rotateSteps + 3) % 4) as 0 | 1 | 2 | 3; // +3 is same as -1 mod 4
  return { ...transform, rotateSteps: newSteps };
}

export function flipTransformH(transform: Transform): Transform {
  return { ...transform, flipH: !transform.flipH };
}

export function flipTransformV(transform: Transform): Transform {
  return { ...transform, flipV: !transform.flipV };
}

export function resetTransform(): Transform {
  return { rotateSteps: 0, flipH: false, flipV: false };
}

/**
 * Check if a transform is the identity (no changes).
 */
export function isIdentityTransform(transform: Transform): boolean {
  return transform.rotateSteps === 0 && !transform.flipH && !transform.flipV;
}

/**
 * Get effective dimensions after transform (accounting for rotation swap).
 */
export function getTransformedDimensions(
  width: number,
  height: number,
  transform: Transform
): { width: number; height: number } {
  // 90° and 270° rotations swap width and height
  if (transform.rotateSteps === 1 || transform.rotateSteps === 3) {
    return { width: height, height: width };
  }
  return { width, height };
}
