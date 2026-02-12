/**
 * Unit tests for supportedFormats.ts
 */
import { describe, it, expect } from 'vitest';
import {
  getExtension,
  isExtensionSupported,
  hasValidExtension,
  isPotentiallyAnimated,
  validateExtension,
  validateFormatWithAnimation,
  getRejectionMessage,
  filterSupportedPaths,
  SUPPORTED_EXTENSIONS,
} from './supportedFormats';

describe('supportedFormats', () => {
  describe('getExtension', () => {
    it('extracts simple extension', () => {
      expect(getExtension('photo.jpg')).toBe('jpg');
    });

    it('extracts extension from full path with forward slashes', () => {
      expect(getExtension('/home/user/photos/image.png')).toBe('png');
    });

    it('extracts extension from full path with backslashes', () => {
      expect(getExtension('C:\\Users\\Photos\\image.heic')).toBe('heic');
    });

    it('extracts extension from mixed path separators', () => {
      expect(getExtension('C:/Users\\Photos/subdir\\file.webp')).toBe('webp');
    });

    it('returns lowercase extension', () => {
      expect(getExtension('FILE.JPG')).toBe('jpg');
      expect(getExtension('Image.PNG')).toBe('png');
      expect(getExtension('Photo.HEIC')).toBe('heic');
    });

    it('handles multi-dot filenames', () => {
      expect(getExtension('my.photo.2024.jpg')).toBe('jpg');
      expect(getExtension('archive.tar.gz')).toBe('gz');
    });

    it('returns empty for no extension', () => {
      expect(getExtension('README')).toBe('');
      expect(getExtension('Makefile')).toBe('');
    });

    it('returns empty for hidden files without extension', () => {
      expect(getExtension('.gitignore')).toBe('');
      expect(getExtension('.htaccess')).toBe('');
    });

    it('handles hidden files with extension', () => {
      expect(getExtension('.config.json')).toBe('json');
    });

    it('returns empty for empty input', () => {
      expect(getExtension('')).toBe('');
    });

    it('handles path ending with dot', () => {
      expect(getExtension('file.')).toBe('');
    });

    it('handles unusual extensions', () => {
      expect(getExtension('doc.jpeg2000')).toBe('jpeg2000');
      expect(getExtension('file.a')).toBe('a');
    });

    it('handles spaces in filename', () => {
      expect(getExtension('my photo.jpg')).toBe('jpg');
      expect(getExtension('/path/to/my photo file.png')).toBe('png');
    });

    it('handles unicode in filename', () => {
      expect(getExtension('фото.jpg')).toBe('jpg');
      expect(getExtension('照片.png')).toBe('png');
    });
  });

  describe('isExtensionSupported', () => {
    it('accepts jpg', () => {
      expect(isExtensionSupported('jpg')).toBe(true);
    });

    it('accepts jpeg', () => {
      expect(isExtensionSupported('jpeg')).toBe(true);
    });

    it('accepts png', () => {
      expect(isExtensionSupported('png')).toBe(true);
    });

    it('accepts heic', () => {
      expect(isExtensionSupported('heic')).toBe(true);
    });

    it('accepts heif', () => {
      expect(isExtensionSupported('heif')).toBe(true);
    });

    it('accepts webp', () => {
      expect(isExtensionSupported('webp')).toBe(true);
    });

    it('accepts tiff', () => {
      expect(isExtensionSupported('tiff')).toBe(true);
    });

    it('accepts tif', () => {
      expect(isExtensionSupported('tif')).toBe(true);
    });

    it('accepts bmp', () => {
      expect(isExtensionSupported('bmp')).toBe(true);
    });

    it('accepts gif (static only)', () => {
      expect(isExtensionSupported('gif')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isExtensionSupported('JPG')).toBe(true);
      expect(isExtensionSupported('Png')).toBe(true);
      expect(isExtensionSupported('HEIC')).toBe(true);
      expect(isExtensionSupported('WebP')).toBe(true);
    });

    it('rejects unsupported formats', () => {
      expect(isExtensionSupported('pdf')).toBe(false);
      expect(isExtensionSupported('doc')).toBe(false);
      expect(isExtensionSupported('txt')).toBe(false);
      expect(isExtensionSupported('psd')).toBe(false);
      expect(isExtensionSupported('svg')).toBe(false);
      expect(isExtensionSupported('raw')).toBe(false);
      expect(isExtensionSupported('cr2')).toBe(false);
      expect(isExtensionSupported('nef')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isExtensionSupported('')).toBe(false);
    });
  });

  describe('hasValidExtension', () => {
    it('validates files with supported extensions', () => {
      expect(hasValidExtension('photo.jpg')).toBe(true);
      expect(hasValidExtension('/path/to/image.png')).toBe(true);
      expect(hasValidExtension('C:\\Users\\file.heic')).toBe(true);
    });

    it('rejects files with unsupported extensions', () => {
      expect(hasValidExtension('document.pdf')).toBe(false);
      expect(hasValidExtension('script.js')).toBe(false);
    });

    it('rejects files without extension', () => {
      expect(hasValidExtension('README')).toBe(false);
      expect(hasValidExtension('.gitignore')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(hasValidExtension('PHOTO.JPG')).toBe(true);
      expect(hasValidExtension('Image.PNG')).toBe(true);
    });
  });

  describe('isPotentiallyAnimated', () => {
    it('identifies gif as potentially animated', () => {
      expect(isPotentiallyAnimated('gif')).toBe(true);
      expect(isPotentiallyAnimated('GIF')).toBe(true);
    });

    it('identifies webp as potentially animated', () => {
      expect(isPotentiallyAnimated('webp')).toBe(true);
      expect(isPotentiallyAnimated('WEBP')).toBe(true);
    });

    it('returns false for non-animated formats', () => {
      expect(isPotentiallyAnimated('jpg')).toBe(false);
      expect(isPotentiallyAnimated('png')).toBe(false);
      expect(isPotentiallyAnimated('heic')).toBe(false);
      expect(isPotentiallyAnimated('tiff')).toBe(false);
      expect(isPotentiallyAnimated('bmp')).toBe(false);
    });
  });

  describe('validateExtension', () => {
    it('returns valid for supported extensions', () => {
      const result = validateExtension('photo.jpg');
      expect(result.valid).toBe(true);
      expect(result.extension).toBe('jpg');
      expect(result.reason).toBeUndefined();
    });

    it('returns invalid for unsupported extensions', () => {
      const result = validateExtension('document.pdf');
      expect(result.valid).toBe(false);
      expect(result.extension).toBe('pdf');
      expect(result.reason).toBe('unsupported-extension');
    });

    it('returns invalid for no extension', () => {
      const result = validateExtension('README');
      expect(result.valid).toBe(false);
      expect(result.extension).toBe('');
      expect(result.reason).toBe('no-extension');
    });

    it('handles full paths', () => {
      expect(validateExtension('/Users/photos/vacation.heic').valid).toBe(true);
      expect(validateExtension('C:\\Photos\\sunset.WEBP').valid).toBe(true);
    });
  });

  describe('validateFormatWithAnimation', () => {
    it('validates static images without animation check', () => {
      const result = validateFormatWithAnimation('photo.jpg');
      expect(result.valid).toBe(true);
    });

    it('validates static gif with animation check', () => {
      const result = validateFormatWithAnimation('image.gif', {
        isAnimated: false,
        frameCount: 1,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects animated gif', () => {
      const result = validateFormatWithAnimation('animation.gif', {
        isAnimated: true,
        frameCount: 30,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('animated-gif');
    });

    it('validates static webp with animation check', () => {
      const result = validateFormatWithAnimation('image.webp', {
        isAnimated: false,
        frameCount: 1,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects animated webp', () => {
      const result = validateFormatWithAnimation('animation.webp', {
        isAnimated: true,
        frameCount: 60,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('animated-webp');
    });

    it('still rejects unsupported extension even with animation check', () => {
      const result = validateFormatWithAnimation('video.mp4', {
        isAnimated: true,
        frameCount: 1000,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('unsupported-extension');
    });

    it('accepts potentially animated format when no animation check provided', () => {
      const result = validateFormatWithAnimation('maybe-animated.gif');
      expect(result.valid).toBe(true);
    });
  });

  describe('getRejectionMessage', () => {
    it('returns message for unsupported extension', () => {
      expect(getRejectionMessage('unsupported-extension')).toBe('Unsupported file format');
    });

    it('returns message for animated gif', () => {
      expect(getRejectionMessage('animated-gif')).toBe('Animated GIFs are not supported');
    });

    it('returns message for animated webp', () => {
      expect(getRejectionMessage('animated-webp')).toBe('Animated WebPs are not supported');
    });

    it('returns message for no extension', () => {
      expect(getRejectionMessage('no-extension')).toBe('File has no extension');
    });

    it('returns fallback for undefined', () => {
      expect(getRejectionMessage(undefined)).toBe('Unknown format error');
    });
  });

  describe('filterSupportedPaths', () => {
    it('separates supported and unsupported paths', () => {
      const paths = [
        '/photos/summer.jpg',
        '/docs/readme.pdf',
        '/images/icon.png',
        '/videos/clip.mp4',
        '/photos/winter.heic',
      ];
      
      const result = filterSupportedPaths(paths);
      
      expect(result.supported).toEqual([
        '/photos/summer.jpg',
        '/images/icon.png',
        '/photos/winter.heic',
      ]);
      expect(result.unsupported).toHaveLength(2);
      expect(result.unsupported[0].path).toBe('/docs/readme.pdf');
      expect(result.unsupported[0].reason).toBe('unsupported-extension');
    });

    it('handles empty array', () => {
      const result = filterSupportedPaths([]);
      expect(result.supported).toEqual([]);
      expect(result.unsupported).toEqual([]);
    });

    it('handles all supported', () => {
      const paths = ['a.jpg', 'b.png', 'c.gif'];
      const result = filterSupportedPaths(paths);
      expect(result.supported).toEqual(paths);
      expect(result.unsupported).toEqual([]);
    });

    it('handles all unsupported', () => {
      const paths = ['a.pdf', 'b.doc', 'c.txt'];
      const result = filterSupportedPaths(paths);
      expect(result.supported).toEqual([]);
      expect(result.unsupported).toHaveLength(3);
    });

    it('handles files without extensions', () => {
      const paths = ['README', 'image.jpg', 'Makefile'];
      const result = filterSupportedPaths(paths);
      expect(result.supported).toEqual(['image.jpg']);
      expect(result.unsupported).toHaveLength(2);
      expect(result.unsupported[0].reason).toBe('no-extension');
    });
  });

  describe('SUPPORTED_EXTENSIONS constant', () => {
    it('contains expected formats', () => {
      const expected = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tiff', 'tif', 'bmp', 'gif'];
      for (const ext of expected) {
        expect(SUPPORTED_EXTENSIONS.has(ext)).toBe(true);
      }
    });

    it('does not contain video or document formats', () => {
      expect(SUPPORTED_EXTENSIONS.has('mp4')).toBe(false);
      expect(SUPPORTED_EXTENSIONS.has('pdf')).toBe(false);
      expect(SUPPORTED_EXTENSIONS.has('svg')).toBe(false);
    });
  });
});
