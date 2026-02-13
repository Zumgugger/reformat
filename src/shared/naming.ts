/**
 * Output filename rules and collision handling.
 *
 * Rules:
 * - Minimal sanitization (Windows/macOS illegal chars)
 * - Always append `_reformat` before extension
 * - Collision suffix: -1, -2, ... until unique
 * - Injectable exists() for testability
 */

/** Characters illegal in filenames on Windows */
const WINDOWS_ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/** Characters illegal on macOS (primarily just / and null) */
const MACOS_ILLEGAL_CHARS = /[/:\x00]/g;

/** Reserved names on Windows (without extension) */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/** Suffix appended to all output filenames */
export const REFORMAT_SUFFIX = '_reformat';

/** Maximum collision attempts before giving up */
export const MAX_COLLISION_ATTEMPTS = 10000;

/**
 * Parse a filename into base name and extension.
 * @param filename - Filename (without path)
 * @returns Tuple of [baseName, extension] where extension includes the dot
 */
export function parseFilename(filename: string): [string, string] {
  const lastDot = filename.lastIndexOf('.');

  // No extension, or dot is at start (hidden file like .gitignore)
  if (lastDot <= 0) {
    return [filename, ''];
  }

  return [filename.substring(0, lastDot), filename.substring(lastDot)];
}

/**
 * Sanitize a filename for Windows and macOS.
 * Replaces illegal characters with underscores.
 * @param filename - Filename to sanitize (without path)
 * @param platform - Target platform ('win32' | 'darwin' | 'linux')
 * @returns Sanitized filename
 */
export function sanitizeFilename(
  filename: string,
  platform: 'win32' | 'darwin' | 'linux' = 'win32'
): string {
  if (!filename) return 'unnamed';

  let sanitized = filename;

  // Remove or replace illegal characters based on platform
  // We use Windows rules by default since they're most restrictive
  if (platform === 'win32' || platform === 'linux') {
    sanitized = sanitized.replace(WINDOWS_ILLEGAL_CHARS, '_');
  } else {
    sanitized = sanitized.replace(MACOS_ILLEGAL_CHARS, '_');
  }

  // Windows: trailing dots and spaces are problematic
  sanitized = sanitized.replace(/[\s.]+$/, '');

  // Ensure we have something left
  if (!sanitized) return 'unnamed';

  // Windows: handle reserved names
  const [baseName, ext] = parseFilename(sanitized);
  if (WINDOWS_RESERVED_NAMES.has(baseName.toUpperCase())) {
    sanitized = `_${baseName}${ext}`;
  }

  return sanitized;
}

/**
 * Build the output filename with _reformat suffix.
 * @param originalName - Original filename (without path)
 * @param newExtension - New extension (with dot, e.g., '.jpg') or undefined to keep original
 * @param platform - Target platform
 * @returns Output filename with _reformat suffix
 */
export function buildOutputFilename(
  originalName: string,
  newExtension?: string,
  platform: 'win32' | 'darwin' | 'linux' = 'win32'
): string {
  const sanitized = sanitizeFilename(originalName, platform);
  const [baseName, originalExt] = parseFilename(sanitized);

  const ext = newExtension !== undefined ? newExtension : originalExt;

  return `${baseName}${REFORMAT_SUFFIX}${ext}`;
}

/**
 * Resolve a unique filename by appending collision suffixes if needed.
 * @param folder - Output folder path
 * @param filename - Desired filename (already has _reformat)
 * @param exists - Async function to check if a path exists
 * @returns Promise resolving to a unique filename
 */
export async function resolveUniqueFilename(
  folder: string,
  filename: string,
  exists: (path: string) => Promise<boolean>
): Promise<string> {
  // Normalize folder path (ensure trailing slash)
  const normalizedFolder = folder.replace(/[\\/]+$/, '');
  const joinPath = (f: string) => `${normalizedFolder}/${f}`;

  // Check if the original name is available
  const fullPath = joinPath(filename);
  if (!(await exists(fullPath))) {
    return filename;
  }

  // Parse filename for collision suffix insertion
  const [baseName, ext] = parseFilename(filename);

  // Try collision suffixes
  for (let i = 1; i < MAX_COLLISION_ATTEMPTS; i++) {
    const candidate = `${baseName}-${i}${ext}`;
    const candidatePath = joinPath(candidate);

    if (!(await exists(candidatePath))) {
      return candidate;
    }
  }

  // Extremely unlikely, but handle gracefully
  throw new Error(
    `Could not find unique filename after ${MAX_COLLISION_ATTEMPTS} attempts`
  );
}

/**
 * Build the complete output filename with collision resolution.
 * This is the main entry point for output naming.
 * @param folder - Output folder path
 * @param originalName - Original filename (without path)
 * @param newExtension - New extension (with dot) or undefined to keep original
 * @param exists - Async function to check if a path exists
 * @param platform - Target platform
 * @returns Promise resolving to the full output path
 */
export async function resolveOutputPath(
  folder: string,
  originalName: string,
  newExtension: string | undefined,
  exists: (path: string) => Promise<boolean>,
  platform: 'win32' | 'darwin' | 'linux' = 'win32'
): Promise<string> {
  const outputFilename = buildOutputFilename(originalName, newExtension, platform);
  const uniqueFilename = await resolveUniqueFilename(folder, outputFilename, exists);

  const normalizedFolder = folder.replace(/[\\/]+$/, '');
  let outputPath = `${normalizedFolder}/${uniqueFilename}`;
  
  // Normalize path separators for Windows
  if (platform === 'win32') {
    outputPath = outputPath.replace(/\//g, '\\');
  }
  
  return outputPath;
}

/**
 * Get the filename for a clipboard-sourced image.
 * @returns Base filename for clipboard images
 */
export function getClipboardBasename(): string {
  return 'clipboard';
}
