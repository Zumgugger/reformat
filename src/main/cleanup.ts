/**
 * Cleanup module for temporary files.
 * Ensures no residual temp files are left after app exit or crash.
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/** Custom user data path for testing */
let customUserDataPath: string | null = null;

/**
 * Set a custom user data path (for testing).
 */
export function setCleanupUserDataPath(customPath: string | null): void {
  customUserDataPath = customPath;
}

/**
 * Get the user data path.
 */
function getUserDataPath(): string {
  return customUserDataPath ?? app.getPath('userData');
}

/** Temp file patterns to clean up in user data directory */
const TEMP_FILE_PATTERNS = [
  /^settings\.json\.tmp$/,  // Settings temp file from atomic write
];

/**
 * Clean up leftover temp files in the user data directory.
 * Called on app startup to remove any temp files left from crashes.
 */
export async function cleanupTempFiles(): Promise<{ cleaned: string[]; errors: string[] }> {
  const cleaned: string[] = [];
  const errors: string[] = [];

  try {
    const userDataPath = getUserDataPath();
    
    // Check if directory exists
    try {
      await fs.promises.access(userDataPath);
    } catch {
      // Directory doesn't exist yet, nothing to clean
      return { cleaned, errors };
    }

    const files = await fs.promises.readdir(userDataPath);

    for (const file of files) {
      // Check if this file matches any temp file pattern
      const isTemp = TEMP_FILE_PATTERNS.some(pattern => pattern.test(file));
      
      if (isTemp) {
        const filePath = path.join(userDataPath, file);
        
        try {
          await fs.promises.unlink(filePath);
          cleaned.push(file);
          console.log(`[Cleanup] Removed temp file: ${file}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${file}: ${message}`);
          console.warn(`[Cleanup] Failed to remove temp file ${file}:`, err);
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Directory read error: ${message}`);
    console.warn('[Cleanup] Error during temp file cleanup:', err);
  }

  if (cleaned.length > 0) {
    console.log(`[Cleanup] Cleaned ${cleaned.length} temp file(s)`);
  }

  return { cleaned, errors };
}

/**
 * Clean up temp files synchronously (for shutdown).
 * Best-effort cleanup that won't throw.
 */
export function cleanupTempFilesSync(): void {
  try {
    const userDataPath = getUserDataPath();
    
    // Check if directory exists
    if (!fs.existsSync(userDataPath)) {
      return;
    }

    const files = fs.readdirSync(userDataPath);

    for (const file of files) {
      const isTemp = TEMP_FILE_PATTERNS.some(pattern => pattern.test(file));
      
      if (isTemp) {
        const filePath = path.join(userDataPath, file);
        
        try {
          fs.unlinkSync(filePath);
          console.log(`[Cleanup] Removed temp file: ${file}`);
        } catch {
          // Best-effort, ignore errors during shutdown
        }
      }
    }
  } catch {
    // Best-effort, ignore errors during shutdown
  }
}
