/**
 * HEIC encode support detection.
 * 
 * Determines at startup whether the current sharp build supports HEIC encoding.
 * This varies by platform and sharp build configuration.
 */

import sharp from 'sharp';

export interface HeicSupportResult {
  /** Whether HEIC encoding is supported */
  supported: boolean;
  /** Reason if not supported */
  reason?: string;
}

/** Cached result to avoid repeated checks */
let cachedResult: HeicSupportResult | null = null;

/**
 * Check if HEIC encoding is supported by creating a tiny test image.
 * 
 * @returns Result indicating if HEIC encode is supported
 */
export async function checkHeicEncodeSupport(): Promise<HeicSupportResult> {
  // Return cached result if available
  if (cachedResult !== null) {
    return cachedResult;
  }

  try {
    // Create a tiny 1x1 test image and try to encode it as HEIC
    const testBuffer = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .heif({ quality: 50 })
      .toBuffer();

    // If we got here without error, HEIC encoding is supported
    if (testBuffer && testBuffer.length > 0) {
      cachedResult = { supported: true };
    } else {
      cachedResult = { supported: false, reason: 'HEIC encoding returned empty buffer' };
    }
  } catch (error) {
    // HEIC encoding not supported
    const message = error instanceof Error ? error.message : String(error);
    cachedResult = { 
      supported: false, 
      reason: `HEIC encoding not available: ${message}` 
    };
  }

  return cachedResult;
}

/**
 * Synchronously return cached HEIC support result.
 * Returns null if check hasn't been performed yet.
 */
export function getCachedHeicSupport(): HeicSupportResult | null {
  return cachedResult;
}

/**
 * Clear cached result (for testing).
 */
export function clearHeicSupportCache(): void {
  cachedResult = null;
}
