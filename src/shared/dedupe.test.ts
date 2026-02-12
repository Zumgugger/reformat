/**
 * Unit tests for dedupe.ts
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalizePath,
  dedupePaths,
  dedupeByPath,
  isSamePath,
  findDuplicateGroups,
  mergePathsWithDedupe,
} from './dedupe';

describe('dedupe', () => {
  describe('canonicalizePath', () => {
    it('converts backslashes to forward slashes', () => {
      expect(canonicalizePath('C:\\Users\\Photos\\image.jpg')).toBe('c:/users/photos/image.jpg');
    });

    it('converts to lowercase', () => {
      expect(canonicalizePath('/Users/Photos/IMAGE.JPG')).toBe('/users/photos/image.jpg');
    });

    it('normalizes mixed case and separators', () => {
      expect(canonicalizePath('C:\\Users/Photos\\Vacation/photo.PNG')).toBe('c:/users/photos/vacation/photo.png');
    });

    it('removes trailing slash', () => {
      expect(canonicalizePath('/users/photos/')).toBe('/users/photos');
      expect(canonicalizePath('C:\\Users\\Photos\\')).toBe('c:/users/photos');
    });

    it('normalizes multiple consecutive slashes', () => {
      expect(canonicalizePath('/users//photos///image.jpg')).toBe('/users/photos/image.jpg');
    });

    it('preserves protocol slashes', () => {
      expect(canonicalizePath('file:///users/photos')).toBe('file:///users/photos');
    });

    it('handles empty string', () => {
      expect(canonicalizePath('')).toBe('');
    });

    it('handles single filename', () => {
      expect(canonicalizePath('Image.JPG')).toBe('image.jpg');
    });

    it('handles relative paths', () => {
      expect(canonicalizePath('./photos/image.jpg')).toBe('./photos/image.jpg');
      expect(canonicalizePath('../photos/image.jpg')).toBe('../photos/image.jpg');
    });

    it('handles UNC paths', () => {
      expect(canonicalizePath('\\\\server\\share\\file.jpg')).toBe('//server/share/file.jpg');
    });
  });

  describe('dedupePaths', () => {
    it('removes exact duplicate paths', () => {
      const paths = ['/photos/a.jpg', '/photos/b.jpg', '/photos/a.jpg'];
      const result = dedupePaths(paths);
      
      expect(result.unique).toEqual(['/photos/a.jpg', '/photos/b.jpg']);
      expect(result.duplicateCount).toBe(1);
      expect(result.duplicateIndices).toEqual([2]);
    });

    it('removes case-different duplicates (Windows behavior)', () => {
      const paths = ['/Photos/Image.JPG', '/photos/IMAGE.jpg', '/Photos/Other.png'];
      const result = dedupePaths(paths);
      
      expect(result.unique).toHaveLength(2);
      expect(result.duplicateCount).toBe(1);
    });

    it('removes separator-different duplicates', () => {
      const paths = ['C:\\Users\\Photos\\a.jpg', 'C:/Users/Photos/a.jpg'];
      const result = dedupePaths(paths);
      
      expect(result.unique).toHaveLength(1);
      expect(result.duplicateCount).toBe(1);
    });

    it('handles empty array', () => {
      const result = dedupePaths([]);
      expect(result.unique).toEqual([]);
      expect(result.duplicateCount).toBe(0);
    });

    it('handles single path', () => {
      const result = dedupePaths(['/photos/a.jpg']);
      expect(result.unique).toEqual(['/photos/a.jpg']);
      expect(result.duplicateCount).toBe(0);
    });

    it('handles all unique paths', () => {
      const paths = ['/a.jpg', '/b.jpg', '/c.jpg'];
      const result = dedupePaths(paths);
      
      expect(result.unique).toEqual(paths);
      expect(result.duplicateCount).toBe(0);
    });

    it('handles all duplicates', () => {
      const paths = ['/a.jpg', '/A.JPG', '/a.jpg'];
      const result = dedupePaths(paths);
      
      expect(result.unique).toHaveLength(1);
      expect(result.duplicateCount).toBe(2);
    });

    it('preserves first occurrence', () => {
      const paths = ['/Photos/ORIGINAL.jpg', '/photos/original.jpg'];
      const result = dedupePaths(paths);
      
      expect(result.unique[0]).toBe('/Photos/ORIGINAL.jpg');
    });

    it('tracks correct duplicate indices', () => {
      const paths = ['/a.jpg', '/b.jpg', '/a.jpg', '/c.jpg', '/b.jpg'];
      const result = dedupePaths(paths);
      
      expect(result.unique).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
      expect(result.duplicateIndices).toEqual([2, 4]);
    });
  });

  describe('dedupeByPath', () => {
    interface FileItem {
      id: string;
      path: string;
    }

    it('deduplicates objects by path property', () => {
      const items: FileItem[] = [
        { id: '1', path: '/photos/a.jpg' },
        { id: '2', path: '/photos/b.jpg' },
        { id: '3', path: '/Photos/A.JPG' },
      ];
      
      const result = dedupeByPath(items, (item) => item.path);
      
      expect(result.unique).toHaveLength(2);
      expect(result.unique[0].id).toBe('1');
      expect(result.unique[1].id).toBe('2');
      expect(result.duplicateCount).toBe(1);
    });

    it('preserves object references', () => {
      const items = [{ path: '/a.jpg' }, { path: '/b.jpg' }];
      const result = dedupeByPath(items, (item) => item.path);
      
      expect(result.unique[0]).toBe(items[0]);
      expect(result.unique[1]).toBe(items[1]);
    });
  });

  describe('isSamePath', () => {
    it('returns true for identical paths', () => {
      expect(isSamePath('/photos/a.jpg', '/photos/a.jpg')).toBe(true);
    });

    it('returns true for case-different paths', () => {
      expect(isSamePath('/Photos/A.JPG', '/photos/a.jpg')).toBe(true);
    });

    it('returns true for separator-different paths', () => {
      expect(isSamePath('C:\\Photos\\a.jpg', 'C:/Photos/a.jpg')).toBe(true);
    });

    it('returns false for different paths', () => {
      expect(isSamePath('/photos/a.jpg', '/photos/b.jpg')).toBe(false);
    });

    it('returns false for different directories', () => {
      expect(isSamePath('/photos/a.jpg', '/images/a.jpg')).toBe(false);
    });
  });

  describe('findDuplicateGroups', () => {
    it('groups duplicate paths together', () => {
      const paths = [
        '/Photos/A.jpg',
        '/photos/a.jpg',
        '/Photos/b.jpg',
        '/PHOTOS/A.JPG',
      ];
      
      const groups = findDuplicateGroups(paths);
      
      expect(groups.size).toBe(1);
      const aGroup = groups.get('/photos/a.jpg');
      expect(aGroup).toHaveLength(3);
      expect(aGroup).toContain('/Photos/A.jpg');
      expect(aGroup).toContain('/photos/a.jpg');
      expect(aGroup).toContain('/PHOTOS/A.JPG');
    });

    it('returns empty map when no duplicates', () => {
      const paths = ['/a.jpg', '/b.jpg', '/c.jpg'];
      const groups = findDuplicateGroups(paths);
      
      expect(groups.size).toBe(0);
    });

    it('handles multiple duplicate groups', () => {
      const paths = ['/a.jpg', '/A.jpg', '/b.jpg', '/B.jpg'];
      const groups = findDuplicateGroups(paths);
      
      expect(groups.size).toBe(2);
    });
  });

  describe('mergePathsWithDedupe', () => {
    it('merges new unique paths', () => {
      const existing = ['/photos/a.jpg', '/photos/b.jpg'];
      const newPaths = ['/photos/c.jpg', '/photos/d.jpg'];
      
      const result = mergePathsWithDedupe(existing, newPaths);
      
      expect(result.merged).toEqual([
        '/photos/a.jpg',
        '/photos/b.jpg',
        '/photos/c.jpg',
        '/photos/d.jpg',
      ]);
      expect(result.addedCount).toBe(2);
      expect(result.duplicateCount).toBe(0);
    });

    it('skips paths that already exist', () => {
      const existing = ['/photos/a.jpg', '/photos/b.jpg'];
      const newPaths = ['/photos/b.jpg', '/photos/c.jpg'];
      
      const result = mergePathsWithDedupe(existing, newPaths);
      
      expect(result.merged).toEqual([
        '/photos/a.jpg',
        '/photos/b.jpg',
        '/photos/c.jpg',
      ]);
      expect(result.addedCount).toBe(1);
      expect(result.duplicateCount).toBe(1);
    });

    it('handles case-insensitive duplicates against existing', () => {
      const existing = ['/Photos/A.jpg'];
      const newPaths = ['/photos/a.jpg', '/photos/b.jpg'];
      
      const result = mergePathsWithDedupe(existing, newPaths);
      
      expect(result.merged).toHaveLength(2);
      expect(result.addedCount).toBe(1);
      expect(result.duplicateCount).toBe(1);
    });

    it('dedupes within new paths and against existing', () => {
      const existing = ['/photos/a.jpg'];
      const newPaths = ['/photos/b.jpg', '/photos/B.jpg', '/photos/a.jpg'];
      
      const result = mergePathsWithDedupe(existing, newPaths);
      
      expect(result.merged).toEqual(['/photos/a.jpg', '/photos/b.jpg']);
      expect(result.addedCount).toBe(1);
      expect(result.duplicateCount).toBe(2); // one internal, one against existing
    });

    it('handles empty existing array', () => {
      const result = mergePathsWithDedupe([], ['/a.jpg', '/b.jpg']);
      
      expect(result.merged).toEqual(['/a.jpg', '/b.jpg']);
      expect(result.addedCount).toBe(2);
      expect(result.duplicateCount).toBe(0);
    });

    it('handles empty new paths array', () => {
      const existing = ['/a.jpg', '/b.jpg'];
      const result = mergePathsWithDedupe(existing, []);
      
      expect(result.merged).toEqual(existing);
      expect(result.addedCount).toBe(0);
      expect(result.duplicateCount).toBe(0);
    });

    it('preserves existing paths order', () => {
      const existing = ['/c.jpg', '/a.jpg', '/b.jpg'];
      const newPaths = ['/d.jpg'];
      
      const result = mergePathsWithDedupe(existing, newPaths);
      
      expect(result.merged).toEqual(['/c.jpg', '/a.jpg', '/b.jpg', '/d.jpg']);
    });
  });

  describe('Windows path normalization edge cases', () => {
    it('handles drive letter case differences', () => {
      expect(isSamePath('C:\\Photos\\a.jpg', 'c:\\Photos\\a.jpg')).toBe(true);
    });

    it('handles mixed forward/back slashes', () => {
      expect(isSamePath('C:/Photos\\Sub/a.jpg', 'C:\\Photos/Sub\\a.jpg')).toBe(true);
    });

    it('handles spaces in paths', () => {
      expect(isSamePath('C:\\My Photos\\a.jpg', 'C:/My Photos/a.jpg')).toBe(true);
    });

    it('handles unicode in paths', () => {
      expect(isSamePath('C:\\照片\\a.jpg', 'c:/照片/a.jpg')).toBe(true);
    });

    it('differentiates between different files with similar names', () => {
      expect(isSamePath('/photos/image.jpg', '/photos/image.jpeg')).toBe(false);
      expect(isSamePath('/photos/image1.jpg', '/photos/image2.jpg')).toBe(false);
    });
  });
});
