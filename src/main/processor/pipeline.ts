/**
 * Image processing pipeline using sharp.
 * Handles EXIF orientation, resize (pixels/percent), format conversion, and quality.
 */

import sharp from 'sharp';
import type {
  OutputFormat,
  ResizeSettings,
  QualitySettings,
  Transform,
  Crop,
} from '../../shared/types';
import { normalizedToPixelCrop, isCropActive } from '../../shared/crop';

/** Options for processing a single image */
export interface ProcessOptions {
  /** Source file path */
  sourcePath: string;
  /** Output file path */
  outputPath: string;
  /** Output format ('same' uses source format) */
  outputFormat: OutputFormat;
  /** Resize settings */
  resize: ResizeSettings;
  /** Quality settings per format */
  quality: QualitySettings;
  /** Transform (rotate/flip) */
  transform?: Transform;
  /** Crop settings (optional, for future use) */
  crop?: Crop;
  /** Source format (e.g., 'jpeg', 'png') - used when outputFormat is 'same' */
  sourceFormat?: string;
  /** Source dimensions (needed for percent resize) */
  sourceWidth?: number;
  sourceHeight?: number;
}

/** Result of processing a single image */
export interface ProcessResult {
  /** Whether processing succeeded */
  success: boolean;
  /** Output file path (if success) */
  outputPath?: string;
  /** Output file size in bytes (if success) */
  outputBytes?: number;
  /** Output dimensions */
  outputWidth?: number;
  outputHeight?: number;
  /** Error message (if failed) */
  error?: string;
  /** Warnings generated during processing */
  warnings: string[];
}

/**
 * Map OutputFormat to sharp format string.
 * Returns null for 'same' (caller should use sourceFormat).
 */
export function getSharpFormat(
  outputFormat: OutputFormat,
  sourceFormat?: string
): 'jpeg' | 'png' | 'webp' | 'tiff' | 'heif' | 'raw' | null {
  switch (outputFormat) {
    case 'same':
      return normalizeSourceFormat(sourceFormat);
    case 'jpg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'tiff':
      return 'tiff';
    case 'heic':
      return 'heif';
    case 'bmp':
      // Sharp doesn't support BMP output directly; use raw or fallback to PNG
      return 'raw';
    default:
      return null;
  }
}

/**
 * Normalize source format from metadata to sharp format.
 */
export function normalizeSourceFormat(
  format?: string
): 'jpeg' | 'png' | 'webp' | 'tiff' | 'heif' | 'raw' | null {
  if (!format) return null;
  
  const lower = format.toLowerCase();
  switch (lower) {
    case 'jpeg':
    case 'jpg':
      return 'jpeg';
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'tiff':
    case 'tif':
      return 'tiff';
    case 'heic':
    case 'heif':
      return 'heif';
    case 'gif':
      // Convert static GIF to PNG (maintains transparency)
      return 'png';
    case 'bmp':
      // Convert BMP to PNG
      return 'png';
    default:
      return null;
  }
}

/**
 * Get output file extension for the given format.
 */
export function getOutputExtension(
  outputFormat: OutputFormat,
  sourceFormat?: string
): string {
  switch (outputFormat) {
    case 'same':
      return getSourceExtension(sourceFormat);
    case 'jpg':
      return '.jpg';
    case 'png':
      return '.png';
    case 'webp':
      return '.webp';
    case 'tiff':
      return '.tiff';
    case 'heic':
      return '.heic';
    case 'bmp':
      return '.bmp';
    default:
      return '.png';
  }
}

/**
 * Get extension for source format.
 */
function getSourceExtension(format?: string): string {
  if (!format) return '.png';
  
  const lower = format.toLowerCase();
  switch (lower) {
    case 'jpeg':
    case 'jpg':
      return '.jpg';
    case 'png':
      return '.png';
    case 'webp':
      return '.webp';
    case 'tiff':
    case 'tif':
      return '.tiff';
    case 'heic':
    case 'heif':
      return '.heic';
    case 'gif':
      return '.gif';
    case 'bmp':
      return '.bmp';
    default:
      return '.png';
  }
}

/**
 * Calculate target dimensions based on resize settings.
 */
export function calculateTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  resize: ResizeSettings
): { width: number | undefined; height: number | undefined } {
  switch (resize.mode) {
    case 'percent': {
      const scale = resize.percent / 100;
      return {
        width: Math.round(sourceWidth * scale),
        height: Math.round(sourceHeight * scale),
      };
    }
    
    case 'pixels': {
      if (!resize.keepRatio) {
        // Exact dimensions
        return {
          width: resize.width,
          height: resize.height,
        };
      }
      
      // Keep ratio mode
      switch (resize.driving) {
        case 'width':
          return { width: resize.width, height: undefined };
        case 'height':
          return { width: undefined, height: resize.height };
        case 'maxSide':
          // Resize so the larger side matches maxSide
          if (sourceWidth >= sourceHeight) {
            return { width: resize.maxSide, height: undefined };
          } else {
            return { width: undefined, height: resize.maxSide };
          }
        default:
          return { width: undefined, height: undefined };
      }
    }
    
    case 'targetMiB':
      // Target MiB mode is handled separately in Phase I
      // For now, return undefined (no resize)
      return { width: undefined, height: undefined };
    
    default:
      return { width: undefined, height: undefined };
  }
}

/**
 * Get quality value for the target format.
 */
