/**
 * Crop queue state management for batch crop & export workflow.
 * When crop is enabled with multiple files, users must crop one-by-one.
 */

import type { ImageItem, Transform, Crop } from './types';
import { DEFAULT_CROP } from './types';
import { isCropActive } from '../shared/crop';
import { createIdentityTransform } from '../shared/transform';

export interface CropQueueState {
  /** Whether we are in crop queue mode */
  active: boolean;
  /** Items in the queue (order preserved) */
  items: ImageItem[];
  /** Current item index (0-based) */
  currentIndex: number;
  /** Set of completed item IDs */
  completedIds: Set<string>;
  /** Whether the queue was canceled */
  canceled: boolean;
}

export interface CropQueueCallbacks {
  /** Get the crop for an item */
  getCrop: (itemId: string) => Crop;
  /** Set the crop for an item */
  setCrop: (itemId: string, crop: Crop) => void;
  /** Get the transform for an item */
  getTransform: (itemId: string) => Transform;
  /** Set the transform for an item */
  setTransform: (itemId: string, transform: Transform) => void;
  /** Called when the queue state changes */
  onStateChange?: (state: CropQueueState) => void;
}

/**
 * Create initial crop queue state.
 */
export function createCropQueueState(): CropQueueState {
  return {
    active: false,
    items: [],
    currentIndex: 0,
    completedIds: new Set(),
    canceled: false,
  };
}

/**
 * Check if any item in the list has crop enabled.
 * Crop is "enabled" when:
 * - crop.active is true AND
 * - crop.rect differs from full image (not the whole image)
 */
export function hasAnyCropEnabled(
  items: ImageItem[],
  getCrop: (itemId: string) => Crop
): boolean {
  for (const item of items) {
    const crop = getCrop(item.id);
    if (isCropActive(crop)) {
      return true;
    }
  }
  return false;
}

/**
 * Determine if crop queue mode should be entered.
 * Queue mode is needed when:
 * - More than one item AND
 * - At least one item has crop enabled
 */
export function shouldEnterCropQueueMode(
  items: ImageItem[],
  getCrop: (itemId: string) => Crop
): boolean {
  if (items.length <= 1) {
    return false;
  }
  return hasAnyCropEnabled(items, getCrop);
}

/**
 * Enter crop queue mode.
 * Returns the new state.
 */
export function enterCropQueue(
  items: ImageItem[],
  callbacks: CropQueueCallbacks
): CropQueueState {
  const state: CropQueueState = {
    active: true,
    items: [...items], // Preserve order (queue order matches selection order)
    currentIndex: 0,
    completedIds: new Set(),
    canceled: false,
  };

  // Initialize crop for the first item if not already active
  if (state.items.length > 0) {
    const firstItem = state.items[0];
    const crop = callbacks.getCrop(firstItem.id);
    if (!crop.active) {
      const newCrop: Crop = {
        ...DEFAULT_CROP,
        active: true,
        rect: { x: 0, y: 0, width: 1, height: 1 },
      };
      callbacks.setCrop(firstItem.id, newCrop);
    }
  }

  callbacks.onStateChange?.(state);
  return state;
}

/**
 * Mark the current item as completed and advance to the next.
 * Returns the updated state.
 */
export function advanceCropQueue(
  state: CropQueueState,
  callbacks: CropQueueCallbacks
): CropQueueState {
  if (!state.active || state.canceled) {
    return state;
  }

  const currentItem = state.items[state.currentIndex];
  if (currentItem) {
    state.completedIds.add(currentItem.id);
  }

  state.currentIndex++;

  // Check if we've processed all items
  if (state.currentIndex >= state.items.length) {
    // Queue complete
    state.active = false;
    callbacks.onStateChange?.(state);
    return state;
  }

  // Reset transform for next item (per spec: "Rotate/flip resets per item when advancing")
  const nextItem = state.items[state.currentIndex];
  if (nextItem) {
    callbacks.setTransform(nextItem.id, createIdentityTransform());

    // Initialize crop if not already active
    const crop = callbacks.getCrop(nextItem.id);
    if (!crop.active) {
      const newCrop: Crop = {
        ...DEFAULT_CROP,
        active: true,
        rect: { x: 0, y: 0, width: 1, height: 1 },
      };
      callbacks.setCrop(nextItem.id, newCrop);
    }
  }

  callbacks.onStateChange?.(state);
  return state;
}

/**
 * Cancel the crop queue.
 * Returns the updated state with remaining items marked as not processed.
 */
export function cancelCropQueue(state: CropQueueState): CropQueueState {
  if (!state.active) {
    return state;
  }

  state.canceled = true;
  state.active = false;
  return state;
}

/**
 * Get the current item in the queue.
 */
export function getCurrentItem(state: CropQueueState): ImageItem | null {
  if (!state.active || state.currentIndex >= state.items.length) {
    return null;
  }
  return state.items[state.currentIndex];
}

/**
 * Get remaining items count (not yet processed or canceled).
 */
export function getRemainingCount(state: CropQueueState): number {
  return state.items.length - state.completedIds.size;
}

/**
 * Get completed items count.
 */
export function getCompletedCount(state: CropQueueState): number {
  return state.completedIds.size;
}

/**
 * Get queue progress string (e.g., "2 / 10").
 */
export function getQueueProgressString(state: CropQueueState): string {
  return `${state.currentIndex + 1} / ${state.items.length}`;
}

/**
 * Determine the status of an item in the queue.
 */
export function getItemQueueStatus(
  state: CropQueueState,
  itemId: string
): 'current' | 'done' | 'pending' | 'none' {
  if (!state.active) {
    // Check if item was completed
    if (state.completedIds.has(itemId)) {
      return 'done';
    }
    return 'none';
  }

  const index = state.items.findIndex((item) => item.id === itemId);
  if (index === -1) {
    return 'none';
  }

  if (state.completedIds.has(itemId)) {
    return 'done';
  }

  if (index === state.currentIndex) {
    return 'current';
  }

  if (index > state.currentIndex) {
    return 'pending';
  }

  return 'none';
}
