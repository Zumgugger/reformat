/**
 * Type definitions for the renderer process API.
 * These match the types exposed via preload.ts contextBridge.
 */

// Re-export shared types for convenience
export type {
  OutputFormat,
  ResizeMode,
  ResizeSettings,
  ResizeSettingsPixels,
  ResizeSettingsPercent,
  ResizeSettingsTargetMiB,
  QualitySettings,
  DrivingDimension,
} from '../shared/types';

export type { PersistedSettings } from '../shared/settings';

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

/** Result of full import with metadata extraction */
export interface ImportWithMetadataResult {
  items: ImageItem[];
  duplicateCount: number;
  importWarnings: ImportWarning[];
  metadataFailures: { path: string; reason: string }[];
}

/** Persisted settings type for IPC */
import type { PersistedSettings } from '../shared/settings';

/** The reformat API exposed to the renderer */
export interface ReformatAPI {
  ping: () => Promise<string>;
  selectFiles: () => Promise<SelectFilesResult>;
  importDroppedPaths: (
    paths: string[],
    existingPaths?: string[]
  ) => Promise<ImportDroppedResult>;
  importWithMetadata: (
    droppedPaths: string[],
    existingPaths?: string[]
  ) => Promise<ImportWithMetadataResult>;
  loadSettings: () => Promise<PersistedSettings>;
  saveSettings: (settings: PersistedSettings) => Promise<void>;
  updateSettings: (partial: Partial<PersistedSettings>) => Promise<PersistedSettings>;
  resetSettings: () => Promise<PersistedSettings>;
}

// Extend the Window interface
declare global {
  interface Window {
    reformat: ReformatAPI;
  }
}

export {};
