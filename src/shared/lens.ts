/**
 * Lens utilities - pure functions for 100% detail preview lens operations.
 * The lens is a draggable rectangle overlay that controls which region
 * of the original image is shown at 1:1 scale in the detail preview.
 */

import type { Transform } from './types';
import { getTransformedDimensions } from './transform';

/**
 * Normalized lens position (0..1 coordinates relative to preview image bounds).
 */
export interface LensPosition {
  /** Left edge (0..1) */
  x: number;
  /** Top edge (0..1) */
  y: number;
  /** Width (0..1) */
  width: number;
  /** Height (0..1) */
  height: number;
}

/**
 * Pixel coordinates for extracting a region from the original image.
 */
export interface PixelRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Screen coordinates (pixel position on the preview image element).
 */
export interface ScreenPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Create a default lens position centered in the image.
 * 
 * @param lensWidthNorm - Lens width as fraction of image (0..1)
 * @param lensHeightNorm - Lens height as fraction of image (0..1)
 * @returns Centered lens position
 */
export function createCenteredLens(
  lensWidthNorm: number,
  lensHeightNorm: number
): LensPosition {
  // Clamp dimensions to valid range
  const width = Math.max(0.01, Math.min(1, lensWidthNorm));
  const height = Math.max(0.01, Math.min(1, lensHeightNorm));
  
  return {
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height,
  };
}

/**
 * Calculate lens dimensions for a detail preview panel.
 * The lens should show a region that, at 1:1 scale, fills the detail preview area.
 * 
 * @param originalWidth - Original image width in pixels
 * @param originalHeight - Original image height in pixels
 * @param detailPanelWidth - Detail preview panel width in pixels
 * @param detailPanelHeight - Detail preview panel height in pixels
 * @param transform - Transform applied to the image (affects dimensions)
 * @returns Normalized lens dimensions (width, height as fractions 0..1)
 * @throws Error if invalid dimensions
 */
export function calculateLensDimensions(
  originalWidth: number,
  originalHeight: number,
  detailPanelWidth: number,
  detailPanelHeight: number,
  transform?: Transform
): { width: number; height: number } {
  if (originalWidth <= 0 || originalHeight <= 0) {
    throw new Error('Invalid image dimensions');
  }
  if (detailPanelWidth <= 0 || detailPanelHeight <= 0) {
    throw new Error('Invalid panel dimensions');
  }

  // Get effective image dimensions after transform
  let effectiveWidth = originalWidth;
  let effectiveHeight = originalHeight;
  
  if (transform) {
    const transformed = getTransformedDimensions(originalWidth, originalHeight, transform);
    effectiveWidth = transformed.width;
    effectiveHeight = transformed.height;
  }

  // Calculate lens size as fraction of image
  // The lens region at 1:1 should fill the detail panel
  const lensWidthNorm = Math.min(1, detailPanelWidth / effectiveWidth);
  const lensHeightNorm = Math.min(1, detailPanelHeight / effectiveHeight);

  return { width: lensWidthNorm, height: lensHeightNorm };
}

/**
 * Convert screen coordinates (on preview element) to normalized lens position.
 * 
 * @param screenX - X position on preview element (pixels)
 * @param screenY - Y position on preview element (pixels)
 * @param screenWidth - Preview element width (pixels)
 * @param screenHeight - Preview element height (pixels)
 * @param lensWidthNorm - Lens width (normalized, 0..1)
 * @param lensHeightNorm - Lens height (normalized, 0..1)
 * @returns Normalized lens position, clamped to valid bounds
 */
export function screenToNormalizedLens(
  screenX: number,
  screenY: number,
  screenWidth: number,
  screenHeight: number,
  lensWidthNorm: number,
  lensHeightNorm: number
): LensPosition {
  if (screenWidth <= 0 || screenHeight <= 0) {
    return createCenteredLens(lensWidthNorm, lensHeightNorm);
  }

  // Convert screen position to normalized (0..1)
  // The position represents the center of the lens, so we offset
  let x = screenX / screenWidth - lensWidthNorm / 2;
  let y = screenY / screenHeight - lensHeightNorm / 2;

  // Clamp to valid bounds
  x = Math.max(0, Math.min(1 - lensWidthNorm, x));
  y = Math.max(0, Math.min(1 - lensHeightNorm, y));

  return {
    x,
    y,
    width: Math.max(0.01, Math.min(1, lensWidthNorm)),
    height: Math.max(0.01, Math.min(1, lensHeightNorm)),
  };
}

