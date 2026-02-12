/**
 * Unit tests for the renderer store.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore, formatItemInfo } from './store';
import type { ImageItem } from './types';

// Helper to create test items
function createItem(id: string, overrides: Partial<ImageItem> = {}): ImageItem {
  return {
    id,
    source: 'file',
    sourcePath: `/path/to/${id}.jpg`,
    originalName: `${id}.jpg`,
    bytes: 1024 * 1024, // 1 MiB
    width: 800,
    height: 600,
    format: 'jpeg',
    hasAlpha: false,
    ...overrides,
  };
}

describe('store', () => {
  describe('createStore', () => {
    it('starts with empty state', () => {
      const store = createStore();
      const state = store.getState();

      expect(state.items).toEqual([]);
      expect(state.importing).toBe(false);
      expect(state.statusMessage).toBe('Ready');
      expect(state.warnings).toEqual([]);
    });

    it('adds items and preserves order', () => {
      const store = createStore();
      const item1 = createItem('a');
      const item2 = createItem('b');
      const item3 = createItem('c');

      store.addItems([item1, item2]);
      store.addItems([item3]);

      const state = store.getState();
      expect(state.items).toHaveLength(3);
      expect(state.items[0].id).toBe('a');
      expect(state.items[1].id).toBe('b');
      expect(state.items[2].id).toBe('c');
    });

    it('does nothing when adding empty array', () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.addItems([]);

      expect(listener).not.toHaveBeenCalled();
    });

    it('removes items by ID', () => {
      const store = createStore();
      store.addItems([createItem('a'), createItem('b'), createItem('c')]);

      store.removeItems(['b']);

      const state = store.getState();
      expect(state.items).toHaveLength(2);
      expect(state.items.map((i) => i.id)).toEqual(['a', 'c']);
    });

    it('removes multiple items at once', () => {
      const store = createStore();
      store.addItems([createItem('a'), createItem('b'), createItem('c')]);

      store.removeItems(['a', 'c']);

      const state = store.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('b');
    });

    it('does nothing when removing non-existent IDs', () => {
      const store = createStore();
      store.addItems([createItem('a')]);
      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.removeItems(['nonexistent']);

      expect(listener).not.toHaveBeenCalled();
      expect(store.getState().items).toHaveLength(1);
    });

    it('clears all items', () => {
      const store = createStore();
      store.addItems([createItem('a'), createItem('b')]);

      store.clearItems();

      expect(store.getState().items).toEqual([]);
    });

    it('does nothing when clearing empty store', () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.clearItems();

      expect(listener).not.toHaveBeenCalled();
    });

    it('sets importing status', () => {
      const store = createStore();

      store.setImporting(true);
      expect(store.getState().importing).toBe(true);

      store.setImporting(false);
      expect(store.getState().importing).toBe(false);
    });

    it('sets status message', () => {
      const store = createStore();

      store.setStatus('Importing 5 files...');
      expect(store.getState().statusMessage).toBe('Importing 5 files...');
    });

    it('sets status with warnings', () => {
      const store = createStore();

      store.setStatus('Import complete', ['Skipped 2 unsupported files']);

      const state = store.getState();
      expect(state.statusMessage).toBe('Import complete');
      expect(state.warnings).toEqual(['Skipped 2 unsupported files']);
    });

    it('returns existing paths for deduplication', () => {
      const store = createStore();
      store.addItems([
        createItem('a', { sourcePath: '/photos/a.jpg' }),
        createItem('b', { sourcePath: '/photos/b.png' }),
        createItem('c', { sourcePath: undefined, source: 'clipboard' }),
      ]);

      const paths = store.getExistingPaths();

      expect(paths).toEqual(['/photos/a.jpg', '/photos/b.png']);
    });

    it('checks if item with path exists', () => {
      const store = createStore();
      store.addItems([createItem('a', { sourcePath: '/Photos/Test.jpg' })]);

      // Exact match
      expect(store.hasItemWithPath('/Photos/Test.jpg')).toBe(true);

      // Case insensitive
      expect(store.hasItemWithPath('/photos/test.jpg')).toBe(true);

      // Separator normalization
      expect(store.hasItemWithPath('\\Photos\\Test.jpg')).toBe(true);

      // Non-existent
      expect(store.hasItemWithPath('/photos/other.jpg')).toBe(false);
    });
  });

  describe('subscription', () => {
    it('calls listener immediately with current state', () => {
      const store = createStore();
      const listener = vi.fn();

      store.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(store.getState(), 'change');
    });

    it('calls listener on state changes', () => {
      const store = createStore();
      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.addItems([createItem('a')]);

      // Should be called with 'items-added' and 'change'
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('unsubscribes correctly', () => {
      const store = createStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      listener.mockClear();

      unsubscribe();
      store.addItems([createItem('a')]);

      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', () => {
      const store = createStore();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      store.subscribe(listener1);
      store.subscribe(listener2);
      listener1.mockClear();
      listener2.mockClear();

      store.setStatus('Test');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('formatItemInfo', () => {
    it('formats item info for display', () => {
      const item = createItem('test', {
        originalName: 'vacation_photo.jpg',
        width: 1920,
        height: 1080,
        bytes: 2.5 * 1024 * 1024, // 2.5 MiB
      });

      const info = formatItemInfo(item);

      expect(info.name).toBe('vacation_photo.jpg');
      expect(info.dimensions).toBe('1920×1080');
      expect(info.size).toBe('2.5 MiB');
    });

    it('formats small file sizes', () => {
      const item = createItem('small', {
        bytes: 50 * 1024, // 50 KB
      });

      const info = formatItemInfo(item);

      expect(info.size).toBe('0.0 MiB');
    });

    it('formats large file sizes', () => {
      const item = createItem('large', {
        bytes: 100 * 1024 * 1024, // 100 MiB
      });

      const info = formatItemInfo(item);

      expect(info.size).toBe('100.0 MiB');
    });
  });

  describe('status transitions', () => {
    it('transitions from ready to processing state', () => {
      const store = createStore();
      
      expect(store.getState().statusMessage).toBe('Ready');
      expect(store.getState().importing).toBe(false);
      
      store.setImporting(true);
      store.setStatus('Processing...');
      
      expect(store.getState().importing).toBe(true);
      expect(store.getState().statusMessage).toBe('Processing...');
    });

    it('transitions to canceling state', () => {
      const store = createStore();
      store.setImporting(true);
      store.setStatus('Processing...');
      
      store.setStatus('Canceling...');
      
      expect(store.getState().statusMessage).toBe('Canceling...');
    });

    it('transitions to canceled status with count', () => {
      const store = createStore();
      store.setImporting(true);
      store.setStatus('Processing...');
      
      store.setStatus('3 converted, 2 canceled');
      store.setImporting(false);
      
      expect(store.getState().statusMessage).toBe('3 converted, 2 canceled');
      expect(store.getState().importing).toBe(false);
    });

    it('emits status events during cancel flow', () => {
      const store = createStore();
      const events: string[] = [];
      
      store.subscribe((_state, event) => {
        events.push(event);
      });
      events.length = 0; // Clear initial call
      
      // Simulate cancel flow
      store.setStatus('Processing...');
      store.setStatus('Canceling...');
      store.setStatus('2 converted, 3 canceled');
      
      // Each setStatus should emit 'status' and 'change'
      expect(events.filter(e => e === 'status').length).toBe(3);
    });

    it('can clear warnings after cancel', () => {
      const store = createStore();
      
      store.setStatus('Error occurred', ['Failed to process some files']);
      expect(store.getState().warnings).toHaveLength(1);
      
      store.setStatus('Ready');
      expect(store.getState().statusMessage).toBe('Ready');
      expect(store.getState().warnings).toEqual([]);
    });
  });
});
