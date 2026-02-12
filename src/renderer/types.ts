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
  Transform,
  Crop,
  CropRect,
  CropRatioPreset,
  ItemRunConfig,
  RunConfig,
  ItemStatus,
  ItemResult,
} from '../shared/types';

export { DEFAULT_TRANSFORM, DEFAULT_CROP } from '../shared/types';

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

/** Export progress update */
export interface ExportProgress {
  runId: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  canceled: number;
  latest?: {
    itemId: string;
    status: string;
    outputPath?: string;
    outputBytes?: number;
    error?: string;
    warnings?: string[];
  };
}

/** Export result */
export interface ExportResult {
  runId: string;
  outputFolder: string;
  results: Array<{
    itemId: string;
    status: string;
    outputPath?: string;
    outputBytes?: number;
    error?: string;
    warnings?: string[];
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    canceled: number;
  };
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

/** Detail preview result (1:1 region) */
export interface DetailPreviewResult {
  dataUrl: string;
  width: number;
  height: number;
}

/** Detail preview options */
export interface DetailPreviewOptions {
  region: { left: number; top: number; width: number; height: number };
  transform?: Transform;
}

/** Result of clipboard paste operation */
export interface ClipboardPasteResult {
  /** Whether an image was found in the clipboard */
  hasImage: boolean;
  /** The imported image item (if hasImage is true) */
  item?: ImageItem;
  /** Error message if something went wrong */
  error?: string;
}

/** Persisted settings type for IPC */
import type { PersistedSettings } from '../shared/settings';
import type { RunConfig } from '../shared/types';

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
  // Export run APIs
  startRun: (items: ImageItem[], config: RunConfig) => Promise<ExportResult>;
  cancelRun: (runId: string) => Promise<boolean>;
  openFolder: (folderPath: string) => Promise<void>;
  onRunProgress: (callback: (progress: ExportProgress) => void) => () => void;
  // Preview APIs
  getPreview: (sourcePath: string, options?: PreviewOptions) => Promise<PreviewResult>;
  getDetailPreview: (sourcePath: string, options: DetailPreviewOptions) => Promise<DetailPreviewResult>;
  // Clipboard APIs
  pasteFromClipboard: () => Promise<ClipboardPasteResult>;
  getClipboardPreview: (itemId: string, options?: PreviewOptions) => Promise<PreviewResult | null>;
  getClipboardDetailPreview: (itemId: string, options: DetailPreviewOptions) => Promise<DetailPreviewResult | null>;
  removeClipboardBuffer: (itemId: string) => Promise<void>;
  clearClipboardBuffers: () => Promise<void>;
}

// Extend the Window interface
declare global {
  interface Window {
    reformat: ReformatAPI;
  }
}

export {};