/**
 * Convert normalized lens position to screen coordinates for rendering.
 * 
 * @param lens - Normalized lens position
 * @param screenWidth - Preview element width (pixels)
 * @param screenHeight - Preview element height (pixels)
 * @returns Screen coordinates for lens overlay
 */
export function normalizedToScreenLens(
  lens: LensPosition,
  screenWidth: number,
  screenHeight: number
): ScreenPosition {
  return {
    x: Math.round(lens.x * screenWidth),
    y: Math.round(lens.y * screenHeight),
    width: Math.round(lens.width * screenWidth),
    height: Math.round(lens.height * screenHeight),
  };
}

/**
 * Convert normalized lens position to pixel coordinates for image extraction.
 * Accounts for transform orientation (rotations swap width/height).
 * 
 * @param lens - Normalized lens position (0..1)
 * @param originalWidth - Original image width in pixels
 * @param originalHeight - Original image height in pixels
 * @param transform - Transform applied to image (optional)
 * @returns Pixel region for sharp.extract()
 */
export function normalizedToPixelRegion(
  lens: LensPosition,
  originalWidth: number,
  originalHeight: number,
  transform?: Transform
): PixelRegion {
  // Get effective dimensions after transform
  let effectiveWidth = originalWidth;
  let effectiveHeight = originalHeight;
  
  if (transform) {
    const transformed = getTransformedDimensions(originalWidth, originalHeight, transform);
    effectiveWidth = transformed.width;
    effectiveHeight = transformed.height;
  }

  // Convert normalized to pixels (in transformed coordinate space)
  const left = Math.round(lens.x * effectiveWidth);
  const top = Math.round(lens.y * effectiveHeight);
  const width = Math.round(lens.width * effectiveWidth);
  const height = Math.round(lens.height * effectiveHeight);

  // Clamp to valid bounds
  return {
    left: Math.max(0, Math.min(effectiveWidth - 1, left)),
    top: Math.max(0, Math.min(effectiveHeight - 1, top)),
    width: Math.max(1, Math.min(effectiveWidth - left, width)),
    height: Math.max(1, Math.min(effectiveHeight - top, height)),
  };
}

/**
 * Clamp lens position to stay within image bounds.
 * 
 * @param lens - Lens position to clamp
 * @returns Clamped lens position
 */
export function clampLensPosition(lens: LensPosition): LensPosition {
  const width = Math.max(0.01, Math.min(1, lens.width));
  const height = Math.max(0.01, Math.min(1, lens.height));
  
  return {
    x: Math.max(0, Math.min(1 - width, lens.x)),
    y: Math.max(0, Math.min(1 - height, lens.y)),
    width,
    height,
  };
}

/**
 * Move lens by a delta amount (in normalized coordinates).
 * 
 * @param lens - Current lens position
 * @param deltaX - X movement (normalized, can be negative)
 * @param deltaY - Y movement (normalized, can be negative)
 * @returns New clamped lens position
 */
export function moveLens(
  lens: LensPosition,
  deltaX: number,
  deltaY: number
): LensPosition {
  return clampLensPosition({
    ...lens,
    x: lens.x + deltaX,
    y: lens.y + deltaY,
  });
}

/**
 * Check if a lens covers the entire image (no need to show lens).
 * 
 * @param lens - Lens position to check
 * @returns True if lens covers entire image
 */
export function isLensFullCoverage(lens: LensPosition): boolean {
  return lens.width >= 0.999 && lens.height >= 0.999;
}

/**
 * Calculate the actual pixel dimensions that will be shown in the detail preview.
 * This is the size of the region extracted from the original image at 1:1.
 * 
 * @param lens - Normalized lens position
 * @param originalWidth - Original image width in pixels
 * @param originalHeight - Original image height in pixels
 * @param transform - Transform applied (optional)
 * @returns Pixel dimensions of the detail region
 */
export function getDetailDimensions(
  lens: LensPosition,
  originalWidth: number,
  originalHeight: number,
  transform?: Transform
): { width: number; height: number } {
  const region = normalizedToPixelRegion(lens, originalWidth, originalHeight, transform);
  return { width: region.width, height: region.height };
}

/**
 * Clone a lens position (for immutability).
 */
export function cloneLens(lens: LensPosition): LensPosition {
  return { ...lens };
}

/**
 * Check if two lens positions are equal.
 */
export function lensEqual(a: LensPosition, b: LensPosition): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}
