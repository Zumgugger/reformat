/**
 * Target size (MiB) algorithm.
 * Iteratively downscales until file size is within ±10% of target, or min 48×48 reached.
 */

import { BYTES_PER_MIB, mibToBytes, bytesToMiB } from './bytes';

/** Minimum dimension (width or height) for downscaling */
export const MIN_DIMENSION = 48;

/** Tolerance for target size (±10%) */
export const SIZE_TOLERANCE = 0.10;

/** Initial scale step for binary search */
export const INITIAL_SCALE_STEP = 0.5;

/** Minimum scale to try before giving up */
export const MIN_SCALE = 0.01;

/**
 * Result of a target size iteration.
 */
export interface TargetSizeResult {
  /** Whether target was achieved within tolerance */
  success: boolean;
  /** Final width */
  width: number;
  /** Final height */
  height: number;
  /** Final file size in bytes */
  bytes: number;
  /** Scale factor applied (1 = original, 0.5 = 50%, etc.) */
  scale: number;
  /** Warning message if target not achievable */
  warning?: string;
  /** Number of iterations used */
  iterations: number;
}

/**
 * Options for target size algorithm.
 */
export interface TargetSizeOptions {
  /** Original width in pixels */
  sourceWidth: number;
  /** Original height in pixels */
  sourceHeight: number;
  /** Target size in MiB */
  targetMiB: number;
  /** Quality setting (40-100) for lossy formats */
  quality: number;
}

/**
 * Function signature for encode size estimation.
 * Returns the file size in bytes for given dimensions and quality.
 */
export type EncodeSizeFunction = (
  width: number,
  height: number,
  quality: number
) => Promise<number>;

/**
 * Check if a byte size is within tolerance of target.
 * @param actualBytes - Actual file size in bytes
 * @param targetBytes - Target file size in bytes
 * @returns Whether actual is within ±10% of target
 */
export function isWithinTolerance(actualBytes: number, targetBytes: number): boolean {
  const lowerBound = targetBytes * (1 - SIZE_TOLERANCE);
  const upperBound = targetBytes * (1 + SIZE_TOLERANCE);
  return actualBytes >= lowerBound && actualBytes <= upperBound;
}

/**
 * Check if dimensions are at or below minimum.
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @returns Whether either dimension is at or below MIN_DIMENSION
 */
export function isAtMinDimension(width: number, height: number): boolean {
  return width <= MIN_DIMENSION || height <= MIN_DIMENSION;
}

/**
 * Calculate scaled dimensions, rounding and enforcing minimum.
 * @param sourceWidth - Original width
 * @param sourceHeight - Original height
 * @param scale - Scale factor (0..1)
 * @returns Scaled dimensions, clamped to MIN_DIMENSION
 */
export function calculateScaledDimensions(
  sourceWidth: number,
  sourceHeight: number,
  scale: number
): { width: number; height: number } {
  const scaledWidth = Math.max(MIN_DIMENSION, Math.round(sourceWidth * scale));
  const scaledHeight = Math.max(MIN_DIMENSION, Math.round(sourceHeight * scale));
  return { width: scaledWidth, height: scaledHeight };
}

/**
 * Estimate bytes per pixel for a given quality.
 * This is a rough approximation used for initial estimates.
 * JPEG typical range: 0.1 - 1.0 bytes/pixel depending on complexity and quality.
 */
export function estimateBytesPerPixel(quality: number): number {
  // Linear interpolation from ~0.1 at q=40 to ~0.8 at q=100
  const minBpp = 0.10;
  const maxBpp = 0.80;
  const normalized = (quality - 40) / 60; // 0..1
  return minBpp + normalized * (maxBpp - minBpp);
}

/**
 * Estimate output dimensions needed to achieve target MiB.
 * Used for UI estimates before actual encode.
 */
export function estimateDimensionsForTarget(
  sourceWidth: number,
  sourceHeight: number,
  targetMiB: number,
  quality: number
): { width: number; height: number; scale: number } {
  const targetBytes = mibToBytes(targetMiB);
  const sourcePixels = sourceWidth * sourceHeight;
  const bpp = estimateBytesPerPixel(quality);
  
  // Estimate: targetBytes = pixels * bpp
  // So: pixels = targetBytes / bpp
  const targetPixels = targetBytes / bpp;
  
  // Scale = sqrt(targetPixels / sourcePixels)
  let scale = Math.sqrt(targetPixels / sourcePixels);
  
  // Clamp scale to valid range
  scale = Math.min(1, Math.max(MIN_SCALE, scale));
  
  const { width, height } = calculateScaledDimensions(sourceWidth, sourceHeight, scale);
  
  return { width, height, scale };
}

