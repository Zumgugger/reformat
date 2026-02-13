import { describe, it, expect, vi } from 'vitest';
import {
  getParentFolderName,
  getParentFolderPath,
  resolveOutputSubfolder,
  buildOutputFolderPath,
  REFORMAT_SUFFIX,
  generateReformatFolderName,
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
      it('should return folder name with _reformat suffix for single file', () => {
        const items = [createFileItem('/Users/john/Pictures/photo.jpg')];
        expect(resolveOutputSubfolder(items)).toBe('Pictures_reformat');
      });

      it('should return folder name with _reformat for single Windows path', () => {
        const items = [
          createFileItem('C:\\Users\\john\\Pictures\\photo.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('Pictures_reformat');
      });
    });

    describe('batch from one folder', () => {
      it('should return source folder name with _reformat suffix for batch from same folder', () => {
        const items = [
          createFileItem('/Users/john/Vacation/IMG_001.jpg'),
          createFileItem('/Users/john/Vacation/IMG_002.jpg'),
          createFileItem('/Users/john/Vacation/IMG_003.png'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('Vacation_reformat');
      });

      it('should handle Windows paths', () => {
        const items = [
          createFileItem('C:\\Photos\\Summer\\img1.jpg'),
          createFileItem('C:\\Photos\\Summer\\img2.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('Summer_reformat');
      });

      it('should be case-insensitive for folder comparison (Windows)', () => {
        const items = [
          createFileItem('C:\\Photos\\SUMMER\\img1.jpg'),
          createFileItem('C:\\Photos\\summer\\img2.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('SUMMER_reformat'); // First match
      });
    });

    describe('mixed source folders', () => {
      it('should return date-based folder for items from different folders', () => {
        const items = [
          createFileItem('/Users/john/Vacation/IMG_001.jpg'),
          createFileItem('/Users/john/Work/doc.png'),
        ];
        const result = resolveOutputSubfolder(items);
        expect(result).toMatch(/^Reformat_\d{4}-\d{2}-\d{2}$/);
      });

      it('should return date-based folder for Windows paths from different folders', () => {
        const items = [
          createFileItem('C:\\Photos\\Summer\\img1.jpg'),
          createFileItem('C:\\Photos\\Winter\\img2.jpg'),
        ];
        const result = resolveOutputSubfolder(items);
        expect(result).toMatch(/^Reformat_\d{4}-\d{2}-\d{2}$/);
      });
    });

    describe('clipboard items', () => {
      it('should return date-based folder for clipboard-only items', () => {
        const items = [createClipboardItem('clip1'), createClipboardItem('clip2')];
        const result = resolveOutputSubfolder(items);
        expect(result).toMatch(/^Reformat_\d{4}-\d{2}-\d{2}$/);
      });

      it('should use folder name with _reformat when single file with clipboard', () => {
        const items = [
          createClipboardItem('clip1'),
          createFileItem('/Users/john/Pictures/photo.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('Pictures_reformat');
      });

      it('should use folder name with _reformat when batch from same folder with clipboard', () => {
        const items = [
          createClipboardItem('clip1'),
          createFileItem('/Users/john/Vacation/IMG_001.jpg'),
          createFileItem('/Users/john/Vacation/IMG_002.jpg'),
        ];
        expect(resolveOutputSubfolder(items)).toBe('Vacation_reformat');
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
      it('should return date-based folder for empty array', () => {
        const result = resolveOutputSubfolder([]);
        expect(result).toMatch(/^Reformat_\d{4}-\d{2}-\d{2}$/);
      });
    });

    describe('generateReformatFolderName', () => {
      it('should generate folder name in correct format', () => {
        const result = generateReformatFolderName();
        expect(result).toMatch(/^Reformat_\d{4}-\d{2}-\d{2}$/);
      });

      it('should use current date', () => {
        const now = new Date();
        const expected = `Reformat_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        expect(generateReformatFolderName()).toBe(expected);
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
        buildOutputFolderPath('/Users/john/Downloads', 'Vacation_reformat')
      ).toBe('/Users/john/Downloads\\Vacation_reformat');
    });

    it('should handle Windows downloads path', () => {
      expect(
        buildOutputFolderPath('C:\\Users\\john\\Downloads', 'Vacation_reformat')
      ).toBe('C:\\Users\\john\\Downloads\\Vacation_reformat');
    });

    it('should handle trailing slash in downloads path', () => {
      expect(buildOutputFolderPath('/Users/john/Downloads/', 'Test_reformat')).toBe(
        '/Users/john/Downloads\\Test_reformat'
      );
    });

    it('should handle trailing backslash in Windows path', () => {
      expect(
        buildOutputFolderPath('C:\\Users\\john\\Downloads\\', 'Test_reformat')
      ).toBe('C:\\Users\\john\\Downloads\\Test_reformat');
    });

    it('should handle date-based subfolder', () => {
      expect(
        buildOutputFolderPath('/Users/john/Downloads', 'Reformat_2026-02-13')
      ).toBe('/Users/john/Downloads\\Reformat_2026-02-13');
    });
  });
});
