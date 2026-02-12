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
});
