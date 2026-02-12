/**
 * File/folder import logic for the main process.
 * Handles file picker dialogs, path validation, and import operations.
 */

import { dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { hasValidExtension, filterSupportedPaths } from '../shared/supportedFormats';
import { dedupePaths, mergePathsWithDedupe } from '../shared/dedupe';

/** Supported extensions for the file dialog filter */
const SUPPORTED_EXTENSION_LIST = [
  'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif', 'bmp', 'gif'
];

/** Result of a file selection operation */
export interface SelectFilesResult {
  /** Selected file paths */
  paths: string[];
  /** Whether the user cancelled the dialog */
  cancelled: boolean;
}

/**
 * Open a file picker dialog for selecting image files.
 * 
 * @param parentWindow - Parent window for the dialog (or null)
 * @returns Selected file paths or empty if cancelled
 */
export async function selectFiles(parentWindow: BrowserWindow | null): Promise<SelectFilesResult> {
  const result = await dialog.showOpenDialog(parentWindow ?? undefined as any, {
    title: 'Select Images',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Images',
        extensions: SUPPORTED_EXTENSION_LIST,
      },
      {
        name: 'All Files',
        extensions: ['*'],
      },
    ],
  });

  if (result.canceled) {
    return { paths: [], cancelled: true };
  }

  // Filter to only supported extensions (in case user selected "All Files")
  const filtered = filterSupportedPaths(result.filePaths);
  
  return {
    paths: filtered.supported,
    cancelled: false,
  };
}

/** Warning types during import */
export type ImportWarningType = 
  | 'unsupported-extension'
  | 'no-extension'
  | 'duplicate'
  | 'subfolder-skipped'
  | 'not-found'
  | 'access-denied';

/** A warning generated during import */
export interface ImportWarning {
  type: ImportWarningType;
  path: string;
  message: string;
}

/** Result of importing dropped paths */
export interface ImportDroppedResult {
  /** Valid file paths after filtering and deduplication */
  paths: string[];
  /** Count of files that were duplicates */
  duplicateCount: number;
  /** Warnings generated during import */
  warnings: ImportWarning[];
}

/**
 * Check if a path is a directory.
 */
async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is accessible.
 */
async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List immediate children of a directory (non-recursive).
 * Returns full paths.
 */
async function listDirectoryChildren(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const children: string[] = [];
  
  for (const entry of entries) {
    if (entry.isFile()) {
      children.push(path.join(dirPath, entry.name));
    }
    // Skip directories and other types (symlinks, etc.)
  }
  
  return children;
}

/**
 * Import dropped paths (files and/or folders).
 * 
 * - For files: validates extension and includes if supported
 * - For folders: lists immediate children only (non-recursive)
 * - Deduplicates results
 * - Generates warnings for unsupported/skipped items
 * 
 * @param droppedPaths - Array of paths dropped by the user
 * @param existingPaths - Paths already in the selection (for dedupe)
 * @returns Import result with paths and warnings
 */
export async function importDroppedPaths(
  droppedPaths: string[],
  existingPaths: string[] = []
): Promise<ImportDroppedResult> {
  const warnings: ImportWarning[] = [];
  const collectedPaths: string[] = [];
  
  for (const droppedPath of droppedPaths) {
    // Check if path exists
    if (!(await exists(droppedPath))) {
      warnings.push({
        type: 'not-found',
        path: droppedPath,
        message: `File or folder not found: ${path.basename(droppedPath)}`,
      });
      continue;
    }
    
    // Check if it's a directory
    if (await isDirectory(droppedPath)) {
      // List immediate children (non-recursive)
      try {
        const children = await listDirectoryChildren(droppedPath);
        
        // Check for subdirectories to warn about
        const entries = await fs.readdir(droppedPath, { withFileTypes: true });
        const subfolders = entries.filter(e => e.isDirectory());
        if (subfolders.length > 0) {
          warnings.push({
            type: 'subfolder-skipped',
            path: droppedPath,
            message: `${subfolders.length} subfolder(s) in "${path.basename(droppedPath)}" were skipped (non-recursive import)`,
          });
        }
        
        // Filter children to supported extensions
        for (const childPath of children) {
          if (hasValidExtension(childPath)) {
            collectedPaths.push(childPath);
          } else {
            const ext = path.extname(childPath);
            if (!ext) {
              warnings.push({
                type: 'no-extension',
                path: childPath,
                message: `Skipped file without extension: ${path.basename(childPath)}`,
              });
            } else {
              warnings.push({
                type: 'unsupported-extension',
                path: childPath,
                message: `Unsupported format: ${path.basename(childPath)}`,
              });
            }
          }
        }
      } catch (error) {
        warnings.push({
          type: 'access-denied',
          path: droppedPath,
          message: `Cannot access folder: ${path.basename(droppedPath)}`,
        });
      }
    } else {
      // It's a file
      if (hasValidExtension(droppedPath)) {
        collectedPaths.push(droppedPath);
      } else {
        const ext = path.extname(droppedPath);
        if (!ext) {
          warnings.push({
            type: 'no-extension',
            path: droppedPath,
            message: `Skipped file without extension: ${path.basename(droppedPath)}`,
          });
        } else {
          warnings.push({
            type: 'unsupported-extension',
            path: droppedPath,
            message: `Unsupported format: ${path.basename(droppedPath)}`,
          });
        }
      }
    }
  }
  
  // Deduplicate against existing paths
  const mergeResult = mergePathsWithDedupe(existingPaths, collectedPaths);
  
  // Only return the new paths (not the existing ones)
  const newPaths = mergeResult.merged.slice(existingPaths.length);
  
  // Add duplicate warnings if any
  if (mergeResult.duplicateCount > 0) {
    // We don't have individual duplicate paths tracked, so add a summary warning
    // The dedupe module tracks counts but not which specific paths were dupes
  }
  
  return {
    paths: newPaths,
    duplicateCount: mergeResult.duplicateCount,
    warnings,
  };
}

/**
 * Import paths without deduplicating against existing selection.
 * Useful for initial import or when managing dedupe elsewhere.
 */
export async function importPaths(
  droppedPaths: string[]
): Promise<ImportDroppedResult> {
  return importDroppedPaths(droppedPaths, []);
}
