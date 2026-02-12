/**
 * Renderer store for managing image items.
 * Simple reactive store with event-based updates.
 */

import type { ImageItem } from './types';
import { formatMiB } from '../shared/bytes';

/** Store state */
export interface StoreState {
  /** List of imported image items (order preserved) */
  items: ImageItem[];
  /** Whether the app is currently importing */
  importing: boolean;
  /** Last import status message */
  statusMessage: string;
  /** Warning messages from last import */
  warnings: string[];
}

/** Store event types */
export type StoreEvent = 'change' | 'items-added' | 'items-removed' | 'status';

/** Store event listener */
export type StoreListener = (state: StoreState, event: StoreEvent) => void;

/**
 * Create a new store instance.
 */
export function createStore() {
  let state: StoreState = {
    items: [],
    importing: false,
    statusMessage: 'Ready',
    warnings: [],
  };

  const listeners = new Set<StoreListener>();

  function emit(event: StoreEvent) {
    for (const listener of listeners) {
      listener(state, event);
    }
  }

  return {
    /** Get current state (read-only snapshot) */
    getState(): Readonly<StoreState> {
      return state;
    },

    /** Get existing source paths for deduplication */
    getExistingPaths(): string[] {
      return state.items
        .filter((item) => item.sourcePath)
        .map((item) => item.sourcePath!);
    },

    /** Add items to the store */
    addItems(newItems: ImageItem[]) {
      if (newItems.length === 0) return;
      
      state = {
        ...state,
        items: [...state.items, ...newItems],
      };
      emit('items-added');
      emit('change');
    },

    /** Remove items by ID */
    removeItems(ids: string[]) {
      const idSet = new Set(ids);
      const removed = state.items.filter((item) => idSet.has(item.id));
      if (removed.length === 0) return;

      state = {
        ...state,
        items: state.items.filter((item) => !idSet.has(item.id)),
      };
      emit('items-removed');
      emit('change');
    },

    /** Clear all items */
    clearItems() {
      if (state.items.length === 0) return;

      state = {
        ...state,
        items: [],
      };
      emit('items-removed');
      emit('change');
    },

    /** Set importing status */
    setImporting(importing: boolean) {
      state = {
        ...state,
        importing,
      };
      emit('status');
      emit('change');
    },

    /** Set status message */
    setStatus(message: string, warnings: string[] = []) {
      state = {
        ...state,
        statusMessage: message,
        warnings,
      };
      emit('status');
      emit('change');
    },

    /** Subscribe to state changes */
    subscribe(listener: StoreListener): () => void {
      listeners.add(listener);
      // Call immediately with current state
      listener(state, 'change');
      // Return unsubscribe function
      return () => listeners.delete(listener);
    },

    /** Check if an item exists by path */
    hasItemWithPath(path: string): boolean {
      const normalized = path.toLowerCase().replace(/\\/g, '/');
      return state.items.some(
        (item) =>
          item.sourcePath &&
          item.sourcePath.toLowerCase().replace(/\\/g, '/') === normalized
      );
    },
  };
}

/** The global store instance */
export const store = createStore();

/** Format item info for display */
export function formatItemInfo(item: ImageItem): {
  name: string;
  dimensions: string;
  size: string;
} {
  return {
    name: item.originalName,
    dimensions: `${item.width}×${item.height}`,
    size: formatMiB(item.bytes),
  };
}

export type Store = ReturnType<typeof createStore>;
