/**
 * Unit tests for crop queue state management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageItem, Transform, Crop } from './types';
import { DEFAULT_CROP, DEFAULT_TRANSFORM } from './types';
import {
  createCropQueueState,
  hasAnyCropEnabled,
  shouldEnterCropQueueMode,
  enterCropQueue,
  advanceCropQueue,
  cancelCropQueue,
  getCurrentItem,
  getRemainingCount,
  getCompletedCount,
  getQueueProgressString,
  getItemQueueStatus,
  type CropQueueCallbacks,
} from './cropQueue';

// Helper to create test items
function createItem(id: string, overrides: Partial<ImageItem> = {}): ImageItem {
  return {
    id,
    source: 'file',
    sourcePath: `/path/to/${id}.jpg`,
    originalName: `${id}.jpg`,
    bytes: 1024 * 1024,
    width: 800,
    height: 600,
    format: 'jpeg',
    hasAlpha: false,
    ...overrides,
  };
}

// Create mock callbacks
function createMockCallbacks(): CropQueueCallbacks & {
  crops: Map<string, Crop>;
  transforms: Map<string, Transform>;
  stateChanges: number;
} {
  const crops = new Map<string, Crop>();
  const transforms = new Map<string, Transform>();
  let stateChanges = 0;

  return {
    crops,
    transforms,
    stateChanges: 0,
    getCrop(itemId: string) {
      return crops.get(itemId) || { ...DEFAULT_CROP, rect: { ...DEFAULT_CROP.rect } };
    },
    setCrop(itemId: string, crop: Crop) {
      crops.set(itemId, crop);
    },
    getTransform(itemId: string) {
      return transforms.get(itemId) || { ...DEFAULT_TRANSFORM };
    },
    setTransform(itemId: string, transform: Transform) {
      transforms.set(itemId, transform);
    },
    onStateChange() {
      stateChanges++;
    },
  };
}

describe('cropQueue', () => {
  describe('createCropQueueState', () => {
    it('creates initial empty state', () => {
      const state = createCropQueueState();

      expect(state.active).toBe(false);
      expect(state.items).toEqual([]);
      expect(state.currentIndex).toBe(0);
      expect(state.completedIds.size).toBe(0);
      expect(state.canceled).toBe(false);
    });
  });

  describe('hasAnyCropEnabled', () => {
    it('returns false for empty items', () => {
      const callbacks = createMockCallbacks();
      expect(hasAnyCropEnabled([], callbacks.getCrop)).toBe(false);
    });

    it('returns false when no crops are active', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();

      // All default crops (not active)
      expect(hasAnyCropEnabled(items, callbacks.getCrop)).toBe(false);
    });

    it('returns false when crop is active but covers full image', () => {
      const items = [createItem('a')];
      const callbacks = createMockCallbacks();

      // Set crop as active but full image
      callbacks.setCrop('a', {
        active: true,
        ratioPreset: 'original',
        rect: { x: 0, y: 0, width: 1, height: 1 },
      });

      expect(hasAnyCropEnabled(items, callbacks.getCrop)).toBe(false);
    });

    it('returns true when at least one item has active crop different from full image', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();

      // First item has no crop
      // Second item has active crop that differs from full image
      callbacks.setCrop('b', {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      });

      expect(hasAnyCropEnabled(items, callbacks.getCrop)).toBe(true);
    });

    it('returns true when crop is active with different rect', () => {
      const items = [createItem('a')];
      const callbacks = createMockCallbacks();

      callbacks.setCrop('a', {
        active: true,
        ratioPreset: 'free',
        rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      });

      expect(hasAnyCropEnabled(items, callbacks.getCrop)).toBe(true);
    });
  });

  describe('shouldEnterCropQueueMode', () => {
    it('returns false for single item (no queue needed)', () => {
      const items = [createItem('a')];
      const callbacks = createMockCallbacks();

      callbacks.setCrop('a', {
        active: true,
        ratioPreset: '1:1',
        rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      });

      expect(shouldEnterCropQueueMode(items, callbacks.getCrop)).toBe(false);
    });

    it('returns false for multiple items without crop enabled', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();

      expect(shouldEnterCropQueueMode(items, callbacks.getCrop)).toBe(false);
    });

    it('returns true for multiple items with at least one crop enabled', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();

      // Only one item has crop enabled
      callbacks.setCrop('b', {
        active: true,
        ratioPreset: '4:5',
        rect: { x: 0, y: 0.1, width: 1, height: 0.8 },
      });

      expect(shouldEnterCropQueueMode(items, callbacks.getCrop)).toBe(true);
    });

    it('returns false for empty items', () => {
      const callbacks = createMockCallbacks();
      expect(shouldEnterCropQueueMode([], callbacks.getCrop)).toBe(false);
    });
  });

  describe('enterCropQueue', () => {
    it('creates active queue with items in order', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();

      const state = enterCropQueue(items, callbacks);

      expect(state.active).toBe(true);
      expect(state.items).toHaveLength(3);
      expect(state.items[0].id).toBe('a');
      expect(state.items[1].id).toBe('b');
      expect(state.items[2].id).toBe('c');
      expect(state.currentIndex).toBe(0);
      expect(state.completedIds.size).toBe(0);
      expect(state.canceled).toBe(false);
    });

    it('preserves queue order (matches selection order)', () => {
      const items = [createItem('z'), createItem('m'), createItem('a')];
      const callbacks = createMockCallbacks();

      const state = enterCropQueue(items, callbacks);

      expect(state.items.map((i) => i.id)).toEqual(['z', 'm', 'a']);
    });

    it('activates crop for first item if not already active', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();

      enterCropQueue(items, callbacks);

      const crop = callbacks.getCrop('a');
      expect(crop.active).toBe(true);
    });

    it('does not modify crop for first item if already active', () => {
      const items = [createItem('a')];
      const callbacks = createMockCallbacks();

      // Pre-set crop as active
      callbacks.setCrop('a', {
        active: true,
        ratioPreset: '16:9',
        rect: { x: 0, y: 0.2, width: 1, height: 0.6 },
      });

      enterCropQueue(items, callbacks);

      const crop = callbacks.getCrop('a');
      expect(crop.ratioPreset).toBe('16:9');
    });
  });

  describe('advanceCropQueue', () => {
    it('marks current item as completed', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      state = advanceCropQueue(state, callbacks);

      expect(state.completedIds.has('a')).toBe(true);
    });

    it('advances to next item', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      state = advanceCropQueue(state, callbacks);

      expect(state.currentIndex).toBe(1);
      expect(getCurrentItem(state)?.id).toBe('b');
    });

    it('resets transform for next item (per spec)', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();

      // Set a non-identity transform for item b
      callbacks.setTransform('b', {
        rotateSteps: 1,
        flipH: true,
        flipV: false,
      });

      let state = enterCropQueue(items, callbacks);
      state = advanceCropQueue(state, callbacks);

      // Transform should be reset to identity
      const transform = callbacks.getTransform('b');
      expect(transform.rotateSteps).toBe(0);
      expect(transform.flipH).toBe(false);
      expect(transform.flipV).toBe(false);
    });

    it('activates crop for next item if not already active', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();

      let state = enterCropQueue(items, callbacks);
      state = advanceCropQueue(state, callbacks);

      const crop = callbacks.getCrop('b');
      expect(crop.active).toBe(true);
    });

    it('deactivates queue when all items processed', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      state = advanceCropQueue(state, callbacks); // Process 'a'
      state = advanceCropQueue(state, callbacks); // Process 'b'

      expect(state.active).toBe(false);
      expect(state.completedIds.size).toBe(2);
    });

    it('does nothing if queue is not active', () => {
      const callbacks = createMockCallbacks();
      const state = createCropQueueState();

      const newState = advanceCropQueue(state, callbacks);

      expect(newState).toBe(state);
      expect(newState.active).toBe(false);
    });

    it('does nothing if queue is canceled', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      state = cancelCropQueue(state);
      const canceledState = advanceCropQueue(state, callbacks);

      expect(canceledState.currentIndex).toBe(0);
    });
  });

  describe('cancelCropQueue', () => {
    it('marks queue as canceled and inactive', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      state = cancelCropQueue(state);

      expect(state.canceled).toBe(true);
      expect(state.active).toBe(false);
    });

    it('preserves completed items', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      // Process one item
      state = advanceCropQueue(state, callbacks);
      // Then cancel
      state = cancelCropQueue(state);

      expect(state.completedIds.has('a')).toBe(true);
      expect(state.completedIds.size).toBe(1);
    });

    it('does nothing if queue is not active', () => {
      const state = createCropQueueState();
      const newState = cancelCropQueue(state);

      expect(newState).toBe(state);
    });
  });

  describe('getCurrentItem', () => {
    it('returns current item', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();
      const state = enterCropQueue(items, callbacks);

      expect(getCurrentItem(state)?.id).toBe('a');
    });

    it('returns null if queue is not active', () => {
      const state = createCropQueueState();
      expect(getCurrentItem(state)).toBeNull();
    });

    it('returns null if past all items', () => {
      const items = [createItem('a')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);
      state = advanceCropQueue(state, callbacks);

      expect(getCurrentItem(state)).toBeNull();
    });
  });

  describe('getRemainingCount', () => {
    it('returns total count initially', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();
      const state = enterCropQueue(items, callbacks);

      expect(getRemainingCount(state)).toBe(3);
    });

    it('decreases as items are completed', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      state = advanceCropQueue(state, callbacks);
      expect(getRemainingCount(state)).toBe(2);

      state = advanceCropQueue(state, callbacks);
      expect(getRemainingCount(state)).toBe(1);
    });
  });

  describe('getCompletedCount', () => {
    it('returns 0 initially', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();
      const state = enterCropQueue(items, callbacks);

      expect(getCompletedCount(state)).toBe(0);
    });

    it('increases as items are completed', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      state = advanceCropQueue(state, callbacks);
      expect(getCompletedCount(state)).toBe(1);

      state = advanceCropQueue(state, callbacks);
      expect(getCompletedCount(state)).toBe(2);
    });
  });

  describe('getQueueProgressString', () => {
    it('shows correct progress', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      expect(getQueueProgressString(state)).toBe('1 / 3');

      state = advanceCropQueue(state, callbacks);
      expect(getQueueProgressString(state)).toBe('2 / 3');

      state = advanceCropQueue(state, callbacks);
      expect(getQueueProgressString(state)).toBe('3 / 3');
    });
  });

  describe('getItemQueueStatus', () => {
    it('returns "current" for the current item', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();
      const state = enterCropQueue(items, callbacks);

      expect(getItemQueueStatus(state, 'a')).toBe('current');
    });

    it('returns "pending" for items after current', () => {
      const items = [createItem('a'), createItem('b'), createItem('c')];
      const callbacks = createMockCallbacks();
      const state = enterCropQueue(items, callbacks);

      expect(getItemQueueStatus(state, 'b')).toBe('pending');
      expect(getItemQueueStatus(state, 'c')).toBe('pending');
    });

    it('returns "done" for completed items', () => {
      const items = [createItem('a'), createItem('b')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      state = advanceCropQueue(state, callbacks);

      expect(getItemQueueStatus(state, 'a')).toBe('done');
    });

    it('returns "none" for items not in queue', () => {
      const items = [createItem('a')];
      const callbacks = createMockCallbacks();
      const state = enterCropQueue(items, callbacks);

      expect(getItemQueueStatus(state, 'unknown')).toBe('none');
    });

    it('returns "done" for completed items after queue finishes', () => {
      const items = [createItem('a')];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);
      state = advanceCropQueue(state, callbacks);

      // Queue is now inactive
      expect(state.active).toBe(false);
      expect(getItemQueueStatus(state, 'a')).toBe('done');
    });
  });

  describe('queue order preservation', () => {
    it('processes items in original selection order', () => {
      const items = [
        createItem('first'),
        createItem('second'),
        createItem('third'),
        createItem('fourth'),
      ];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      const processOrder: string[] = [];

      while (state.active) {
        const current = getCurrentItem(state);
        if (current) {
          processOrder.push(current.id);
        }
        state = advanceCropQueue(state, callbacks);
      }

      expect(processOrder).toEqual(['first', 'second', 'third', 'fourth']);
    });

    it('queue order matches input order regardless of item IDs', () => {
      // Items with IDs that would sort differently alphabetically
      const items = [
        createItem('zebra'),
        createItem('apple'),
        createItem('mango'),
      ];
      const callbacks = createMockCallbacks();
      let state = enterCropQueue(items, callbacks);

      expect(getCurrentItem(state)?.id).toBe('zebra');
      state = advanceCropQueue(state, callbacks);
      expect(getCurrentItem(state)?.id).toBe('apple');
      state = advanceCropQueue(state, callbacks);
      expect(getCurrentItem(state)?.id).toBe('mango');
    });
  });
});
