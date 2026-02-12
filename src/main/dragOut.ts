/**
 * Drag-out export module.
 *
 * Handles dragging exported files out of the app to external destinations.
 * Uses Electron's webContents.startDrag API.
 */

import { BrowserWindow, nativeImage, shell } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import { generateUniquePath } from '../shared/collision';

/** Result of starting a drag operation */
export interface StartDragResult {
  /** Whether the drag was successfully initiated */
  started: boolean;
  /** Error message if drag failed to start */
  error?: string;
}

/** Result of a file move operation */
export interface MoveFileResult {
  /** Whether the move was successful */
  success: boolean;
  /** The final destination path */
  destinationPath?: string;
  /** Error message if move failed */
  error?: string;
  /** Warning messages */
  warnings?: string[];
  /** Whether the file was renamed due to collision */
  renamed?: boolean;
  /** Whether an existing file was overwritten */
  overwritten?: boolean;
}

/** Options for starting a drag */
export interface StartDragOptions {
  /** The file paths to drag */
  files: string[];
  /** The window from which to start the drag (optional) */
  window?: BrowserWindow | null;
}

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a drag icon for the file(s).
 * Uses the first file's icon or a generic file icon.
 */
function createDragIcon(): Electron.NativeImage {
  // Create a simple 32x32 placeholder icon
  // In production, we could use the actual file icon from the electron shell
  return nativeImage.createEmpty();
}

/**
 * Start a drag operation for files.
 *
 * Note: Electron's startDrag API doesn't provide callbacks for drop events,
 * so we can't track whether the user actually dropped the file or where.
 * The "move semantics" mentioned in the spec can only be achieved by:
 * 1. Letting the OS handle move vs copy (depends on modifier keys held during drag)
 * 2. Deleting the source file after drag completes (but we can't reliably detect completion)
 *
 * For V1, we use platform-native drag and accept that the OS handles move vs copy.
 *
 * @param options - Drag options
 * @returns Result indicating if drag was initiated
 */
export async function startDrag(options: StartDragOptions): Promise<StartDragResult> {
  const { files, window } = options;

  if (files.length === 0) {
    return { started: false, error: 'No files to drag' };
  }

  // Verify all files exist
  for (const file of files) {
    const exists = await fileExists(file);
    if (!exists) {
      return { started: false, error: `File not found: ${file}` };
    }
  }

  // Get the focused window if not provided
  const targetWindow = window ?? BrowserWindow.getFocusedWindow();
  if (!targetWindow) {
    return { started: false, error: 'No window available for drag' };
  }

  try {
    // Start the drag with the first file
    // Note: Electron's startDrag doesn't support multiple files directly,
    // so for batch drag we'd need a different approach.
    // For V1, we support single file drag.
    const filePath = files[0];
    const icon = createDragIcon();

    targetWindow.webContents.startDrag({
      file: filePath,
      icon,
    });

    return { started: true };
  } catch (error) {
    return {
      started: false,
      error: `Failed to start drag: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Move a file to a destination path.
 * Handles collision detection and resolution.
 *
 * @param sourcePath - Source file path
 * @param destinationPath - Destination path
 * @param overwrite - Whether to overwrite if destination exists
 * @param autoRename - Whether to auto-rename if destination exists (used if overwrite is false)
 * @returns Move result
 */
export async function moveFile(
  sourcePath: string,
  destinationPath: string,
  overwrite = false,
  autoRename = false
): Promise<MoveFileResult> {
  const warnings: string[] = [];

  // Check if source exists
  if (!(await fileExists(sourcePath))) {
    return { success: false, error: 'Source file not found' };
  }

  // Check for collision
  const destExists = await fileExists(destinationPath);

  let finalDestPath = destinationPath;
  let wasRenamed = false;
  let wasOverwritten = false;

  if (destExists) {
    if (overwrite) {
      // Delete existing file
      try {
        await fs.unlink(destinationPath);
        wasOverwritten = true;
      } catch (err) {
        return {
          success: false,
          error: `Failed to overwrite: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    } else if (autoRename) {
      // Generate a unique path
      finalDestPath = await generateUniquePath(destinationPath, fileExists);
      wasRenamed = true;
    } else {
      // Collision without resolution strategy
      return {
        success: false,
        error: 'Destination file already exists',
      };
    }
  }

  // Ensure destination directory exists
  const destDir = path.dirname(finalDestPath);
  try {
    await fs.mkdir(destDir, { recursive: true });
  } catch {
    // Ignore if already exists
  }

  // Try to rename (move) the file
  try {
    await fs.rename(sourcePath, finalDestPath);
    return {
      success: true,
      destinationPath: finalDestPath,
      renamed: wasRenamed,
      overwritten: wasOverwritten,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (renameErr) {
    // If rename fails (e.g., cross-device move), try copy + delete
    try {
      await fs.copyFile(sourcePath, finalDestPath);
      await fs.unlink(sourcePath);
      return {
        success: true,
        destinationPath: finalDestPath,
        renamed: wasRenamed,
        overwritten: wasOverwritten,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (copyErr) {
      return {
        success: false,
        error: `Failed to move file: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`,
      };
    }
  }
}

/**
 * Check if a destination path has a collision.
 *
 * @param destinationPath - Path to check
 * @returns Whether a file exists at that path
 */
export async function checkCollision(destinationPath: string): Promise<boolean> {
  return await fileExists(destinationPath);
}

/**
 * Get a suggested rename path for a collision.
 *
 * @param destinationPath - Original destination path
 * @returns A unique path that doesn't exist
 */
export async function getSuggestedRenamePath(destinationPath: string): Promise<string> {
  return await generateUniquePath(destinationPath, fileExists);
}

/**
 * Show the file in the system file manager.
 *
 * @param filePath - Path to the file to show
 */
export async function showFileInFolder(filePath: string): Promise<void> {
  shell.showItemInFolder(filePath);
}
