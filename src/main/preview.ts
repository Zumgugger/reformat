/**
 * Preview generation module.
 * Creates downscaled preview images as data URLs for the renderer.
 */

import sharp from 'sharp';
import type { Transform, ResizeSettings } from '../shared/types';

/** Result of preview generation */
export interface PreviewResult {
  /** Base64 data URL of the preview image */
  dataUrl: string;
  /** Preview image width */
  width: number;
  /** Preview image height */
  height: number;
  /** Original image width */
  originalWidth: number;
  /** Original image height */
  originalHeight: number;
}

/** Options for preview generation */
export interface PreviewOptions {
  /** Maximum size for the longest edge (default: 800) */
  maxSize?: number;
  /** Transform to apply to preview */
  transform?: Transform;
  /** Output format: 'jpeg' or 'png' (default: 'jpeg') */
  format?: 'jpeg' | 'png';
  /** JPEG quality (default: 80) */
  quality?: number;
}

const DEFAULT_MAX_SIZE = 800;
const DEFAULT_QUALITY = 80;

/**
 * Generate a preview image as a data URL.
 * 
 * @param filePath - Path to the source image
 * @param options - Preview generation options
 * @returns Preview result with data URL and dimensions
 */
export async function generatePreview(
  filePath: string,
  options: PreviewOptions = {}
): Promise<PreviewResult> {
  const {
    maxSize = DEFAULT_MAX_SIZE,
    transform,
    format = 'jpeg',
    quality = DEFAULT_QUALITY,
  } = options;

  // Load image and apply EXIF orientation correction
  let image = sharp(filePath).rotate();
  
  // Get metadata AFTER rotation to get correct dimensions
  const rotatedMeta = await image.clone().metadata();
  const baseWidth = rotatedMeta.width ?? 0;
  const baseHeight = rotatedMeta.height ?? 0;

  if (baseWidth === 0 || baseHeight === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Apply transform if provided
  if (transform) {
    image = applyTransform(image, transform);
  }

  // Calculate preview dimensions (fit within maxSize)
  // After rotation, we need to account for swapped dimensions
  let effectiveWidth = baseWidth;
  let effectiveHeight = baseHeight;
  
  // If we have an odd number of 90° rotations, dimensions are swapped
  if (transform && (transform.rotateSteps === 1 || transform.rotateSteps === 3)) {
    effectiveWidth = baseHeight;
    effectiveHeight = baseWidth;
  }

  const { width: previewWidth, height: previewHeight } = calculatePreviewDimensions(
    effectiveWidth,
    effectiveHeight,
    maxSize
  );

  // Resize to preview dimensions
  image = image.resize(previewWidth, previewHeight, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Encode to buffer
  let buffer: Buffer;
  let mimeType: string;

  if (format === 'png') {
    buffer = await image.png().toBuffer();
    mimeType = 'image/png';
  } else {
    buffer = await image.jpeg({ quality }).toBuffer();
    mimeType = 'image/jpeg';
  }

  // Get actual output dimensions
  const outputMeta = await sharp(buffer).metadata();
  const actualWidth = outputMeta.width ?? previewWidth;
  const actualHeight = outputMeta.height ?? previewHeight;

  // Create data URL
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    width: actualWidth,
    height: actualHeight,
    originalWidth: baseWidth,
    originalHeight: baseHeight,
  };
}

/**
 * Generate a preview from a buffer (for clipboard images).
 * 
 * @param buffer - Image buffer
 * @param options - Preview generation options
 * @returns Preview result with data URL and dimensions
 */
export async function generatePreviewFromBuffer(
  buffer: Buffer,
  options: PreviewOptions = {}
): Promise<PreviewResult> {
  const {
    maxSize = DEFAULT_MAX_SIZE,
    transform,
    format = 'jpeg',
    quality = DEFAULT_QUALITY,
  } = options;

  // Load image and get metadata
  let image = sharp(buffer);
  const metadata = await image.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Apply transform if provided
  if (transform) {
    image = applyTransform(image, transform);
  }

  // Calculate preview dimensions
  let effectiveWidth = originalWidth;
  let effectiveHeight = originalHeight;
  
  if (transform && (transform.rotateSteps === 1 || transform.rotateSteps === 3)) {
    effectiveWidth = originalHeight;
    effectiveHeight = originalWidth;
  }

  const { width: previewWidth, height: previewHeight } = calculatePreviewDimensions(
    effectiveWidth,
    effectiveHeight,
    maxSize
  );

  // Resize to preview dimensions
  image = image.resize(previewWidth, previewHeight, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Encode to buffer
  let outputBuffer: Buffer;
  let mimeType: string;

  if (format === 'png') {
    outputBuffer = await image.png().toBuffer();
    mimeType = 'image/png';
  } else {
    outputBuffer = await image.jpeg({ quality }).toBuffer();
    mimeType = 'image/jpeg';
  }

  // Get actual output dimensions
  const outputMeta = await sharp(outputBuffer).metadata();
  const actualWidth = outputMeta.width ?? previewWidth;
  const actualHeight = outputMeta.height ?? previewHeight;

  // Create data URL
  const base64 = outputBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    width: actualWidth,
    height: actualHeight,
    originalWidth,
    originalHeight,
  };
}

/**
 * Apply transform operations to a sharp instance.
 */
function applyTransform(image: sharp.Sharp, transform: Transform): sharp.Sharp {
  // Apply rotation (90° steps clockwise)
  if (transform.rotateSteps > 0) {
    const degrees = transform.rotateSteps * 90;
    image = image.rotate(degrees);
  }

  // Apply flips
  // Note: flips are applied after rotation
  if (transform.flipH) {
    image = image.flop(); // horizontal flip
  }
  if (transform.flipV) {
    image = image.flip(); // vertical flip
  }

  return image;
}

/**
 * Calculate preview dimensions maintaining aspect ratio.
 */
function calculatePreviewDimensions(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const ratio = width / height;

  if (width > height) {
    return {
      width: maxSize,
      height: Math.round(maxSize / ratio),
    };
  } else {
    return {
      width: Math.round(maxSize * ratio),
      height: maxSize,
    };
  }
}

/**
 * Apply a single transform step (for individual button clicks).
 */
export function rotateTransformCW(transform: Transform): Transform {
  const newSteps = ((transform.rotateSteps + 1) % 4) as 0 | 1 | 2 | 3;
  return { ...transform, rotateSteps: newSteps };
}

export function rotateTransformCCW(transform: Transform): Transform {
  const newSteps = ((transform.rotateSteps + 3) % 4) as 0 | 1 | 2 | 3; // +3 is same as -1 mod 4
  return { ...transform, rotateSteps: newSteps };
}

export function flipTransformH(transform: Transform): Transform {
  return { ...transform, flipH: !transform.flipH };
}

export function flipTransformV(transform: Transform): Transform {
  return { ...transform, flipV: !transform.flipV };
}

export function resetTransform(): Transform {
  return { rotateSteps: 0, flipH: false, flipV: false };
}

/**
 * Check if a transform is the identity (no changes).
 */
export function isIdentityTransform(transform: Transform): boolean {
  return transform.rotateSteps === 0 && !transform.flipH && !transform.flipV;
}

/**
 * Get effective dimensions after transform (accounting for rotation swap).
 */
export function getTransformedDimensions(
  width: number,
  height: number,
  transform: Transform
): { width: number; height: number } {
  // 90° and 270° rotations swap width and height
  if (transform.rotateSteps === 1 || transform.rotateSteps === 3) {
    return { width: height, height: width };
  }
  return { width, height };
}

/** Options for detail preview generation */
export interface DetailPreviewOptions {
  /** Region to extract (in pixels, after transform is applied) */
  region: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  /** Transform to apply before extracting region */
  transform?: Transform;
  /** Output format: 'jpeg' or 'png' (default: 'png' for quality) */
  format?: 'jpeg' | 'png';
  /** JPEG quality (default: 90) */
  quality?: number;
  /** Resize settings to apply before extracting region */
  resize?: ResizeSettings;
  /** Upscale the result to match original region dimensions (for quality comparison) */
  upscaleToOriginal?: boolean;
}

/** Result of detail preview generation */
export interface DetailPreviewResult {
  /** Base64 data URL of the detail preview */
  dataUrl: string;
  /** Actual width of the detail preview */
  width: number;
  /** Actual height of the detail preview */
  height: number;
}

/**
 * Calculate target dimensions based on resize settings.
 */
function calculateTargetDimensions(
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
      // Target MiB mode would need iterative processing
      // For now, return undefined (no resize in preview)
      return { width: undefined, height: undefined };
    
    default:
      return { width: undefined, height: undefined };
  }
}

