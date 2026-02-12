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
import {
  generatePreview,
  generateDetailPreview,
  generatePreviewFromBuffer,
  generateDetailPreviewFromBuffer,
  type PreviewResult,
  type PreviewOptions,
  type DetailPreviewOptions,
  type DetailPreviewResult,
} from './preview';
import {
  pasteFromClipboard,
  storeClipboardBuffer,
  getClipboardBuffer,
  removeClipboardBuffer,
  clearClipboardBuffers,
  type ClipboardPasteResult,
} from './clipboard';
import {
  startDrag as startFileDrag,
  moveFile,
  checkCollision,
  getSuggestedRenamePath,
  showFileInFolder,
  type StartDragResult,
  type MoveFileResult,
} from './dragOut';
import { getAppInfo, type AppInfo } from './about';
import { checkHeicEncodeSupport, type HeicSupportResult } from './heicSupport';
import type { ImageItem, RunConfig, ItemResult, Transform } from '../shared/types';
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

  // === Preview IPC Handlers ===

  // Map of item IDs to their source paths (populated during import)
  const itemSources = new Map<string, string>();

  // Register item source path (called internally when items are imported)
  ipcMain.handle(
    'registerItemSource',
    async (_event, itemId: string, sourcePath: string): Promise<void> => {
      itemSources.set(itemId, sourcePath);
    }
  );

  // Get preview for an item
  ipcMain.handle(
    'getPreview',
    async (
      _event,
      sourcePath: string,
      options: { maxSize?: number; transform?: Transform }
    ): Promise<PreviewResult> => {
      return await generatePreview(sourcePath, {
        maxSize: options.maxSize ?? 800,
        transform: options.transform,
        format: 'jpeg',
        quality: 80,
      });
    }
  );

  // Get detail preview (1:1 region) for an item
  ipcMain.handle(
    'getDetailPreview',
    async (
      _event,
      sourcePath: string,
      options: {
        region: { left: number; top: number; width: number; height: number };
        transform?: Transform;
      }
    ): Promise<DetailPreviewResult> => {
      return await generateDetailPreview(sourcePath, {
        region: options.region,
        transform: options.transform,
        format: 'png', // Use PNG for 1:1 quality
        quality: 95,
      });
    }
  );

  // === Clipboard IPC Handlers ===

  // Paste image from clipboard
  ipcMain.handle('pasteFromClipboard', async (): Promise<ClipboardPasteResult> => {
    const result = await pasteFromClipboard();

    // If successful, store the buffer for later preview/export
    if (result.hasImage && result.item && result.buffer) {
      storeClipboardBuffer(result.item.id, result.buffer);
    }

    return result;
  });

  // Get preview for a clipboard item (uses stored buffer)
  ipcMain.handle(
    'getClipboardPreview',
    async (
      _event,
      itemId: string,
      options: { maxSize?: number; transform?: Transform }
    ): Promise<PreviewResult | null> => {
      const buffer = getClipboardBuffer(itemId);
      if (!buffer) {
        return null;
      }

      return await generatePreviewFromBuffer(buffer, {
        maxSize: options.maxSize ?? 800,
        transform: options.transform,
        format: 'jpeg',
        quality: 80,
      });
    }
  );

  // Get detail preview for a clipboard item (uses stored buffer)
  ipcMain.handle(
    'getClipboardDetailPreview',
    async (
      _event,
      itemId: string,
      options: {
        region: { left: number; top: number; width: number; height: number };
        transform?: Transform;
      }
    ): Promise<DetailPreviewResult | null> => {
      const buffer = getClipboardBuffer(itemId);
      if (!buffer) {
        return null;
      }

      return await generateDetailPreviewFromBuffer(buffer, {
        region: options.region,
        transform: options.transform,
        format: 'png',
        quality: 95,
      });
    }
  );

  // Remove a clipboard buffer (cleanup after export or removal)
  ipcMain.handle(
    'removeClipboardBuffer',
    async (_event, itemId: string): Promise<void> => {
      removeClipboardBuffer(itemId);
    }
  );

  // Clear all clipboard buffers (cleanup)
  ipcMain.handle('clearClipboardBuffers', async (): Promise<void> => {
    clearClipboardBuffers();
  });

  // === Drag-Out Export IPC Handlers ===

  // Start a drag operation for a file
  ipcMain.handle(
    'startDrag',
    async (event, filePaths: string[]): Promise<StartDragResult> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      return await startFileDrag({ files: filePaths, window });
    }
  );

  // Check if a file exists at destination (for collision detection)
  ipcMain.handle(
    'checkCollision',
    async (_event, destinationPath: string): Promise<boolean> => {
      return await checkCollision(destinationPath);
    }
  );

  // Get a suggested rename path for collision resolution
  ipcMain.handle(
    'getSuggestedRenamePath',
    async (_event, destinationPath: string): Promise<string> => {
      return await getSuggestedRenamePath(destinationPath);
    }
  );

  // Move a file with collision handling
  ipcMain.handle(
    'moveFile',
    async (
      _event,
      sourcePath: string,
      destinationPath: string,
      overwrite: boolean,
      autoRename: boolean
    ): Promise<MoveFileResult> => {
      return await moveFile(sourcePath, destinationPath, overwrite, autoRename);
    }
  );

  // Show a file in the system file manager
  ipcMain.handle(
    'showFileInFolder',
    async (_event, filePath: string): Promise<void> => {
      await showFileInFolder(filePath);
    }
  );

  // === About IPC Handler ===

  // Get app info (version, build date)
  ipcMain.handle('getAppInfo', async (): Promise<AppInfo> => {
    return getAppInfo();
  });

  // === HEIC Support IPC Handler ===

  // Check if HEIC encoding is supported
  ipcMain.handle('getHeicEncodeSupport', async (): Promise<HeicSupportResult> => {
    return await checkHeicEncodeSupport();
  });
}
