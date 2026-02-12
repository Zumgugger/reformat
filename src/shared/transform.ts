/**
 * Transform utilities - pure functions for transform operations.
 * Used by both main and renderer processes.
 */

import type { Transform } from './types';

/**
 * Create a new transform with a clockwise 90° rotation step added.
 */
export function rotateTransformCW(transform: Transform): Transform {
  const newSteps = ((transform.rotateSteps + 1) % 4) as 0 | 1 | 2 | 3;
  return { ...transform, rotateSteps: newSteps };
}

/**
 * Create a new transform with a counter-clockwise 90° rotation step added.
 */
export function rotateTransformCCW(transform: Transform): Transform {
  const newSteps = ((transform.rotateSteps + 3) % 4) as 0 | 1 | 2 | 3; // +3 is same as -1 mod 4
  return { ...transform, rotateSteps: newSteps };
}

/**
 * Create a new transform with horizontal flip toggled.
 */
export function flipTransformH(transform: Transform): Transform {
  return { ...transform, flipH: !transform.flipH };
}

/**
 * Create a new transform with vertical flip toggled.
 */
export function flipTransformV(transform: Transform): Transform {
  return { ...transform, flipV: !transform.flipV };
}

/**
 * Create a default (identity) transform - no rotation or flip.
 */
export function createIdentityTransform(): Transform {
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
 * 90° and 270° rotations swap width and height.
 */
export function getTransformedDimensions(
  width: number,
  height: number,
  transform: Transform
): { width: number; height: number } {
  // 90° (1 step) and 270° (3 steps) rotations swap width and height
  if (transform.rotateSteps === 1 || transform.rotateSteps === 3) {
    return { width: height, height: width };
  }
  return { width, height };
}

/**
 * Convert rotation steps to degrees.
 */
export function rotationStepsToDegrees(steps: 0 | 1 | 2 | 3): number {
  return steps * 90;
}

/**
 * Combine two transforms into one.
 * The second transform is applied after the first.
 */
export function combineTransforms(first: Transform, second: Transform): Transform {
  // Calculate combined rotation
  const combinedSteps = ((first.rotateSteps + second.rotateSteps) % 4) as 0 | 1 | 2 | 3;
  
  // Flips need to account for rotation order
  // When rotating, the flip axes may be swapped
  let flipH = first.flipH;
  let flipV = first.flipV;
  
  // Apply rotation effect on existing flips
  // If second has odd rotation steps (90° or 270°), swap the flip axes
  if (second.rotateSteps === 1 || second.rotateSteps === 3) {
    [flipH, flipV] = [flipV, flipH];
  }
  // If second has 180° rotation, flips stay the same but are effectively inverted
  // Actually for 180°, flipH stays flipH and flipV stays flipV
  
  // Then XOR with second's flips
  flipH = flipH !== second.flipH;
  flipV = flipV !== second.flipV;
  
  return {
    rotateSteps: combinedSteps,
    flipH,
    flipV,
  };
}

/**
 * Check if two transforms are equal.
 */
export function transformsEqual(a: Transform, b: Transform): boolean {
  return a.rotateSteps === b.rotateSteps && a.flipH === b.flipH && a.flipV === b.flipV;
}

/**
 * Clone a transform.
 */
export function cloneTransform(transform: Transform): Transform {
  return {
    rotateSteps: transform.rotateSteps,
    flipH: transform.flipH,
    flipV: transform.flipV,
  };
}

/**
 * Get CSS transform string for preview display.
 */
export function transformToCSS(transform: Transform): string {
  const parts: string[] = [];
  
  if (transform.rotateSteps > 0) {
    parts.push(`rotate(${transform.rotateSteps * 90}deg)`);
  }
  
  if (transform.flipH && transform.flipV) {
    // Both flips = 180° rotation, but we apply as scale
    parts.push('scale(-1, -1)');
  } else if (transform.flipH) {
    parts.push('scaleX(-1)');
  } else if (transform.flipV) {
    parts.push('scaleY(-1)');
  }
  
  return parts.length > 0 ? parts.join(' ') : 'none';
}
