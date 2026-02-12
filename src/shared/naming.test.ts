import { describe, it, expect, vi } from 'vitest';
import {
  parseFilename,
  sanitizeFilename,
  buildOutputFilename,
  resolveUniqueFilename,
  resolveOutputPath,
  getClipboardBasename,
  REFORMAT_SUFFIX,
  MAX_COLLISION_ATTEMPTS,
} from './naming';

describe('naming.ts', () => {
  describe('parseFilename', () => {
    it('should split name and extension', () => {
      expect(parseFilename('photo.jpg')).toEqual(['photo', '.jpg']);
      expect(parseFilename('document.pdf')).toEqual(['document', '.pdf']);
    });

    it('should handle multiple dots', () => {
      expect(parseFilename('my.photo.edited.jpg')).toEqual([
        'my.photo.edited',
        '.jpg',
      ]);
    });

    it('should handle no extension', () => {
      expect(parseFilename('README')).toEqual(['README', '']);
    });

    it('should handle hidden files (dot at start)', () => {
      expect(parseFilename('.gitignore')).toEqual(['.gitignore', '']);
      expect(parseFilename('.hidden.txt')).toEqual(['.hidden', '.txt']);
    });

    it('should handle empty string', () => {
      expect(parseFilename('')).toEqual(['', '']);
    });

    it('should preserve extension case', () => {
      expect(parseFilename('Image.JPG')).toEqual(['Image', '.JPG']);
      expect(parseFilename('photo.PNG')).toEqual(['photo', '.PNG']);
    });
  });

  describe('sanitizeFilename', () => {
    it('should return unchanged valid filenames', () => {
      expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
      expect(sanitizeFilename('my-image_2023.png')).toBe('my-image_2023.png');
    });

    it('should replace Windows illegal characters', () => {
      expect(sanitizeFilename('file<name>.jpg')).toBe('file_name_.jpg');
      expect(sanitizeFilename('path/to\\file.jpg')).toBe('path_to_file.jpg');
      expect(sanitizeFilename('what?*.jpg')).toBe('what__.jpg');
      expect(sanitizeFilename('file:name.jpg')).toBe('file_name.jpg');
      expect(sanitizeFilename('pipe|char.jpg')).toBe('pipe_char.jpg');
      expect(sanitizeFilename('"quotes".jpg')).toBe('_quotes_.jpg');
    });

    it('should remove trailing dots and spaces', () => {
      expect(sanitizeFilename('file.  ')).toBe('file');
      expect(sanitizeFilename('name...')).toBe('name');
      expect(sanitizeFilename('test. . .')).toBe('test');
    });

    it('should handle empty or whitespace-only input', () => {
      expect(sanitizeFilename('')).toBe('unnamed');
      expect(sanitizeFilename('   ')).toBe('unnamed');
      expect(sanitizeFilename('...')).toBe('unnamed');
    });

    it('should prefix Windows reserved names', () => {
      expect(sanitizeFilename('CON.jpg')).toBe('_CON.jpg');
      expect(sanitizeFilename('PRN.txt')).toBe('_PRN.txt');
      expect(sanitizeFilename('AUX')).toBe('_AUX');
      expect(sanitizeFilename('NUL.png')).toBe('_NUL.png');
      expect(sanitizeFilename('COM1.bmp')).toBe('_COM1.bmp');
      expect(sanitizeFilename('LPT1.tiff')).toBe('_LPT1.tiff');
    });

    it('should be case-insensitive for reserved names', () => {
      expect(sanitizeFilename('con.jpg')).toBe('_con.jpg');
      expect(sanitizeFilename('Con.JPG')).toBe('_Con.JPG');
    });

    it('should handle control characters', () => {
      expect(sanitizeFilename('file\x00name.jpg')).toBe('file_name.jpg');
      expect(sanitizeFilename('test\x1fname.png')).toBe('test_name.png');
    });

    describe('macOS platform', () => {
      it('should replace colon and slash on macOS', () => {
        expect(sanitizeFilename('file:name.jpg', 'darwin')).toBe(
          'file_name.jpg'
        );
        expect(sanitizeFilename('path/file.jpg', 'darwin')).toBe(
          'path_file.jpg'
        );
      });

      it('should allow characters that are illegal on Windows but valid on macOS', () => {
        // macOS allows <, >, |, ?, * in filenames (though unusual)
        expect(sanitizeFilename('file<name>.jpg', 'darwin')).toBe(
          'file<name>.jpg'
        );
      });
    });
  });

  describe('buildOutputFilename', () => {
    it('should append _reformat suffix', () => {
      expect(buildOutputFilename('photo.jpg')).toBe('photo_reformat.jpg');
      expect(buildOutputFilename('image.png')).toBe('image_reformat.png');
    });

    it('should use new extension when provided', () => {
      expect(buildOutputFilename('photo.heic', '.jpg')).toBe(
        'photo_reformat.jpg'
      );
      expect(buildOutputFilename('image.bmp', '.png')).toBe(
        'image_reformat.png'
      );
    });

    it('should keep original extension when newExtension is undefined', () => {
      expect(buildOutputFilename('photo.webp', undefined)).toBe(
        'photo_reformat.webp'
      );
    });

    it('should sanitize before adding suffix', () => {
      expect(buildOutputFilename('file<name>.jpg')).toBe(
        'file_name__reformat.jpg'
      );
    });

    it('should handle files without extension', () => {
      expect(buildOutputFilename('README')).toBe('README_reformat');
      expect(buildOutputFilename('README', '.txt')).toBe('README_reformat.txt');
    });

    it('should handle empty extension', () => {
      expect(buildOutputFilename('photo.jpg', '')).toBe('photo_reformat');
    });

    it('should preserve extension case from original', () => {
      expect(buildOutputFilename('IMAGE.JPG')).toBe('IMAGE_reformat.JPG');
    });

    it('should use provided extension case', () => {
      expect(buildOutputFilename('image.JPG', '.png')).toBe(
        'image_reformat.png'
      );
    });
  });

  describe('resolveUniqueFilename', () => {
    it('should return original filename if no collision', async () => {
      const exists = vi.fn().mockResolvedValue(false);

      const result = await resolveUniqueFilename(
        '/downloads',
        'photo_reformat.jpg',
        exists
      );

      expect(result).toBe('photo_reformat.jpg');
      expect(exists).toHaveBeenCalledWith('/downloads/photo_reformat.jpg');
    });

    it('should append -1 on first collision', async () => {
      const exists = vi
        .fn()
        .mockResolvedValueOnce(true) // photo_reformat.jpg exists
        .mockResolvedValueOnce(false); // photo_reformat-1.jpg free

      const result = await resolveUniqueFilename(
        '/downloads',
        'photo_reformat.jpg',
        exists
      );

      expect(result).toBe('photo_reformat-1.jpg');
    });

    it('should increment suffix until unique', async () => {
      const exists = vi
        .fn()
        .mockResolvedValueOnce(true) // photo_reformat.jpg
        .mockResolvedValueOnce(true) // photo_reformat-1.jpg
        .mockResolvedValueOnce(true) // photo_reformat-2.jpg
        .mockResolvedValueOnce(false); // photo_reformat-3.jpg

      const result = await resolveUniqueFilename(
        '/downloads',
        'photo_reformat.jpg',
        exists
      );

      expect(result).toBe('photo_reformat-3.jpg');
      expect(exists).toHaveBeenCalledTimes(4);
    });

    it('should handle files without extension', async () => {
      const exists = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await resolveUniqueFilename(
        '/downloads',
        'README_reformat',
        exists
      );

      expect(result).toBe('README_reformat-1');
    });

    it('should normalize folder with trailing slash', async () => {
      const exists = vi.fn().mockResolvedValue(false);

      await resolveUniqueFilename(
        '/downloads/',
        'photo_reformat.jpg',
        exists
      );

      expect(exists).toHaveBeenCalledWith('/downloads/photo_reformat.jpg');
    });

    it('should handle Windows paths', async () => {
      const exists = vi.fn().mockResolvedValue(false);

      await resolveUniqueFilename(
        'C:\\Users\\Downloads\\',
        'photo_reformat.jpg',
        exists
      );

      expect(exists).toHaveBeenCalledWith(
        'C:\\Users\\Downloads/photo_reformat.jpg'
      );
    });

    it('should throw after max attempts', async () => {
      const exists = vi.fn().mockResolvedValue(true); // Always exists

      await expect(
        resolveUniqueFilename('/downloads', 'photo_reformat.jpg', exists)
      ).rejects.toThrow(`Could not find unique filename after ${MAX_COLLISION_ATTEMPTS} attempts`);
    });
  });

  describe('resolveOutputPath', () => {
    it('should return full path with sanitization and collision handling', async () => {
      const exists = vi.fn().mockResolvedValue(false);

      const result = await resolveOutputPath(
        '/downloads',
        'photo.jpg',
        undefined,
        exists
      );

      expect(result).toBe('/downloads/photo_reformat.jpg');
    });

    it('should apply new extension', async () => {
      const exists = vi.fn().mockResolvedValue(false);

      const result = await resolveOutputPath(
        '/downloads',
        'photo.heic',
        '.jpg',
        exists
      );

      expect(result).toBe('/downloads/photo_reformat.jpg');
    });

    it('should resolve collisions', async () => {
      const exists = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await resolveOutputPath(
        '/downloads',
        'photo.jpg',
        undefined,
        exists
      );

      expect(result).toBe('/downloads/photo_reformat-1.jpg');
    });

    it('should sanitize illegal characters', async () => {
      const exists = vi.fn().mockResolvedValue(false);

      const result = await resolveOutputPath(
        '/downloads',
        'file<name>.jpg',
        undefined,
        exists
      );

      expect(result).toBe('/downloads/file_name__reformat.jpg');
    });
  });

  describe('getClipboardBasename', () => {
    it('should return clipboard base name', () => {
      expect(getClipboardBasename()).toBe('clipboard');
    });
  });

  describe('REFORMAT_SUFFIX constant', () => {
    it('should be _reformat', () => {
      expect(REFORMAT_SUFFIX).toBe('_reformat');
    });
  });
});