/**
 * Generate a 1:1 detail preview for a region of the image.
 * No scaling is applied - the region is extracted at original resolution.
 * 
 * @param filePath - Path to the source image
 * @param options - Detail preview options
 * @returns Detail preview result with data URL
 */
export async function generateDetailPreview(
  filePath: string,
  options: DetailPreviewOptions
): Promise<DetailPreviewResult> {
  const {
    region,
    transform,
    format = 'jpeg',
    quality = 90,
    resize,
    upscaleToOriginal = false,
  } = options;

  // Store original region dimensions for potential upscaling
  const originalRegionWidth = region.width;
  const originalRegionHeight = region.height;

  // Load image
  let image = sharp(filePath);
  const metadata = await image.metadata();
  
  const rawWidth = metadata.width ?? 0;
  const rawHeight = metadata.height ?? 0;

  if (rawWidth === 0 || rawHeight === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Apply EXIF orientation correction
  image = image.rotate();
  
  // Calculate dimensions after EXIF auto-rotation
  // Orientations 5, 6, 7, 8 involve 90° rotations that swap dimensions
  const exifOrientation = metadata.orientation ?? 1;
  const exifSwapsDimensions = exifOrientation >= 5 && exifOrientation <= 8;
  let baseWidth = exifSwapsDimensions ? rawHeight : rawWidth;
  let baseHeight = exifSwapsDimensions ? rawWidth : rawHeight;

  // Apply transform if provided
  if (transform) {
    image = applyTransform(image, transform);
  }

  // Get effective dimensions after transform
  let effectiveWidth = baseWidth;
  let effectiveHeight = baseHeight;
  
  if (transform && (transform.rotateSteps === 1 || transform.rotateSteps === 3)) {
    effectiveWidth = baseHeight;
    effectiveHeight = baseWidth;
  }

  // Apply resize if provided (to show how detail looks after resize)
  let regionWidth = region.width;
  let regionHeight = region.height;
  let regionLeft = region.left;
  let regionTop = region.top;
  
  if (resize) {
    // Calculate target dimensions
    const targetDims = calculateTargetDimensions(effectiveWidth, effectiveHeight, resize);
    let targetWidth: number = targetDims.width ?? effectiveWidth;
    let targetHeight: number = targetDims.height ?? effectiveHeight;
    
    // If one dimension is undefined, calculate it preserving aspect ratio
    if (targetDims.width !== undefined && targetDims.height === undefined) {
      targetHeight = Math.round((targetDims.width / effectiveWidth) * effectiveHeight);
    } else if (targetDims.height !== undefined && targetDims.width === undefined) {
      targetWidth = Math.round((targetDims.height / effectiveHeight) * effectiveWidth);
    }
    
    // Ensure minimum dimensions
    targetWidth = Math.max(1, targetWidth);
    targetHeight = Math.max(1, targetHeight);
    
    // Scale the region coordinates to the resized image
    const scaleX = targetWidth / effectiveWidth;
    const scaleY = targetHeight / effectiveHeight;
    
    regionLeft = Math.round(region.left * scaleX);
    regionTop = Math.round(region.top * scaleY);
    regionWidth = Math.max(1, Math.round(region.width * scaleX));
    regionHeight = Math.max(1, Math.round(region.height * scaleY));
    
    // Resize the image and materialize to buffer first
    // (Sharp validates extract against pre-resize dimensions if both are chained)
    const resizedBuffer = await image.resize(targetWidth, targetHeight, {
      withoutEnlargement: false,
    }).toBuffer();
    
    // Load resized buffer for extraction
    image = sharp(resizedBuffer);
    
    effectiveWidth = targetWidth;
    effectiveHeight = targetHeight;
  }

  // Validate and clamp region to valid bounds
  // Ensure left/top are within image, leaving room for at least 1px extraction
  let left = Math.max(0, Math.min(effectiveWidth - 1, regionLeft));
  let top = Math.max(0, Math.min(effectiveHeight - 1, regionTop));
  
  // Calculate available space and clamp width/height
  let width = Math.max(1, Math.min(effectiveWidth - left, regionWidth));
  let height = Math.max(1, Math.min(effectiveHeight - top, regionHeight));

  // Extract the region at 1:1 (no scaling)
  image = image.extract({ left, top, width, height });

  // Track final dimensions for the result
  let finalWidth = width;
  let finalHeight = height;

  // Upscale to match original region dimensions if requested (for quality comparison)
  // This makes the quality loss visible by showing processed pixels at the same size as original
  if (upscaleToOriginal && (width !== originalRegionWidth || height !== originalRegionHeight)) {
    image = image.resize(originalRegionWidth, originalRegionHeight, {
      kernel: 'nearest', // Nearest-neighbor to show pixelation clearly
      fit: 'fill',
    });
    finalWidth = originalRegionWidth;
    finalHeight = originalRegionHeight;
  } else if (width < 100 || height < 100) {
    // Fallback: upscale very small regions so they're visible
    const scale = Math.max(2, Math.ceil(300 / Math.max(width, height)));
    const newWidth = width * scale;
    const newHeight = height * scale;
    image = image.resize(newWidth, newHeight, {
      kernel: 'nearest',
      fit: 'fill',
    });
    finalWidth = newWidth;
    finalHeight = newHeight;
  }

  // Encode to buffer
  let buffer: Buffer;
  let mimeType: string;

  if (format === 'png') {
    buffer = await image.png().toBuffer();
    mimeType = 'image/png';
  } else {
    buffer = await image.jpeg({ quality }).toBuffer();
    mimeType = 'image/jpeg';
  }

  // Create data URL
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    width: finalWidth,
    height,
  };
}

