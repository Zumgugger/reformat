/**
 * De-duplication logic for file paths.
 * Handles path canonicalization and duplicate detection.
 */

/**
 * Normalize a file path for comparison.
 * - Converts to lowercase (Windows is case-insensitive)
 * - Converts backslashes to forward slashes
 * - Removes trailing slashes
 * - Normalizes multiple consecutive slashes
 */
export function canonicalizePath(filePath: string): string {
  if (!filePath) return '';
  
  return filePath
    // Convert backslashes to forward slashes
    .replace(/\\/g, '/')
    // Normalize multiple consecutive slashes (but preserve :// protocol patterns)
    // Match character that's not : or /, followed by multiple slashes -> single slash
    .replace(/([^:/])\/+/g, '$1/')
    // Also handle leading multiple slashes (UNC paths become //)
    .replace(/^\/\/+/, '//')
    // Remove trailing slash
    .replace(/\/$/, '')
    // Lowercase for case-insensitive comparison (Windows)
    .toLowerCase();
}

/**
 * Result of deduplication operation.
 */
export interface DedupeResult<T = string> {
  /** Unique items (first occurrence of each) */
  unique: T[];
  /** Number of duplicates that were removed */
  duplicateCount: number;
  /** Indices of duplicate items in the original array */
  duplicateIndices: number[];
}

/**
 * Extract the path from an item (for generic dedupe).
 * Default identity function for string arrays.
 */
export type PathExtractor<T> = (item: T) => string;

/**
 * Deduplicate an array of file paths.
 * Returns unique paths and count of duplicates.
 * First occurrence is kept, subsequent duplicates are removed.
 */
export function dedupePaths(paths: string[]): DedupeResult<string> {
  return dedupeByPath(paths, (p) => p);
}

/**
 * Deduplicate items by their file path property.
 * Generic version that works with any item type.
 * 
 * @param items - Array of items to deduplicate
 * @param getPath - Function to extract path from each item
 * @returns Dedupe result with unique items and duplicate count
 */
export function dedupeByPath<T>(
  items: T[],
  getPath: PathExtractor<T>
): DedupeResult<T> {
  const seen = new Map<string, number>(); // canonical path -> first index
  const unique: T[] = [];
  const duplicateIndices: number[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const path = getPath(item);
    const canonical = canonicalizePath(path);
    
    if (seen.has(canonical)) {
      duplicateIndices.push(i);
    } else {
      seen.set(canonical, i);
      unique.push(item);
    }
  }
  
  return {
    unique,
    duplicateCount: duplicateIndices.length,
    duplicateIndices,
  };
}

/**
 * Check if two paths refer to the same file (after canonicalization).
 */
export function isSamePath(path1: string, path2: string): boolean {
  return canonicalizePath(path1) === canonicalizePath(path2);
}

/**
 * Find duplicates in an array and return grouped results.
 * Useful for showing which paths were considered duplicates.
 */
export function findDuplicateGroups(paths: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  
  for (const path of paths) {
    const canonical = canonicalizePath(path);
    const existing = groups.get(canonical);
    if (existing) {
      existing.push(path);
    } else {
      groups.set(canonical, [path]);
    }
  }
  
  // Filter to only groups with duplicates
  const duplicateGroups = new Map<string, string[]>();
  for (const [canonical, group] of groups) {
    if (group.length > 1) {
      duplicateGroups.set(canonical, group);
    }
  }
  
  return duplicateGroups;
}

/**
 * Merge new paths into existing paths, deduplicating against existing.
 * Useful for adding dropped paths to an existing selection.
 * 
 * @param existing - Currently selected paths
 * @param newPaths - New paths to add
 * @returns Object with combined unique paths and count of duplicates (both internal and against existing)
 */
export function mergePathsWithDedupe(
  existing: string[],
  newPaths: string[]
): {
  merged: string[];
  addedCount: number;
  duplicateCount: number;
} {
  // First dedupe the new paths internally
  const dedupeNew = dedupePaths(newPaths);
  
  // Build set of existing canonical paths
  const existingSet = new Set(existing.map(canonicalizePath));
  
  // Filter new paths that aren't already in existing
  const toAdd: string[] = [];
  let duplicateAgainstExisting = 0;
  
  for (const path of dedupeNew.unique) {
    const canonical = canonicalizePath(path);
    if (existingSet.has(canonical)) {
      duplicateAgainstExisting++;
    } else {
      toAdd.push(path);
    }
  }
  
  return {
    merged: [...existing, ...toAdd],
    addedCount: toAdd.length,
    duplicateCount: dedupeNew.duplicateCount + duplicateAgainstExisting,
  };
}
