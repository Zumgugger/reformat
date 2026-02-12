/**
 * Collision handling for drag-out export.
 *
 * When dragging files out of the app to a destination, collisions may occur.
 * This module provides the logic for resolving these collisions.
 */

/** User's choice for handling a collision */
export type CollisionChoice =
  | 'overwrite'      // Overwrite this file
  | 'overwrite-all'  // Overwrite this and all subsequent collisions
  | 'rename'         // Rename this file (auto-generate unique name)
  | 'cancel';        // Cancel this file (skip it)

/** Collision decision for a batch operation */
export interface CollisionDecision {
  /** The user's choice */
  choice: CollisionChoice;
  /** Whether to apply this choice to all subsequent collisions */
  applyToAll: boolean;
}

/** Result of checking a destination for collision */
export interface CollisionCheckResult {
  /** The source file path */
  sourcePath: string;
  /** The intended destination path */
  destinationPath: string;
  /** Whether a collision exists */
  hasCollision: boolean;
  /** The suggested renamed path if collision exists */
  suggestedRenamePath?: string;
}

/** Batch collision state for handling multiple files */
export interface BatchCollisionState {
  /** Whether user has selected "overwrite all" */
  overwriteAll: boolean;
  /** Number of files successfully moved */
  succeeded: number;
  /** Number of files skipped/canceled */
  skipped: number;
  /** Number of files overwritten */
  overwritten: number;
  /** Number of files renamed */
  renamed: number;
}

/**
 * Create initial batch collision state.
 */
export function createBatchCollisionState(): BatchCollisionState {
  return {
    overwriteAll: false,
    succeeded: 0,
    skipped: 0,
    overwritten: 0,
    renamed: 0,
  };
}

/**
 * Update batch state based on collision decision.
 */
export function updateBatchState(
  state: BatchCollisionState,
  choice: CollisionChoice
): BatchCollisionState {
  const newState = { ...state };

  switch (choice) {
    case 'overwrite':
      newState.overwritten++;
      newState.succeeded++;
      break;
    case 'overwrite-all':
      newState.overwriteAll = true;
      newState.overwritten++;
      newState.succeeded++;
      break;
    case 'rename':
      newState.renamed++;
      newState.succeeded++;
      break;
    case 'cancel':
      newState.skipped++;
      break;
  }

  return newState;
}

/**
 * Determine if we need to prompt the user for a collision.
 * If overwriteAll is true, we can skip prompting.
 */
export function needsCollisionPrompt(
  hasCollision: boolean,
  state: BatchCollisionState
): boolean {
  if (!hasCollision) {
    return false;
  }
  // If user selected "overwrite all", don't prompt
  if (state.overwriteAll) {
    return false;
  }
  return true;
}

/**
 * Get the action to take for a collision when overwriteAll is enabled.
 */
export function getAutoCollisionAction(
  hasCollision: boolean,
  state: BatchCollisionState
): CollisionChoice | null {
  if (!hasCollision) {
    return null; // No collision, proceed normally
  }
  if (state.overwriteAll) {
    return 'overwrite';
  }
  return null; // Needs user prompt
}

/**
 * Parse a filename to extract base and extension.
 * @param filename - Filename (without path)
 * @returns Tuple of [baseName, extension] where extension includes the dot
 */
function parseFilename(filename: string): [string, string] {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) {
    return [filename, ''];
  }
  return [filename.substring(0, lastDot), filename.substring(lastDot)];
}

/**
 * Generate a suggested rename path by appending a counter suffix.
 * This is a pure function that suggests a name; actual collision checking
 * should be done by the caller with filesystem access.
 *
 * @param destinationPath - The original destination path
 * @param counter - Counter to append (default 1)
 * @returns The suggested renamed path
 */
export function generateRenameSuggestion(
  destinationPath: string,
  counter = 1
): string {
  // Handle both forward and back slashes
  const lastSep = Math.max(
    destinationPath.lastIndexOf('/'),
    destinationPath.lastIndexOf('\\')
  );

  const dir = lastSep >= 0 ? destinationPath.substring(0, lastSep + 1) : '';
  const filename = lastSep >= 0 ? destinationPath.substring(lastSep + 1) : destinationPath;

  const [baseName, ext] = parseFilename(filename);
  return `${dir}${baseName}-${counter}${ext}`;
}

/**
 * Generate a unique path by checking against existing paths (injectable for testing).
 *
 * @param destinationPath - The original destination path
 * @param exists - Function to check if a path exists
 * @returns A unique path that doesn't exist
 */
export async function generateUniquePath(
  destinationPath: string,
  exists: (path: string) => Promise<boolean>
): Promise<string> {
  // If original doesn't exist, use it
  if (!(await exists(destinationPath))) {
    return destinationPath;
  }

  // Try incrementing counter until we find a unique name
  let counter = 1;
  const maxAttempts = 10000;

  while (counter <= maxAttempts) {
    const suggestion = generateRenameSuggestion(destinationPath, counter);
    if (!(await exists(suggestion))) {
      return suggestion;
    }
    counter++;
  }

  // Fallback: just return with max counter (highly unlikely to happen)
  return generateRenameSuggestion(destinationPath, maxAttempts);
}

/**
 * Build a summary message for batch collision results.
 */
export function buildCollisionSummary(state: BatchCollisionState): string {
  const parts: string[] = [];

  if (state.succeeded > 0) {
    parts.push(`${state.succeeded} file${state.succeeded !== 1 ? 's' : ''} moved`);
  }
  if (state.overwritten > 0) {
    parts.push(`${state.overwritten} overwritten`);
  }
  if (state.renamed > 0) {
    parts.push(`${state.renamed} renamed`);
  }
  if (state.skipped > 0) {
    parts.push(`${state.skipped} skipped`);
  }

  return parts.join(', ') || 'No files processed';
}
