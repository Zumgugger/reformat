import { ipcMain, BrowserWindow } from 'electron';
import { selectFiles, importDroppedPaths, ImportDroppedResult, SelectFilesResult } from './import';
import { createImageItems } from './metadata';
import {
  loadSettings,
  saveSettings,
  updateSettings,
  resetSettings,
} from './settingsStore';
import {
  exportImages,
  openFolder,
  generateRunId,
  createCancellationToken,
  type ExportJob,
  type ExportProgress,
  type ExportResult,
  type CancellationToken,
} from './processor/exporter';
import type { ImageItem, RunConfig, ItemResult } from '../shared/types';
import type { PersistedSettings } from '../shared/settings';

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

  // Load settings from disk
  ipcMain.handle('loadSettings', async (): Promise<PersistedSettings> => {
    return await loadSettings();
  });

  // Save settings to disk
  ipcMain.handle(
    'saveSettings',
    async (_event, settings: PersistedSettings): Promise<void> => {
      await saveSettings(settings);
    }
  );

  // Update settings (partial update)
  ipcMain.handle(
    'updateSettings',
    async (_event, partial: Partial<PersistedSettings>): Promise<PersistedSettings> => {
      return await updateSettings(partial);
    }
  );

  // Reset settings to defaults
  ipcMain.handle('resetSettings', async (): Promise<PersistedSettings> => {
    return await resetSettings();
  });

  // === Export Run IPC Handlers ===

  // Active runs and their cancellation tokens
  const activeRuns = new Map<string, CancellationToken>();

  // Start an export run
  ipcMain.handle(
    'startRun',
    async (
      event,
      items: ImageItem[],
      config: RunConfig
    ): Promise<ExportResult> => {
      const runId = generateRunId();
      const cancellationToken = createCancellationToken();
      activeRuns.set(runId, cancellationToken);

      const window = BrowserWindow.fromWebContents(event.sender);

      const job: ExportJob = {
        runId,
        items,
        config,
        cancellationToken,
      };

      // Progress callback sends updates to renderer
      const onProgress = (progress: ExportProgress) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('runProgress', progress);
        }
      };

      try {
        const result = await exportImages(job, onProgress);
        return result;
      } finally {
        activeRuns.delete(runId);
      }
    }
  );

  // Cancel an active run
  ipcMain.handle('cancelRun', async (_event, runId: string): Promise<boolean> => {
    const token = activeRuns.get(runId);
    if (token) {
      token.cancel();
      return true;
    }
    return false;
  });

  // Open output folder in file explorer
  ipcMain.handle('openFolder', async (_event, folderPath: string): Promise<void> => {
    await openFolder(folderPath);
  });
}