/**
 * Generate a detail preview from a buffer (for clipboard images).
 * 
 * @param buffer - Image buffer
 * @param options - Detail preview options
 * @returns Detail preview result with data URL
 */
export async function generateDetailPreviewFromBuffer(
  buffer: Buffer,
  options: DetailPreviewOptions
): Promise<DetailPreviewResult> {
  const {
    region,
    transform,
    format = 'jpeg',
    quality = 90,
    resize,
    upscaleToOriginal = false,
  } = options;

  // Store original region dimensions for potential upscaling
  const originalRegionWidth = region.width;
  const originalRegionHeight = region.height;

  // Load image
  let image = sharp(buffer);
  const metadata = await image.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Apply transform if provided (no EXIF for clipboard images)
  if (transform) {
    image = applyTransform(image, transform);
  }

  // Get effective dimensions after transform
  let effectiveWidth = originalWidth;
  let effectiveHeight = originalHeight;
  
  if (transform && (transform.rotateSteps === 1 || transform.rotateSteps === 3)) {
    effectiveWidth = originalHeight;
    effectiveHeight = originalWidth;
  }

  // Apply resize if provided (to show how detail looks after resize)
  let regionWidth = region.width;
  let regionHeight = region.height;
  let regionLeft = region.left;
  let regionTop = region.top;
  
  if (resize) {
    // Calculate target dimensions
    const targetDims = calculateTargetDimensions(effectiveWidth, effectiveHeight, resize);
    let targetWidth: number = targetDims.width ?? effectiveWidth;
    let targetHeight: number = targetDims.height ?? effectiveHeight;
    
    // If one dimension is undefined, calculate it preserving aspect ratio
    if (targetDims.width !== undefined && targetDims.height === undefined) {
      targetHeight = Math.round((targetDims.width / effectiveWidth) * effectiveHeight);
    } else if (targetDims.height !== undefined && targetDims.width === undefined) {
      targetWidth = Math.round((targetDims.height / effectiveHeight) * effectiveWidth);
    }
    
    // Ensure minimum dimensions
    targetWidth = Math.max(1, targetWidth);
    targetHeight = Math.max(1, targetHeight);
    
    // Scale the region coordinates to the resized image
    const scaleX = targetWidth / effectiveWidth;
    const scaleY = targetHeight / effectiveHeight;
    
    regionLeft = Math.round(region.left * scaleX);
    regionTop = Math.round(region.top * scaleY);
    regionWidth = Math.max(1, Math.round(region.width * scaleX));
    regionHeight = Math.max(1, Math.round(region.height * scaleY));
    
    // Resize the image and materialize to buffer first
    // (Sharp validates extract against pre-resize dimensions if both are chained)
    const resizedBuffer = await image.resize(targetWidth, targetHeight, {
      withoutEnlargement: false,
    }).toBuffer();
    
    // Load resized buffer for extraction
    image = sharp(resizedBuffer);
    
    effectiveWidth = targetWidth;
    effectiveHeight = targetHeight;
  }

  // Validate and clamp region to valid bounds
  // Ensure left/top are within image, leaving room for at least 1px extraction
  let left = Math.max(0, Math.min(effectiveWidth - 1, regionLeft));
  let top = Math.max(0, Math.min(effectiveHeight - 1, regionTop));
  
  // Calculate available space and clamp width/height
  let width = Math.max(1, Math.min(effectiveWidth - left, regionWidth));
  let height = Math.max(1, Math.min(effectiveHeight - top, regionHeight));

  // Extract the region at 1:1 (no scaling)
  image = image.extract({ left, top, width, height });

  // Track final dimensions for the result
  let finalWidth = width;
  let finalHeight = height;

  // Upscale to match original region dimensions if requested (for quality comparison)
  if (upscaleToOriginal && (width !== originalRegionWidth || height !== originalRegionHeight)) {
    image = image.resize(originalRegionWidth, originalRegionHeight, {
      kernel: 'nearest',
      fit: 'fill',
    });
    finalWidth = originalRegionWidth;
    finalHeight = originalRegionHeight;
  } else if (width < 100 || height < 100) {
    // Fallback: upscale very small regions so they're visible
    const scale = Math.max(2, Math.ceil(300 / Math.max(width, height)));
    const newWidth = width * scale;
    const newHeight = height * scale;
    image = image.resize(newWidth, newHeight, {
      kernel: 'nearest',
      fit: 'fill',
    });
    finalWidth = newWidth;
    finalHeight = newHeight;
  }

  // Encode to buffer
  let outputBuffer: Buffer;
  let mimeType: string;

  if (format === 'png') {
    outputBuffer = await image.png().toBuffer();
    mimeType = 'image/png';
  } else {
    outputBuffer = await image.jpeg({ quality }).toBuffer();
    mimeType = 'image/jpeg';
  }

  // Create data URL
  const base64 = outputBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    width: finalWidth,
    height: finalHeight,
  };
}

