/**
 * Byte/MiB conversion utilities.
 * 1 MiB = 1,048,576 bytes (2^20)
 */

/** Bytes per MiB (mebibyte) */
export const BYTES_PER_MIB = 1_048_576;

/**
 * Convert bytes to MiB.
 * @param bytes - Number of bytes
 * @returns Size in MiB
 */
export function bytesToMiB(bytes: number): number {
  if (bytes < 0) {
    throw new Error('Bytes cannot be negative');
  }
  return bytes / BYTES_PER_MIB;
}

/**
 * Convert MiB to bytes.
 * @param mib - Size in MiB
 * @returns Number of bytes
 */
export function mibToBytes(mib: number): number {
  if (mib < 0) {
    throw new Error('MiB cannot be negative');
  }
  return Math.round(mib * BYTES_PER_MIB);
}

/**
 * Format bytes as a human-readable MiB string with 1 decimal place.
 * Examples: "0.0 MiB", "2.3 MiB", "15.7 MiB"
 * @param bytes - Number of bytes
 * @returns Formatted string
 */
export function formatMiB(bytes: number): string {
  if (bytes < 0) {
    throw new Error('Bytes cannot be negative');
  }
  const mib = bytesToMiB(bytes);
  return `${mib.toFixed(1)} MiB`;
}

/**
 * Parse a MiB string (e.g., "2.3 MiB" or "2.3") to bytes.
 * @param str - String to parse
 * @returns Number of bytes, or NaN if invalid
 */
export function parseMiBString(str: string): number {
  const cleaned = str.trim().replace(/\s*MiB$/i, '');
  const mib = parseFloat(cleaned);
  if (isNaN(mib) || mib < 0) {
    return NaN;
  }
  return mibToBytes(mib);
}