export function getQualityForFormat(
  format: 'jpeg' | 'png' | 'webp' | 'tiff' | 'heif' | 'raw' | null,
  quality: QualitySettings
): number {
  switch (format) {
    case 'jpeg':
      return quality.jpg;
    case 'webp':
      return quality.webp;
    case 'heif':
      return quality.heic;
    default:
      // PNG, TIFF, etc. don't use quality in the same way
      return 85;
  }
}

/**
 * Apply transform (rotate/flip) to a sharp instance.
 */
export function applyTransform(
  image: sharp.Sharp,
  transform?: Transform
): sharp.Sharp {
  if (!transform) return image;
  
  let result = image;
  
  // Apply rotation (90-degree steps)
  if (transform.rotateSteps > 0) {
    const degrees = transform.rotateSteps * 90;
    result = result.rotate(degrees);
  }
  
  // Apply flips
  if (transform.flipH) {
    result = result.flop(); // Horizontal flip
  }
  
  if (transform.flipV) {
    result = result.flip(); // Vertical flip
  }
  
  return result;
}

/**
 * Apply crop to a sharp instance using normalized coordinates.
 * Uses the shared crop utilities for proper coordinate conversion.
 */
export function applyCrop(
  image: sharp.Sharp,
  crop: Crop | undefined,
  width: number,
  height: number
): sharp.Sharp {
  if (!crop || !isCropActive(crop)) return image;
  
  // Use shared utility to convert normalized coords to pixels
  const pixelCrop = normalizedToPixelCrop(crop.rect, width, height);
  
  // Ensure valid dimensions
  if (pixelCrop.width <= 0 || pixelCrop.height <= 0) return image;
  
  return image.extract({
    left: pixelCrop.left,
    top: pixelCrop.top,
    width: pixelCrop.width,
    height: pixelCrop.height,
  });
}

/**
 * Process a single image.
 * 
 * @param options - Processing options
 * @returns Processing result
 */
export async function processImage(options: ProcessOptions): Promise<ProcessResult> {
  const warnings: string[] = [];
  
  try {
    // Load image and auto-rotate based on EXIF orientation
    let image = sharp(options.sourcePath).rotate();
    
    // Get metadata for dimension calculations
    const metadata = await image.metadata();
    const sourceWidth = options.sourceWidth ?? metadata.width ?? 0;
    const sourceHeight = options.sourceHeight ?? metadata.height ?? 0;
    const sourceFormat = options.sourceFormat ?? metadata.format;
    
    // Track current dimensions as we apply operations
    let currentWidth = sourceWidth;
    let currentHeight = sourceHeight;
    
    // Apply transform (rotate/flip) FIRST
    // This must come before crop so crop coordinates match what user sees
    image = applyTransform(image, options.transform);
    
    // Update dimensions if rotated 90 or 270 degrees
    if (options.transform?.rotateSteps === 1 || options.transform?.rotateSteps === 3) {
      [currentWidth, currentHeight] = [currentHeight, currentWidth];
    }
    
    // Apply crop (if active) - happens AFTER transform
    // Coordinates are relative to the transformed view (what user sees)
    if (isCropActive(options.crop)) {
      image = applyCrop(image, options.crop, currentWidth, currentHeight);
      // Update dimensions after crop
      const pixelCrop = normalizedToPixelCrop(options.crop!.rect, currentWidth, currentHeight);
      currentWidth = pixelCrop.width;
      currentHeight = pixelCrop.height;
    }
    
    // Calculate target dimensions
    const { width: targetWidth, height: targetHeight } = calculateTargetDimensions(
      currentWidth,
      currentHeight,
      options.resize
    );
    
    // Apply resize if dimensions are specified
    if (targetWidth !== undefined || targetHeight !== undefined) {
      // Skip resize if target is larger than source (don't upscale by default)
      const shouldResize = 
        (targetWidth !== undefined && targetWidth < currentWidth) ||
        (targetHeight !== undefined && targetHeight < currentHeight);
      
      if (shouldResize) {
        image = image.resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
    }
    
    // Convert to sRGB with embedded profile (best effort)
    image = image.toColorspace('srgb');
    
    // Determine output format
    const targetFormat = getSharpFormat(options.outputFormat, sourceFormat);
    const qualityValue = getQualityForFormat(targetFormat, options.quality);
    
    // Apply format-specific encoding options
    if (targetFormat === 'jpeg') {
      image = image.jpeg({ quality: qualityValue, mozjpeg: true });
    } else if (targetFormat === 'png') {
      image = image.png({ compressionLevel: 9 });
    } else if (targetFormat === 'webp') {
      image = image.webp({ quality: qualityValue });
    } else if (targetFormat === 'tiff') {
      image = image.tiff({ compression: 'lzw' });
    } else if (targetFormat === 'heif') {
      image = image.heif({ quality: qualityValue });
    } else if (targetFormat === 'raw') {
      // BMP fallback - convert to PNG instead
      image = image.png();
      warnings.push('BMP output not fully supported; saved as PNG');
    }
    
    // Write to output file
    const outputInfo = await image.toFile(options.outputPath);
    
    return {
      success: true,
      outputPath: options.outputPath,
      outputBytes: outputInfo.size,
      outputWidth: outputInfo.width,
      outputHeight: outputInfo.height,
      warnings,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: errorMessage,
      warnings,
    };
  }
}

/**
 * Check if the target format supports quality setting.
 */
export function formatSupportsQuality(format: OutputFormat | 'jpeg' | 'png' | 'webp' | 'tiff' | 'heif'): boolean {
  switch (format) {
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'heic':
    case 'heif':
      return true;
    default:
      return false;
  }
}