/** Options for original detail preview (no resize, just raw pixels) */
export interface OriginalDetailOptions {
  /** Region to extract (in pixels, after transform is applied) */
  region: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  /** Transform to apply before extracting region */
  transform?: Transform;
  /** Output format: 'jpeg' or 'png' (default: 'png' for lossless) */
  format?: 'jpeg' | 'png';
  /** JPEG quality (default: 95 for high quality original view) */
  quality?: number;
}

/**
 * Generate an original 100% detail preview (no resize, just raw pixels).
 * This shows the original quality without any processing.
 * 
 * @param filePath - Path to the source image
 * @param options - Original detail options
 * @returns Detail preview result with data URL
 */
export async function generateOriginalDetailPreview(
  filePath: string,
  options: OriginalDetailOptions
): Promise<DetailPreviewResult> {
  const {
    region,
    transform,
    format = 'png',
    quality = 95,
  } = options;

  // Load image and apply EXIF orientation correction
  let image = sharp(filePath).rotate();
  
  // Get metadata AFTER rotation to get correct dimensions
  const rotatedMeta = await image.clone().metadata();
  const baseWidth = rotatedMeta.width ?? 0;
  const baseHeight = rotatedMeta.height ?? 0;

  if (baseWidth === 0 || baseHeight === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Apply transform if provided
  if (transform) {
    image = applyTransform(image, transform);
  }

  // Get effective dimensions after transform
  let effectiveWidth = baseWidth;
  let effectiveHeight = baseHeight;
  
  if (transform && (transform.rotateSteps === 1 || transform.rotateSteps === 3)) {
    effectiveWidth = baseHeight;
    effectiveHeight = baseWidth;
  }

  // Validate and clamp region to valid bounds
  const left = Math.max(0, Math.min(effectiveWidth - 1, region.left));
  const top = Math.max(0, Math.min(effectiveHeight - 1, region.top));
  const maxWidth = effectiveWidth - left;
  const maxHeight = effectiveHeight - top;
  const width = Math.max(1, Math.min(maxWidth, region.width));
  const height = Math.max(1, Math.min(maxHeight, region.height));

  // Extract the region at 1:1 (no scaling, no resize)
  image = image.extract({ left, top, width, height });

  // Encode to buffer (use PNG for lossless original view, or high-quality JPEG)
  let buffer: Buffer;
  let mimeType: string;

  if (format === 'png') {
    buffer = await image.png().toBuffer();
    mimeType = 'image/png';
  } else {
    buffer = await image.jpeg({ quality }).toBuffer();
    mimeType = 'image/jpeg';
  }

  // Create data URL
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    width,
    height,
  };
}