/**
 * Estimate file size in bytes for given dimensions and quality.
 * Used for UI estimates before actual encode.
 */
export function estimateFileSize(
  width: number,
  height: number,
  quality: number
): number {
  const pixels = width * height;
  const bpp = estimateBytesPerPixel(quality);
  return Math.round(pixels * bpp);
}

/**
 * Core target size algorithm with injectable encode function.
 * Uses binary search to find the scale that achieves target size.
 * 
 * @param options - Target size options
 * @param encodeSize - Function that returns encoded size for given dimensions
 * @returns Target size result
 */
export async function findTargetSize(
  options: TargetSizeOptions,
  encodeSize: EncodeSizeFunction
): Promise<TargetSizeResult> {
  const { sourceWidth, sourceHeight, targetMiB, quality } = options;
  
  // Validate inputs first, before calling mibToBytes
  if (targetMiB <= 0) {
    return {
      success: false,
      width: sourceWidth,
      height: sourceHeight,
      bytes: 0,
      scale: 1,
      warning: 'Target size must be greater than 0',
      iterations: 0,
    };
  }
  
  const targetBytes = mibToBytes(targetMiB);
  
  // First, check if original size already meets target
  const originalBytes = await encodeSize(sourceWidth, sourceHeight, quality);
  
  if (isWithinTolerance(originalBytes, targetBytes)) {
    return {
      success: true,
      width: sourceWidth,
      height: sourceHeight,
      bytes: originalBytes,
      scale: 1,
      iterations: 1,
    };
  }
  
  // If original is smaller than target (even below tolerance), use original
  if (originalBytes < targetBytes * (1 - SIZE_TOLERANCE)) {
    return {
      success: true,
      width: sourceWidth,
      height: sourceHeight,
      bytes: originalBytes,
      scale: 1,
      warning: `Original file (${bytesToMiB(originalBytes).toFixed(2)} MiB) is smaller than target`,
      iterations: 1,
    };
  }
  
  // Binary search for the right scale
  let lowScale = MIN_SCALE;
  let highScale = 1.0;
  let bestResult: { width: number; height: number; bytes: number; scale: number } | null = null;
  let iterations = 1; // Already did original check
  const maxIterations = 20; // Prevent infinite loops
  
  while (iterations < maxIterations) {
    const midScale = (lowScale + highScale) / 2;
    const { width, height } = calculateScaledDimensions(sourceWidth, sourceHeight, midScale);
    
    // Check if we've hit minimum dimensions
    const atMinDimension = isAtMinDimension(width, height);
    
    const bytes = await encodeSize(width, height, quality);
    iterations++;
    
    // Track best result that's at or under target
    if (bytes <= targetBytes * (1 + SIZE_TOLERANCE)) {
      if (!bestResult || bytes > bestResult.bytes) {
        bestResult = { width, height, bytes, scale: midScale };
      }
    }
    
    // Check if within tolerance
    if (isWithinTolerance(bytes, targetBytes)) {
      return {
        success: true,
        width,
        height,
        bytes,
        scale: midScale,
        iterations,
      };
    }
    
    // If at min dimension and still too large, we can't go smaller
    if (atMinDimension && bytes > targetBytes * (1 + SIZE_TOLERANCE)) {
      // Use smallest possible size
      return {
        success: false,
        width,
        height,
        bytes,
        scale: midScale,
        warning: `Cannot reach target: minimum size (${width}×${height}) still produces ${bytesToMiB(bytes).toFixed(2)} MiB`,
        iterations,
      };
    }
    
    // Binary search: adjust bounds
    if (bytes > targetBytes) {
      // Too big, need to scale down more
      highScale = midScale;
    } else {
      // Too small, can scale up
      lowScale = midScale;
    }
    
    // Check for convergence (scales are very close)
    if (highScale - lowScale < 0.001) {
      break;
    }
  }
  
  // Return best result found
  if (bestResult) {
    return {
      success: isWithinTolerance(bestResult.bytes, targetBytes),
      width: bestResult.width,
      height: bestResult.height,
      bytes: bestResult.bytes,
      scale: bestResult.scale,
      warning: isWithinTolerance(bestResult.bytes, targetBytes) 
        ? undefined 
        : `Closest achievable: ${bytesToMiB(bestResult.bytes).toFixed(2)} MiB`,
      iterations,
    };
  }
  
  // Fallback: couldn't find a good result
  return {
    success: false,
    width: sourceWidth,
    height: sourceHeight,
    bytes: originalBytes,
    scale: 1,
    warning: 'Could not find suitable dimensions for target size',
    iterations,
  };
}
