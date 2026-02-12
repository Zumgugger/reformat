import { describe, it, expect } from 'vitest';
import {
  getParentFolderName,
  getParentFolderPath,
  resolveOutputSubfolder,
  buildOutputFolderPath,
  MIXED_SOURCE_FOLDER,
} from './paths';
import { ImageItem } from './types';

/** Helper to create a minimal file ImageItem for testing */
function createFileItem(sourcePath: string, id?: string): ImageItem {
  return {
    id: id || sourcePath,
    source: 'file',
    sourcePath,
    originalName: sourcePath.split(/[\\/]/).pop() || 'unknown',
    bytes: 1000,
    width: 100,
    height: 100,
  };
}

/** Helper to create a clipboard ImageItem for testing */
function createClipboardItem(id: string): ImageItem {
  return {
    id,
    source: 'clipboard',
    originalName: 'clipboard',
    bytes: 1000,
    width: 100,
    height: 100,
  };
}

describe('paths.ts', () => {
  describe('getParentFolderName', () => {
    it('should extract folder name from POSIX path', () => {
      expect(getParentFolderName('/Users/john/Pictures/photo.jpg')).toBe(
        'Pictures'
      );
    });

    it('should extract folder name from Windows path', () => {
      expect(getParentFolderName('C:\\Users\\john\\Pictures\\photo.jpg')).toBe(
        'Pictures'
      );
    });

    it('should handle mixed slashes', () => {
      expect(getParentFolderName('C:/Users/john\\Pictures/photo.jpg')).toBe(
        'Pictures'
      );
    });

    it('should return undefined for empty path', () => {
      expect(getParentFolderName('')).toBeUndefined();
    });

    it('should return undefined for path with only filename', () => {
      expect(getParentFolderName('photo.jpg')).toBeUndefined();
    });

    it('should handle paths with trailing slashes', () => {
      expect(getParentFolderName('/Users/john/Documents/')).toBe('john');
    });

    it('should handle root-level files', () => {
      expect(getParentFolderName('/photo.jpg')).toBeUndefined();
      expect(getParentFolderName('C:\\photo.jpg')).toBe('C:');
    });
  });

  describe('getParentFolderPath', () => {
    it('should extract folder path from POSIX path', () => {
      expect(getParentFolderPath('/Users/john/Pictures/photo.jpg')).toBe(
        '/Users/john/Pictures'
      );
    });

    it('should extract folder path from Windows path', () => {
      expect(getParentFolderPath('C:\\Users\\john\\Pictures\\photo.jpg')).toBe(
        'C:/Users/john/Pictures'
      );
    });

    it('should return undefined for empty path', () => {
      expect(getParentFolderPath('')).toBeUndefined();
    });

    it('should return undefined for path with only filename', () => {
      expect(getParentFolderPath('photo.jpg')).toBeUndefined();
    });
  });

  describe('resolveOutputSubfolder', () => {
    describe('single file', () => {
      it('should return empty string (Downloads root) for single file', () => {
        const items = [createFileItem('/Users/john/Pictures/photo.jpg')];
        expect(resolveOutputSubfolder(items)).toBe('');
      });

      it('should return empty string for single Windows path', () => {
        const items = [
          createFileItem('C:\\Users\\john\\Pictures\\photo.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('');
      });
    });

    describe('batch from one folder', () => {
      it('should return source folder name for batch from same folder', () => {
        const items = [
          createFileItem('/Users/john/Vacation/IMG_001.jpg'),
          createFileItem('/Users/john/Vacation/IMG_002.jpg'),
          createFileItem('/Users/john/Vacation/IMG_003.png'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('Vacation');
      });

      it('should handle Windows paths', () => {
        const items = [
          createFileItem('C:\\Photos\\Summer\\img1.jpg'),
          createFileItem('C:\\Photos\\Summer\\img2.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('Summer');
      });

      it('should be case-insensitive for folder comparison (Windows)', () => {
        const items = [
          createFileItem('C:\\Photos\\SUMMER\\img1.jpg'),
          createFileItem('C:\\Photos\\summer\\img2.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('SUMMER'); // First match
      });
    });

    describe('mixed source folders', () => {
      it('should return Reformat for items from different folders', () => {
        const items = [
          createFileItem('/Users/john/Vacation/IMG_001.jpg'),
          createFileItem('/Users/john/Work/doc.png'),
        ];
        expect(resolveOutputSubfolder(items)).toBe(MIXED_SOURCE_FOLDER);
      });

      it('should return Reformat for Windows paths from different folders', () => {
        const items = [
          createFileItem('C:\\Photos\\Summer\\img1.jpg'),
          createFileItem('C:\\Photos\\Winter\\img2.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe(MIXED_SOURCE_FOLDER);
      });
    });

    describe('clipboard items', () => {
      it('should return Reformat for clipboard-only items', () => {
        const items = [createClipboardItem('clip1'), createClipboardItem('clip2')];
        expect(resolveOutputSubfolder(items)).toBe(MIXED_SOURCE_FOLDER);
      });

      it('should ignore clipboard items when determining folder (single file)', () => {
        const items = [
          createClipboardItem('clip1'),
          createFileItem('/Users/john/Pictures/photo.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('');
      });

      it('should ignore clipboard items when batch from same folder', () => {
        const items = [
          createClipboardItem('clip1'),
          createFileItem('/Users/john/Vacation/IMG_001.jpg'),
          createFileItem('/Users/john/Vacation/IMG_002.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('Vacation');
      });
    });

    describe('existing destination (clipboard append during run)', () => {
      it('should use existing destination when provided', () => {
        const items = [createClipboardItem('clip1')];
        expect(resolveOutputSubfolder(items, 'ExistingFolder')).toBe(
          'ExistingFolder'
        );
      });

      it('should use existing destination even with file items', () => {
        const items = [
          createFileItem('/Users/john/Pictures/photo.jpg'),
          createClipboardItem('clip1'),
        ];
        expect(resolveOutputSubfolder(items, 'Locked')).toBe('Locked');
      });

      it('should use empty string destination for Downloads root', () => {
        const items = [createClipboardItem('clip1')];
        expect(resolveOutputSubfolder(items, '')).toBe('');
      });
    });

    describe('empty input', () => {
      it('should return Reformat for empty array', () => {
        expect(resolveOutputSubfolder([])).toBe(MIXED_SOURCE_FOLDER);
      });
    });
  });

  describe('buildOutputFolderPath', () => {
    it('should return downloads path for empty subfolder', () => {
      expect(buildOutputFolderPath('/Users/john/Downloads', '')).toBe(
        '/Users/john/Downloads'
      );
    });

    it('should append subfolder to downloads path', () => {
      expect(
        buildOutputFolderPath('/Users/john/Downloads', 'Vacation')
      ).toBe('/Users/john/Downloads/Vacation');
    });

    it('should handle Windows downloads path', () => {
      expect(
        buildOutputFolderPath('C:\\Users\\john\\Downloads', 'Vacation')
      ).toBe('C:\\Users\\john\\Downloads/Vacation');
    });

    it('should handle trailing slash in downloads path', () => {
      expect(buildOutputFolderPath('/Users/john/Downloads/', 'Test')).toBe(
        '/Users/john/Downloads/Test'
      );
    });

    it('should handle trailing backslash in Windows path', () => {
      expect(
        buildOutputFolderPath('C:\\Users\\john\\Downloads\\', 'Test')
      ).toBe('C:\\Users\\john\\Downloads/Test');
    });

    it('should handle Reformat subfolder', () => {
      expect(
        buildOutputFolderPath('/Users/john/Downloads', MIXED_SOURCE_FOLDER)
      ).toBe('/Users/john/Downloads/Reformat');
    });
  });
});
