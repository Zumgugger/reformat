import { contextBridge, ipcRenderer } from 'electron';

/** Result of file selection */
export interface SelectFilesResult {
  paths: string[];
  cancelled: boolean;
}

/** Warning from import operation */
export interface ImportWarning {
  type: string;
  path: string;
  message: string;
}

/** Result of importing dropped paths */
export interface ImportDroppedResult {
  paths: string[];
  duplicateCount: number;
  warnings: ImportWarning[];
}

/** Image item from the main process */
export interface ImageItem {
  id: string;
  source: 'file' | 'clipboard';
  sourcePath?: string;
  originalName: string;
  bytes: number;
  width: number;
  height: number;
  format?: string;
  hasAlpha?: boolean;
}

/** Result of full import with metadata extraction */
export interface ImportWithMetadataResult {
  items: ImageItem[];
  duplicateCount: number;
  importWarnings: ImportWarning[];
  metadataFailures: { path: string; reason: string }[];
}

/** Persisted settings (interface matches shared/settings.ts) */
export interface PersistedSettings {
  version: number;
  outputFormat: string;
  resize: unknown;
  quality: {
    jpg: number;
    webp: number;
    heic: number;
  };
}

/** Run configuration snapshot */
export interface RunConfig {
  outputFormat: string;
  resizeSettings: unknown;
  quality: {
    jpg: number;
    webp: number;
    heic: number;
  };
  items: Array<{
    itemId: string;
    transform: {
      rotateSteps: 0 | 1 | 2 | 3;
      flipH: boolean;
      flipV: boolean;
    };
    crop: {
      active: boolean;
      ratioPreset: string;
      rect: { x: number; y: number; width: number; height: number };
    };
  }>;
}

/** Item status during/after a run */
export type ItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'canceled' | 'skipped';

/** Result for a single item */
export interface ItemResult {
  itemId: string;
  status: ItemStatus;
  outputPath?: string;
  outputBytes?: number;
  error?: string;
  warnings?: string[];
}

/** Transform operations */
export interface Transform {
  rotateSteps: 0 | 1 | 2 | 3;
  flipH: boolean;
  flipV: boolean;
}

/** Preview result */
export interface PreviewResult {
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

/** Preview options */
export interface PreviewOptions {
  maxSize?: number;
  transform?: Transform;
}

/** Export progress update */
export interface ExportProgress {
  runId: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  canceled: number;
  latest?: ItemResult;
}

/** Export result */
export interface ExportResult {
  runId: string;
  outputFolder: string;
  results: ItemResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    canceled: number;
  };
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('reformat', {
  // Test ping
  ping: async (): Promise<string> => {
    return await ipcRenderer.invoke('ping');
  },

  // Select files via system dialog
  selectFiles: async (): Promise<SelectFilesResult> => {
    return await ipcRenderer.invoke('selectFiles');
  },

  // Import dropped paths (files and folders)
  importDroppedPaths: async (
    paths: string[],
    existingPaths: string[] = []
  ): Promise<ImportDroppedResult> => {
    return await ipcRenderer.invoke('importDroppedPaths', paths, existingPaths);
  },

  // Full import with metadata extraction
  importWithMetadata: async (
    droppedPaths: string[],
    existingPaths: string[] = []
  ): Promise<ImportWithMetadataResult> => {
    return await ipcRenderer.invoke('importWithMetadata', droppedPaths, existingPaths);
  },

  // Load settings from disk
  loadSettings: async (): Promise<PersistedSettings> => {
    return await ipcRenderer.invoke('loadSettings');
  },

  // Save settings to disk
  saveSettings: async (settings: PersistedSettings): Promise<void> => {
    return await ipcRenderer.invoke('saveSettings', settings);
  },

  // Update settings (partial update)
  updateSettings: async (partial: Partial<PersistedSettings>): Promise<PersistedSettings> => {
    return await ipcRenderer.invoke('updateSettings', partial);
  },

  // Reset settings to defaults
  resetSettings: async (): Promise<PersistedSettings> => {
    return await ipcRenderer.invoke('resetSettings');
  },

  // === Export Run APIs ===

  // Start an export run
  startRun: async (items: ImageItem[], config: RunConfig): Promise<ExportResult> => {
    return await ipcRenderer.invoke('startRun', items, config);
  },

  // Cancel an active run
  cancelRun: async (runId: string): Promise<boolean> => {
    return await ipcRenderer.invoke('cancelRun', runId);
  },

  // Open folder in file explorer
  openFolder: async (folderPath: string): Promise<void> => {
    return await ipcRenderer.invoke('openFolder', folderPath);
  },

  // === Preview APIs ===

  // Get preview for an image
  getPreview: async (sourcePath: string, options?: PreviewOptions): Promise<PreviewResult> => {
    return await ipcRenderer.invoke('getPreview', sourcePath, options ?? {});
  },

  // Subscribe to run progress events
  onRunProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ExportProgress) => {
      callback(progress);
    };
    ipcRenderer.on('runProgress', listener);
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('runProgress', listener);
    };
  },
});
