/**
 * Shared domain types for Reformat.
 * All types here must be serializable (IPC-safe) - no functions, Buffers, or class instances.
 */

/** Source type for an image item */
export type ImageSource = 'file' | 'clipboard';

/** Represents an image item in the selection list */
export interface ImageItem {
  /** Unique identifier for this item */
  id: string;
  /** Source type: file or clipboard */
  source: ImageSource;
  /** Full path to the source file (undefined for clipboard items) */
  sourcePath?: string;
  /** Original filename without path (for display) */
  originalName: string;
  /** File size in bytes */
  bytes: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Detected image format (e.g., 'jpeg', 'png', 'heic') */
  format?: string;
  /** Whether the image has an alpha channel (best-effort detection) */
  hasAlpha?: boolean;
}

/** Transform operations applied to an image (rotate/flip) */
export interface Transform {
  /** Number of 90-degree clockwise rotation steps (0-3) */
  rotateSteps: 0 | 1 | 2 | 3;
  /** Flip horizontally */
  flipH: boolean;
  /** Flip vertically */
  flipV: boolean;
}

/** Ratio presets for crop */
export type CropRatioPreset =
  | 'original'
  | 'free'
  | '1:1'
  | '4:5'
  | '3:4'
  | '9:16'
  | '16:9'
  | '2:3'
  | '3:2';

/** Crop rectangle in normalized coordinates (0..1) */
export interface CropRect {
  /** Left edge (0..1) */
  x: number;
  /** Top edge (0..1) */
  y: number;
  /** Width (0..1) */
  width: number;
  /** Height (0..1) */
  height: number;
}

/** Crop settings for an item */
export interface Crop {
  /** Whether crop is active for this item */
  active: boolean;
  /** Selected ratio preset */
  ratioPreset: CropRatioPreset;
  /** Crop rectangle in normalized coordinates */
  rect: CropRect;
}

/** Resize mode options */
export type ResizeMode = 'pixels' | 'percent' | 'targetMiB';

/** Which dimension drives the resize when keeping aspect ratio */
export type DrivingDimension = 'width' | 'height' | 'maxSide';

/** Resize settings for pixels mode */
export interface ResizeSettingsPixels {
  mode: 'pixels';
  /** Whether to maintain aspect ratio */
  keepRatio: boolean;
  /** Which dimension drives the resize when keepRatio is true */
  driving: DrivingDimension;
  /** Target width in pixels (used when driving is 'width' or keepRatio is false) */
  width?: number;
  /** Target height in pixels (used when driving is 'height' or keepRatio is false) */
  height?: number;
  /** Target max side in pixels (used when driving is 'maxSide') */
  maxSide?: number;
}

/** Resize settings for percent mode */
export interface ResizeSettingsPercent {
  mode: 'percent';
  /** Scale percentage (e.g., 50 for 50%) */
  percent: number;
}

/** Resize settings for target MiB mode */
export interface ResizeSettingsTargetMiB {
  mode: 'targetMiB';
  /** Target file size in MiB */
  targetMiB: number;
}

/** Union of all resize settings types */
export type ResizeSettings =
  | ResizeSettingsPixels
  | ResizeSettingsPercent
  | ResizeSettingsTargetMiB;

/** Output format options */
export type OutputFormat =
  | 'same'
  | 'jpg'
  | 'png'
  | 'heic'
  | 'webp'
  | 'tiff'
  | 'bmp';

/** Quality settings per format (where applicable) */
export interface QualitySettings {
  /** JPEG quality (40-100) */
  jpg: number;
  /** WebP quality (40-100) */
  webp: number;
  /** HEIC quality (40-100) */
  heic: number;
}

/** Per-item configuration for a run */
export interface ItemRunConfig {
  /** Item ID this config applies to */
  itemId: string;
  /** Transform to apply */
  transform: Transform;
  /** Crop to apply (if active) */
  crop: Crop;
}

/** Run configuration snapshot (locked during processing) */
export interface RunConfig {
  /** Output format for this run */
  outputFormat: OutputFormat;
  /** Resize settings for this run */
  resizeSettings: ResizeSettings;
  /** Quality settings */
  quality: QualitySettings;
  /** Per-item configurations */
  items: ItemRunConfig[];
}

/** Status of an item during/after a run */
export type ItemStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'skipped';

/** Result info for a processed item */
export interface ItemResult {
  /** Item ID */
  itemId: string;
  /** Final status */
  status: ItemStatus;
  /** Output file path (if completed) */
  outputPath?: string;
  /** Output file size in bytes (if completed) */
  outputBytes?: number;
  /** Error message (if failed) */
  error?: string;
  /** Warnings generated during processing */
  warnings?: string[];
}

/** Default transform (no changes) */
export const DEFAULT_TRANSFORM: Transform = {
  rotateSteps: 0,
  flipH: false,
  flipV: false,
};

/** Default crop (full image, inactive) */
export const DEFAULT_CROP: Crop = {
  active: false,
  ratioPreset: 'original',
  rect: { x: 0, y: 0, width: 1, height: 1 },
};

/** Default quality settings */
export const DEFAULT_QUALITY: QualitySettings = {
  jpg: 85,
  webp: 85,
  heic: 85,
};