/**
 * Generate an original 100% detail preview from a buffer (for clipboard images).
 * 
 * @param buffer - Image buffer
 * @param options - Original detail options
 * @returns Detail preview result with data URL
 */
export async function generateOriginalDetailPreviewFromBuffer(
  buffer: Buffer,
  options: OriginalDetailOptions
): Promise<DetailPreviewResult> {
  const {
    region,
    transform,
    format = 'png',
    quality = 95,
  } = options;

  // Load image
  let image = sharp(buffer);
  const metadata = await image.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('Invalid image dimensions');
  }

  // Apply transform if provided (no EXIF for clipboard images)
  if (transform) {
    image = applyTransform(image, transform);
  }

  // Get effective dimensions after transform
  let effectiveWidth = originalWidth;
  let effectiveHeight = originalHeight;
  
  if (transform && (transform.rotateSteps === 1 || transform.rotateSteps === 3)) {
    effectiveWidth = originalHeight;
    effectiveHeight = originalWidth;
  }

  // Validate and clamp region to valid bounds
  const left = Math.max(0, Math.min(effectiveWidth - 1, region.left));
  const top = Math.max(0, Math.min(effectiveHeight - 1, region.top));
  const maxWidth = effectiveWidth - left;
  const maxHeight = effectiveHeight - top;
  const width = Math.max(1, Math.min(maxWidth, region.width));
  const height = Math.max(1, Math.min(maxHeight, region.height));

  // Extract the region at 1:1 (no scaling, no resize)
  image = image.extract({ left, top, width, height });

  // Encode to buffer
  let outputBuffer: Buffer;
  let mimeType: string;

  if (format === 'png') {
    outputBuffer = await image.png().toBuffer();
    mimeType = 'image/png';
  } else {
    outputBuffer = await image.jpeg({ quality }).toBuffer();
    mimeType = 'image/jpeg';
  }

  // Create data URL
  const base64 = outputBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    dataUrl,
    width,
    height,
  };
}
