/**
 * Tests for collision handling module.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createBatchCollisionState,
  updateBatchState,
  needsCollisionPrompt,
  getAutoCollisionAction,
  generateRenameSuggestion,
  generateUniquePath,
  buildCollisionSummary,
  type CollisionChoice,
  type BatchCollisionState,
} from './collision';

describe('collision', () => {
  describe('createBatchCollisionState', () => {
    it('creates initial state with all zeros', () => {
      const state = createBatchCollisionState();
      expect(state).toEqual({
        overwriteAll: false,
        succeeded: 0,
        skipped: 0,
        overwritten: 0,
        renamed: 0,
      });
    });
  });

  describe('updateBatchState', () => {
    it('increments overwritten and succeeded for overwrite choice', () => {
      const state = createBatchCollisionState();
      const updated = updateBatchState(state, 'overwrite');
      expect(updated.overwritten).toBe(1);
      expect(updated.succeeded).toBe(1);
      expect(updated.overwriteAll).toBe(false);
    });

    it('sets overwriteAll and increments for overwrite-all choice', () => {
      const state = createBatchCollisionState();
      const updated = updateBatchState(state, 'overwrite-all');
      expect(updated.overwritten).toBe(1);
      expect(updated.succeeded).toBe(1);
      expect(updated.overwriteAll).toBe(true);
    });

    it('increments renamed and succeeded for rename choice', () => {
      const state = createBatchCollisionState();
      const updated = updateBatchState(state, 'rename');
      expect(updated.renamed).toBe(1);
      expect(updated.succeeded).toBe(1);
    });

    it('increments skipped for cancel choice', () => {
      const state = createBatchCollisionState();
      const updated = updateBatchState(state, 'cancel');
      expect(updated.skipped).toBe(1);
      expect(updated.succeeded).toBe(0);
    });

    it('accumulates across multiple updates', () => {
      let state = createBatchCollisionState();
      state = updateBatchState(state, 'overwrite');
      state = updateBatchState(state, 'rename');
      state = updateBatchState(state, 'cancel');
      state = updateBatchState(state, 'overwrite');

      expect(state.overwritten).toBe(2);
      expect(state.renamed).toBe(1);
      expect(state.skipped).toBe(1);
      expect(state.succeeded).toBe(3);
    });
  });

  describe('needsCollisionPrompt', () => {
    it('returns false when no collision', () => {
      const state = createBatchCollisionState();
      expect(needsCollisionPrompt(false, state)).toBe(false);
    });

    it('returns true when collision and overwriteAll is false', () => {
      const state = createBatchCollisionState();
      expect(needsCollisionPrompt(true, state)).toBe(true);
    });

    it('returns false when collision but overwriteAll is true', () => {
      let state = createBatchCollisionState();
      state = updateBatchState(state, 'overwrite-all');
      expect(needsCollisionPrompt(true, state)).toBe(false);
    });
  });

  describe('getAutoCollisionAction', () => {
    it('returns null when no collision', () => {
      const state = createBatchCollisionState();
      expect(getAutoCollisionAction(false, state)).toBeNull();
    });

    it('returns null when collision but no overwriteAll', () => {
      const state = createBatchCollisionState();
      expect(getAutoCollisionAction(true, state)).toBeNull();
    });

    it('returns overwrite when collision and overwriteAll is true', () => {
      let state = createBatchCollisionState();
      state = updateBatchState(state, 'overwrite-all');
      expect(getAutoCollisionAction(true, state)).toBe('overwrite');
    });
  });

  describe('generateRenameSuggestion', () => {
    it('appends counter to filename without extension', () => {
      expect(generateRenameSuggestion('myfile', 1)).toBe('myfile-1');
      expect(generateRenameSuggestion('myfile', 5)).toBe('myfile-5');
    });

    it('appends counter before extension', () => {
      expect(generateRenameSuggestion('photo.jpg', 1)).toBe('photo-1.jpg');
      expect(generateRenameSuggestion('document.pdf', 3)).toBe('document-3.pdf');
    });

    it('handles paths with forward slashes', () => {
      expect(generateRenameSuggestion('/home/user/photo.jpg', 1)).toBe(
        '/home/user/photo-1.jpg'
      );
    });

    it('handles paths with backslashes (Windows)', () => {
      expect(generateRenameSuggestion('C:\\Users\\test\\photo.jpg', 2)).toBe(
        'C:\\Users\\test\\photo-2.jpg'
      );
    });

    it('handles paths with mixed slashes', () => {
      expect(generateRenameSuggestion('/home/user\\subdir/photo.jpg', 1)).toBe(
        '/home/user\\subdir/photo-1.jpg'
      );
    });

    it('handles multiple dots in filename', () => {
      expect(generateRenameSuggestion('photo.backup.jpg', 1)).toBe(
        'photo.backup-1.jpg'
      );
    });

    it('handles hidden files (starting with dot)', () => {
      expect(generateRenameSuggestion('.hidden', 1)).toBe('.hidden-1');
      expect(generateRenameSuggestion('.hidden.txt', 1)).toBe('.hidden-1.txt');
    });

    it('uses default counter of 1', () => {
      expect(generateRenameSuggestion('file.txt')).toBe('file-1.txt');
    });
  });

  describe('generateUniquePath', () => {
    it('returns original path if it does not exist', async () => {
      const exists = vi.fn().mockResolvedValue(false);
      const result = await generateUniquePath('/path/to/file.txt', exists);
      expect(result).toBe('/path/to/file.txt');
      expect(exists).toHaveBeenCalledWith('/path/to/file.txt');
    });

    it('increments counter until unique path found', async () => {
      // First two attempts exist, third doesn't
      const exists = vi
        .fn()
        .mockResolvedValueOnce(true)  // /path/to/file.txt exists
        .mockResolvedValueOnce(true)  // /path/to/file-1.txt exists
        .mockResolvedValueOnce(false); // /path/to/file-2.txt doesn't exist

      const result = await generateUniquePath('/path/to/file.txt', exists);
      expect(result).toBe('/path/to/file-2.txt');
      expect(exists).toHaveBeenCalledTimes(3);
    });

    it('handles many collisions', async () => {
      // First 100 exist
      const existsFn = vi.fn().mockImplementation((path: string) => {
        const match = path.match(/-(\d+)\./);
        if (!match) return Promise.resolve(true); // Original exists
        const num = parseInt(match[1], 10);
        return Promise.resolve(num < 100);
      });

      const result = await generateUniquePath('/path/file.jpg', existsFn);
      expect(result).toBe('/path/file-100.jpg');
    });
  });

  describe('buildCollisionSummary', () => {
    it('returns "No files processed" for empty state', () => {
      const state = createBatchCollisionState();
      expect(buildCollisionSummary(state)).toBe('No files processed');
    });

    it('shows succeeded count', () => {
      const state: BatchCollisionState = {
        ...createBatchCollisionState(),
        succeeded: 5,
      };
      expect(buildCollisionSummary(state)).toBe('5 files moved');
    });

    it('uses singular "file" for 1 file', () => {
      const state: BatchCollisionState = {
        ...createBatchCollisionState(),
        succeeded: 1,
      };
      expect(buildCollisionSummary(state)).toBe('1 file moved');
    });

    it('includes overwritten count', () => {
      const state: BatchCollisionState = {
        ...createBatchCollisionState(),
        succeeded: 3,
        overwritten: 2,
      };
      expect(buildCollisionSummary(state)).toBe('3 files moved, 2 overwritten');
    });

    it('includes renamed count', () => {
      const state: BatchCollisionState = {
        ...createBatchCollisionState(),
        succeeded: 4,
        renamed: 1,
      };
      expect(buildCollisionSummary(state)).toBe('4 files moved, 1 renamed');
    });

    it('includes skipped count', () => {
      const state: BatchCollisionState = {
        ...createBatchCollisionState(),
        skipped: 2,
      };
      expect(buildCollisionSummary(state)).toBe('2 skipped');
    });

    it('combines all counts', () => {
      const state: BatchCollisionState = {
        overwriteAll: false,
        succeeded: 5,
        overwritten: 2,
        renamed: 1,
        skipped: 1,
      };
      const summary = buildCollisionSummary(state);
      expect(summary).toBe('5 files moved, 2 overwritten, 1 renamed, 1 skipped');
    });
  });
});
