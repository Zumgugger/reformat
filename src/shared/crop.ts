/**
 * Crop utilities - pure functions for crop operations.
 * Used by both main and renderer processes.
 */

import type { Crop, CropRect, CropRatioPreset, Transform } from './types';

/**
 * Pixel crop rectangle (for sharp.extract).
 */
export interface PixelCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Get the aspect ratio (width/height) for a given preset.
 * Returns null for 'original' (use image's own ratio) and 'free' (no constraint).
 */
export function getAspectRatioForPreset(
  preset: CropRatioPreset,
  originalWidth?: number,
  originalHeight?: number
): number | null {
  switch (preset) {
    case 'original':
      if (originalWidth && originalHeight && originalHeight > 0) {
        return originalWidth / originalHeight;
      }
      return null;
    case 'free':
      return null;
    case '1:1':
      return 1;
    case '4:5':
      return 4 / 5;
    case '3:4':
      return 3 / 4;
    case '9:16':
      return 9 / 16;
    case '16:9':
      return 16 / 9;
    case '2:3':
      return 2 / 3;
    case '3:2':
      return 3 / 2;
    default:
      return null;
  }
}

/**
 * Create a centered crop rectangle matching the given aspect ratio.
 * The crop will be as large as possible while fitting within the image bounds.
 * 
 * @param targetRatio - Target aspect ratio (width/height), or null for full image
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @returns Normalized crop rect (0..1)
 */
export function createCenteredCropRect(
  targetRatio: number | null,
  imageWidth: number,
  imageHeight: number
): CropRect {
  // If no target ratio, return full image
  if (targetRatio === null || targetRatio <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const imageRatio = imageWidth / imageHeight;

  let cropWidthNorm: number;
  let cropHeightNorm: number;

  if (targetRatio > imageRatio) {
    // Target is wider than image - fit to width, crop height
    cropWidthNorm = 1;
    cropHeightNorm = imageRatio / targetRatio;
  } else {
    // Target is taller than image - fit to height, crop width
    cropHeightNorm = 1;
    cropWidthNorm = targetRatio / imageRatio;
  }

  // Center the crop
  const x = (1 - cropWidthNorm) / 2;
  const y = (1 - cropHeightNorm) / 2;

  return {
    x,
    y,
    width: cropWidthNorm,
    height: cropHeightNorm,
  };
}

/**
 * Convert normalized crop rect (0..1) to pixel coordinates.
 * 
 * @param rect - Normalized crop rectangle
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Pixel crop rectangle
 */
export function normalizedToPixelCrop(
  rect: CropRect,
  width: number,
  height: number
): PixelCrop {
  // First clamp the input rect to valid bounds
  const clampedRect = clampCropRect(rect);
  
  const left = Math.round(clampedRect.x * width);
  const top = Math.round(clampedRect.y * height);
  const cropWidth = Math.round(clampedRect.width * width);
  const cropHeight = Math.round(clampedRect.height * height);

  return {
    left: Math.max(0, Math.min(left, width - 1)),
    top: Math.max(0, Math.min(top, height - 1)),
    width: Math.max(1, Math.min(cropWidth, width - left)),
    height: Math.max(1, Math.min(cropHeight, height - top)),
  };
}

/**
 * Get effective dimensions after applying a transform.
 * 90° and 270° rotations swap width and height.
 */
export function getEffectiveDimensions(
  width: number,
  height: number,
  transform?: Transform
): { width: number; height: number } {
  if (!transform) return { width, height };
  
  // 90° (1 step) and 270° (3 steps) rotations swap width and height
  if (transform.rotateSteps === 1 || transform.rotateSteps === 3) {
    return { width: height, height: width };
  }
  return { width, height };
}

/**
 * Convert normalized crop coordinates to pixel crop, accounting for transform.
 * 
 * The normalized coordinates are relative to the TRANSFORMED image (what the user sees).
 * This function converts them to pixel coordinates in the ORIGINAL image orientation.
 * 
 * @param rect - Normalized crop rect (relative to transformed orientation)
 * @param originalWidth - Original image width in pixels
 * @param originalHeight - Original image height in pixels
 * @param transform - Transform applied to the image
 * @returns Pixel crop in original image coordinates
 */
export function normalizedToPixelCropWithTransform(
  rect: CropRect,
  originalWidth: number,
  originalHeight: number,
  transform?: Transform
): PixelCrop {
  if (!transform || (transform.rotateSteps === 0 && !transform.flipH && !transform.flipV)) {
    // No transform - simple conversion
    return normalizedToPixelCrop(rect, originalWidth, originalHeight);
  }

  // Get the transformed dimensions (what the user sees)
  const { width: effWidth, height: effHeight } = getEffectiveDimensions(
    originalWidth,
    originalHeight,
    transform
  );

  // Convert normalized to pixel in transformed space
  let pixelLeft = rect.x * effWidth;
  let pixelTop = rect.y * effHeight;
  let pixelWidth = rect.width * effWidth;
  let pixelHeight = rect.height * effHeight;

  // Now convert back to original orientation
  // We need to reverse the transform operations

  // Reverse flips first (in transformed space)
  if (transform.flipH) {
    pixelLeft = effWidth - pixelLeft - pixelWidth;
  }
  if (transform.flipV) {
    pixelTop = effHeight - pixelTop - pixelHeight;
  }

  // Reverse rotation
  // Rotation steps are CW, so we need to rotate CCW to reverse
  const reverseSteps = (4 - transform.rotateSteps) % 4;
  
  for (let i = 0; i < reverseSteps; i++) {
    // Rotate CCW 90° (which is CW 270°)
    // In a 90° CCW rotation: (x, y) -> (y, width - x - w)
    // For a rectangle, we need to track the top-left corner and dimensions
    
    // Current dimensions after previous rotations
    const currentW = i % 2 === 0 ? effWidth : effHeight;
    const currentH = i % 2 === 0 ? effHeight : effWidth;
    
    // Rotate 90° CCW
    const newLeft = pixelTop;
    const newTop = currentW - pixelLeft - pixelWidth;
    const newWidth = pixelHeight;
    const newHeight = pixelWidth;
    
    pixelLeft = newLeft;
    pixelTop = newTop;
    pixelWidth = newWidth;
    pixelHeight = newHeight;
  }

  // Round and clamp
  return {
    left: Math.max(0, Math.round(pixelLeft)),
    top: Math.max(0, Math.round(pixelTop)),
    width: Math.max(1, Math.min(Math.round(pixelWidth), originalWidth - Math.round(pixelLeft))),
    height: Math.max(1, Math.min(Math.round(pixelHeight), originalHeight - Math.round(pixelTop))),
  };
}

/**
 * Validate and clamp a crop rect to valid bounds (0..1).
 */
export function clampCropRect(rect: CropRect): CropRect {
  const x = Math.max(0, Math.min(1, rect.x));
  const y = Math.max(0, Math.min(1, rect.y));
  const width = Math.max(0.01, Math.min(1 - x, rect.width));
  const height = Math.max(0.01, Math.min(1 - y, rect.height));

  return { x, y, width, height };
}

/**
 * Check if a crop rect represents the full image (no actual cropping).
 */
export function isFullImageCrop(rect: CropRect): boolean {
  const epsilon = 0.001;
  return (
    Math.abs(rect.x) < epsilon &&
    Math.abs(rect.y) < epsilon &&
    Math.abs(rect.width - 1) < epsilon &&
    Math.abs(rect.height - 1) < epsilon
  );
}

/**
 * Check if crop is effectively active (different from full image).
 * Handles undefined crop gracefully.
 */
export function isCropActive(crop: Crop | undefined): boolean {
  if (!crop) return false;
  return crop.active && !isFullImageCrop(crop.rect);
}

/**
 * Create a default crop (full image, inactive).
 */
export function createDefaultCrop(): Crop {
  return {
    active: false,
    ratioPreset: 'original',
    rect: { x: 0, y: 0, width: 1, height: 1 },
  };
}

/**
 * Clone a crop.
 */
export function cloneCrop(crop: Crop): Crop {
  return {
    active: crop.active,
    ratioPreset: crop.ratioPreset,
    rect: { ...crop.rect },
  };
}

/**
 * Check if two crops are equal.
 */
export function cropsEqual(a: Crop, b: Crop): boolean {
  return (
    a.active === b.active &&
    a.ratioPreset === b.ratioPreset &&
    cropRectsEqual(a.rect, b.rect)
  );
}

/**
 * Check if two crop rects are equal (within epsilon).
 */
export function cropRectsEqual(a: CropRect, b: CropRect, epsilon = 0.0001): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}

/**
 * Get the aspect ratio of a crop rect.
 */
export function getCropRectAspectRatio(rect: CropRect, imageWidth: number, imageHeight: number): number {
  const pixelWidth = rect.width * imageWidth;
  const pixelHeight = rect.height * imageHeight;
  return pixelHeight > 0 ? pixelWidth / pixelHeight : 1;
}

/**
 * Adjust crop rect to maintain a specific aspect ratio when resizing.
 * 
 * @param rect - Current crop rect
 * @param targetRatio - Target aspect ratio (width/height)
 * @param anchor - Which edge/corner to keep fixed ('center', 'top-left', etc.)
 * @param imageWidth - Image width
 * @param imageHeight - Image height
 */
export function adjustCropToRatio(
  rect: CropRect,
  targetRatio: number,
  imageWidth: number,
  imageHeight: number,
  anchor: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'center'
): CropRect {
  if (targetRatio <= 0) return rect;

  const imageRatio = imageWidth / imageHeight;
  const currentPixelWidth = rect.width * imageWidth;
  const currentPixelHeight = rect.height * imageHeight;
  const currentRatio = currentPixelWidth / currentPixelHeight;

  let newWidth = rect.width;
  let newHeight = rect.height;

  if (currentRatio > targetRatio) {
    // Current crop is wider than target - shrink width
    newWidth = (targetRatio / imageRatio) * rect.height;
  } else {
    // Current crop is taller than target - shrink height
    newHeight = (imageRatio / targetRatio) * rect.width;
  }

  let newX = rect.x;
  let newY = rect.y;

  // Adjust position based on anchor
  switch (anchor) {
    case 'center':
      newX = rect.x + (rect.width - newWidth) / 2;
      newY = rect.y + (rect.height - newHeight) / 2;
      break;
    case 'top-left':
      // Keep top-left fixed
      break;
    case 'top-right':
      newX = rect.x + rect.width - newWidth;
      break;
    case 'bottom-left':
      newY = rect.y + rect.height - newHeight;
      break;
    case 'bottom-right':
      newX = rect.x + rect.width - newWidth;
      newY = rect.y + rect.height - newHeight;
      break;
  }

  return clampCropRect({ x: newX, y: newY, width: newWidth, height: newHeight });
}

/**
 * All available crop ratio presets.
 */
export const CROP_RATIO_PRESETS: CropRatioPreset[] = [
  'original',
  'free',
  '1:1',
  '4:5',
  '3:4',
  '9:16',
  '16:9',
  '2:3',
  '3:2',
];

/**
 * Get display label for a crop ratio preset.
 */
export function getCropPresetLabel(preset: CropRatioPreset): string {
  switch (preset) {
    case 'original':
      return 'Original';
    case 'free':
      return 'Free';
    case '1:1':
      return '1:1 (Square)';
    case '4:5':
      return '4:5 (Portrait)';
    case '3:4':
      return '3:4 (Portrait)';
    case '9:16':
      return '9:16 (Portrait)';
    case '16:9':
      return '16:9 (Landscape)';
    case '2:3':
      return '2:3 (Portrait)';
    case '3:2':
      return '3:2 (Landscape)';
    default:
      return preset;
  }
}
