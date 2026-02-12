/**
 * Output folder resolution rules (pure functions).
 *
 * Rules:
 * - Single file → Downloads root
 * - Batch from one source folder → Downloads/<source-folder-name>/
 * - Mixed source folders → Downloads/Reformat/
 * - Clipboard during a run → same destination as that run
 */

import { ImageItem } from './types';

/** Default subfolder name for mixed sources */
export const MIXED_SOURCE_FOLDER = 'Reformat';

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

  // No file items (all clipboard) → use Reformat folder
  if (fileItems.length === 0) {
    return MIXED_SOURCE_FOLDER;
  }

  // Single file → Downloads root
  if (fileItems.length === 1) {
    return '';
  }

  // Multiple files → check if all from same source folder
  const parentPaths = new Set<string>();
  for (const item of fileItems) {
    const parentPath = getParentFolderPath(item.sourcePath!);
    if (parentPath) {
      // Normalize for comparison (lowercase on Windows)
      parentPaths.add(parentPath.toLowerCase());
    }
  }

  // All from same folder → use that folder's name
  if (parentPaths.size === 1) {
    const firstItem = fileItems[0];
    const folderName = getParentFolderName(firstItem.sourcePath!);
    return folderName || MIXED_SOURCE_FOLDER;
  }

  // Mixed source folders → use Reformat
  return MIXED_SOURCE_FOLDER;
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

  // Use forward slash for consistency (will work on both platforms)
  return `${normalizedDownloads}/${subfolder}`;
}
