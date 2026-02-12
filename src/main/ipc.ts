import { ipcMain, BrowserWindow } from 'electron';
import { selectFiles, importDroppedPaths, ImportDroppedResult, SelectFilesResult } from './import';
import { createImageItems } from './metadata';
import type { ImageItem } from '../shared/types';

/** Result of full import with metadata extraction */
export interface ImportWithMetadataResult {
  /** Successfully imported image items */
  items: ImageItem[];
  /** Duplicate count from path deduplication */
  duplicateCount: number;
  /** Import warnings (unsupported files, etc.) */
  importWarnings: { type: string; path: string; message: string }[];
  /** Metadata extraction failures */
  metadataFailures: { path: string; reason: string }[];
}

export function registerIpcHandlers(): void {
  // Minimal ping handler for testing the bridge
  ipcMain.handle('ping', async () => {
    return 'pong';
  });

  // Select files via system dialog
  ipcMain.handle('selectFiles', async (event): Promise<SelectFilesResult> => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return await selectFiles(window);
  });

  // Import dropped paths (files and folders)
  ipcMain.handle(
    'importDroppedPaths',
    async (_event, paths: string[], existingPaths: string[] = []): Promise<ImportDroppedResult> => {
      return await importDroppedPaths(paths, existingPaths);
    }
  );

  // Full import: validate paths, extract metadata, return ImageItems
  ipcMain.handle(
    'importWithMetadata',
    async (
      _event,
      droppedPaths: string[],
      existingPaths: string[] = []
    ): Promise<ImportWithMetadataResult> => {
      // Step 1: Import and validate paths
      const importResult = await importDroppedPaths(droppedPaths, existingPaths);

      // Step 2: Extract metadata and create ImageItems
      const metadataResult = await createImageItems(importResult.paths);

      return {
        items: metadataResult.items,
        duplicateCount: importResult.duplicateCount,
        importWarnings: importResult.warnings,
        metadataFailures: metadataResult.failed,
      };
    }
  );
}
