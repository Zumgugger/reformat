/**
 * Supported image formats and validation.
 * Handles extension parsing, case-insensitivity, and animated format detection.
 */

/** Supported image file extensions (lowercase) */
export const SUPPORTED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'heic',
  'heif',
  'webp',
  'tiff',
  'tif',
  'bmp',
  'gif', // Static GIF is supported; animated GIF is rejected in validation
]);

/** Extensions that may be animated (require additional check) */
export const POTENTIALLY_ANIMATED_EXTENSIONS = new Set(['gif', 'webp']);

/**
 * Extract file extension from a path or filename.
 * Returns lowercase extension without the dot, or empty string if none.
 */
export function getExtension(pathOrFilename: string): string {
  // Handle edge cases
  if (!pathOrFilename) return '';
  
  // Get the filename part (handle both / and \ separators)
  const filename = pathOrFilename.split(/[/\\]/).pop() ?? '';
  
  // Find the last dot that's not at the start (hidden files like .gitignore)
  const lastDotIndex = filename.lastIndexOf('.');
  
  // No dot, or dot at position 0 (hidden file with no extension)
  if (lastDotIndex <= 0) return '';
  
  return filename.substring(lastDotIndex + 1).toLowerCase();
}

/**
 * Check if an extension is potentially supported (before animation check).
 * Case-insensitive.
 */
export function isExtensionSupported(extension: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * Check if a file path has a supported extension.
 */
export function hasValidExtension(pathOrFilename: string): boolean {
  const ext = getExtension(pathOrFilename);
  return ext !== '' && isExtensionSupported(ext);
}

/**
 * Check if an extension may represent an animated image.
 * These require additional validation to ensure they're not animated.
 */
export function isPotentiallyAnimated(extension: string): boolean {
  return POTENTIALLY_ANIMATED_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * Result of format validation.
 */
export interface FormatValidationResult {
  /** Whether the format is valid and supported */
  valid: boolean;
  /** Reason for rejection if invalid */
  reason?: 'unsupported-extension' | 'animated-gif' | 'animated-webp' | 'no-extension';
  /** The parsed extension (lowercase) */
  extension: string;
}

/**
 * Validate if a file is supported based on extension only.
 * Does NOT check for animation - that requires reading file contents.
 * Use validateFormatWithAnimation for full validation.
 */
export function validateExtension(pathOrFilename: string): FormatValidationResult {
  const extension = getExtension(pathOrFilename);
  
  if (!extension) {
    return {
      valid: false,
      reason: 'no-extension',
      extension: '',
    };
  }
  
  if (!isExtensionSupported(extension)) {
    return {
      valid: false,
      reason: 'unsupported-extension',
      extension,
    };
  }
  
  return {
    valid: true,
    extension,
  };
}

/**
 * Animation detection result from file analysis.
 */
export interface AnimationCheckResult {
  /** Whether the image is animated */
  isAnimated: boolean;
  /** Number of frames (1 for static) */
  frameCount: number;
}

/**
 * Validate format including animation check.
 * The animationCheck parameter provides animation info from reading the file.
 * 
 * @param pathOrFilename - File path or name
 * @param animationCheck - Result of animation analysis (undefined to skip animation check)
 */
export function validateFormatWithAnimation(
  pathOrFilename: string,
  animationCheck?: AnimationCheckResult
): FormatValidationResult {
  // First check extension
  const extensionResult = validateExtension(pathOrFilename);
  if (!extensionResult.valid) {
    return extensionResult;
  }
  
  // If no animation check provided, assume valid (static)
  if (!animationCheck) {
    return extensionResult;
  }
  
  // Check for animated content in GIF/WebP
  if (animationCheck.isAnimated) {
    const ext = extensionResult.extension;
    if (ext === 'gif') {
      return {
        valid: false,
        reason: 'animated-gif',
        extension: ext,
      };
    }
    if (ext === 'webp') {
      return {
        valid: false,
        reason: 'animated-webp',
        extension: ext,
      };
    }
    // Animated TIFF or other formats - treat as static for now
    // (Sharp will extract first frame)
  }
  
  return extensionResult;
}

/**
 * Get a human-readable description of a rejection reason.
 */
export function getRejectionMessage(reason: FormatValidationResult['reason']): string {
  switch (reason) {
    case 'unsupported-extension':
      return 'Unsupported file format';
    case 'animated-gif':
      return 'Animated GIFs are not supported';
    case 'animated-webp':
      return 'Animated WebPs are not supported';
    case 'no-extension':
      return 'File has no extension';
    default:
      return 'Unknown format error';
  }
}

/**
 * Filter an array of paths to only supported extensions.
 * Returns an object with supported paths and unsupported paths.
 */
export function filterSupportedPaths(paths: string[]): {
  supported: string[];
  unsupported: { path: string; reason: FormatValidationResult['reason'] }[];
} {
  const supported: string[] = [];
  const unsupported: { path: string; reason: FormatValidationResult['reason'] }[] = [];
  
  for (const path of paths) {
    const result = validateExtension(path);
    if (result.valid) {
      supported.push(path);
    } else {
      unsupported.push({ path, reason: result.reason });
    }
  }
  
  return { supported, unsupported };
}
