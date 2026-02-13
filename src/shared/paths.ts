/**
 * Output folder resolution rules (pure functions).
 *
 * Rules:
 * - Single file from a folder → Downloads/{source-folder-name}_reformat/
 * - Batch from one source folder → Downloads/{source-folder-name}_reformat/
 * - Mixed source folders → Downloads/Reformat_{date}/
 * - Clipboard images → Downloads/Reformat_{date}/
 * - Clipboard during a run → same destination as that run
 */

import { ImageItem } from './types';

/** Suffix appended to folder names */
export const REFORMAT_SUFFIX = '_reformat';

/**
 * Generate a date-based folder name for mixed/clipboard sources.
 * Format: Reformat_YYYY-MM-DD
 */
export function generateReformatFolderName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `Reformat_${year}-${month}-${day}`;
}

/**
 * Extract the parent folder name from a file path.
 * Works with both Windows (backslash) and POSIX (forward slash) paths.
 * @param filePath - Full file path
 * @returns Parent folder name, or undefined if path is invalid
 */
export function getParentFolderName(filePath: string): string | undefined {
  if (!filePath) return undefined;

  // Normalize to forward slashes for consistent handling
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  // Need at least 2 parts: folder + filename
  if (parts.length < 2) return undefined;

  // Return the second-to-last part (parent folder)
  return parts[parts.length - 2];
}

/**
 * Extract the parent folder path from a file path.
 * @param filePath - Full file path
 * @returns Parent folder path, or undefined if path is invalid
 */
export function getParentFolderPath(filePath: string): string | undefined {
  if (!filePath) return undefined;

  // Normalize to forward slashes
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash <= 0) return undefined;

  return normalized.substring(0, lastSlash);
}

/**
 * Determine the output subfolder based on input items.
 *
 * @param items - Array of ImageItem to process
 * @param existingDestination - If provided, use this destination (for clipboard append during run)
 * @returns Subfolder path relative to Downloads (empty string for root, or folder name)
 */
export function resolveOutputSubfolder(
  items: ImageItem[],
  existingDestination?: string
): string {
  // If there's an existing destination (e.g., clipboard paste during a run), use it
  if (existingDestination !== undefined) {
    return existingDestination;
  }

  // Filter to only file-sourced items with valid paths
  const fileItems = items.filter(
    (item) => item.source === 'file' && item.sourcePath
  );

  // No file items (all clipboard) → use Reformat_{date} folder
  if (fileItems.length === 0) {
    return generateReformatFolderName();
  }

  // Check if all files are from the same source folder
  const parentPaths = new Set<string>();
  for (const item of fileItems) {
    const parentPath = getParentFolderPath(item.sourcePath!);
    if (parentPath) {
      // Normalize for comparison (lowercase on Windows)
      parentPaths.add(parentPath.toLowerCase());
    }
  }

  // All from same folder (single or multiple) → use {folderName}_reformat
  if (parentPaths.size === 1) {
    const firstItem = fileItems[0];
    const folderName = getParentFolderName(firstItem.sourcePath!);
    if (folderName) {
      return `${folderName}${REFORMAT_SUFFIX}`;
    }
    // No folder name found, use date-based folder
    return generateReformatFolderName();
  }

  // Mixed source folders → use Reformat_{date}
  return generateReformatFolderName();
}

/**
 * Build the full output folder path.
 * @param downloadsPath - Path to the Downloads folder
 * @param subfolder - Subfolder returned by resolveOutputSubfolder
 * @returns Full output folder path
 */
export function buildOutputFolderPath(
  downloadsPath: string,
  subfolder: string
): string {
  // Normalize downloads path (remove trailing slash)
  const normalizedDownloads = downloadsPath.replace(/[\\/]+$/, '');

  if (!subfolder) {
    return normalizedDownloads;
  }

  // Use backslash for Windows compatibility
  return `${normalizedDownloads}\\${subfolder}`;
}
