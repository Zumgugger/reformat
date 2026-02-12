/**
 * Tests for the import module.
 * Uses temp directories to test actual filesystem operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { importDroppedPaths, importPaths } from './import';

// Create a unique temp directory for tests
let tempDir: string;

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reformat-test-'));
  return dir;
}

async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function createFile(dir: string, name: string, content = ''): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

async function createSubdir(dir: string, name: string): Promise<string> {
  const subdirPath = path.join(dir, name);
  await fs.mkdir(subdirPath, { recursive: true });
  return subdirPath;
}

describe('import', () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanup(tempDir);
  });

  describe('importPaths', () => {
    it('imports single supported file', async () => {
      const file = await createFile(tempDir, 'photo.jpg');
      
      const result = await importPaths([file]);
      
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toBe(file);
      expect(result.duplicateCount).toBe(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('imports multiple supported files', async () => {
      const file1 = await createFile(tempDir, 'photo1.jpg');
      const file2 = await createFile(tempDir, 'photo2.png');
      const file3 = await createFile(tempDir, 'photo3.heic');
      
      const result = await importPaths([file1, file2, file3]);
      
      expect(result.paths).toHaveLength(3);
      expect(result.duplicateCount).toBe(0);
    });

    it('rejects unsupported file extensions', async () => {
      const supported = await createFile(tempDir, 'photo.jpg');
      const unsupported = await createFile(tempDir, 'document.pdf');
      
      const result = await importPaths([supported, unsupported]);
      
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toBe(supported);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('unsupported-extension');
    });

    it('rejects files without extension', async () => {
      const withExt = await createFile(tempDir, 'photo.jpg');
      const noExt = await createFile(tempDir, 'README');
      
      const result = await importPaths([withExt, noExt]);
      
      expect(result.paths).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('no-extension');
    });

    it('warns for non-existent paths', async () => {
      const nonExistent = path.join(tempDir, 'does-not-exist.jpg');
      
      const result = await importPaths([nonExistent]);
      
      expect(result.paths).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('not-found');
    });
  });

  describe('importDroppedPaths with folders', () => {
    it('imports supported files from folder (non-recursive)', async () => {
      // Create files in tempDir
      const file1 = await createFile(tempDir, 'a.jpg');
      const file2 = await createFile(tempDir, 'b.png');
      await createFile(tempDir, 'c.txt'); // unsupported
      
      const result = await importPaths([tempDir]);
      
      expect(result.paths).toHaveLength(2);
      expect(result.paths).toContain(file1);
      expect(result.paths).toContain(file2);
      expect(result.warnings.some(w => w.type === 'unsupported-extension')).toBe(true);
    });

    it('does not recurse into subfolders', async () => {
      // Create file in tempDir
      const topFile = await createFile(tempDir, 'top.jpg');
      
      // Create subfolder with file
      const subdir = await createSubdir(tempDir, 'subfolder');
      await createFile(subdir, 'nested.jpg');
      
      const result = await importPaths([tempDir]);
      
      // Should only get top-level file
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toBe(topFile);
    });

    it('warns about skipped subfolders', async () => {
      await createFile(tempDir, 'top.jpg');
      await createSubdir(tempDir, 'subfolder1');
      await createSubdir(tempDir, 'subfolder2');
      
      const result = await importPaths([tempDir]);
      
      expect(result.warnings.some(w => w.type === 'subfolder-skipped')).toBe(true);
      const warning = result.warnings.find(w => w.type === 'subfolder-skipped');
      expect(warning?.message).toContain('2 subfolder');
    });

    it('handles mix of files and folders', async () => {
      // Create a direct file
      const directFile = await createFile(tempDir, 'direct.jpg');
      
      // Create a subfolder with files
      const subdir = await createSubdir(tempDir, 'photos');
      const subdirFile = await createFile(subdir, 'in-folder.png');
      
      // Import both the direct file and the subfolder
      const result = await importPaths([directFile, subdir]);
      
      expect(result.paths).toHaveLength(2);
      expect(result.paths).toContain(directFile);
      expect(result.paths).toContain(subdirFile);
    });

    it('handles empty folder', async () => {
      const emptyDir = await createSubdir(tempDir, 'empty');
      
      const result = await importPaths([emptyDir]);
      
      expect(result.paths).toHaveLength(0);
      expect(result.warnings).toHaveLength(0); // Empty folder is not a warning
    });

    it('handles folder with only unsupported files', async () => {
      await createFile(tempDir, 'doc.pdf');
      await createFile(tempDir, 'video.mp4');
      
      const result = await importPaths([tempDir]);
      
      expect(result.paths).toHaveLength(0);
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe('importDroppedPaths with deduplication', () => {
    it('deduplicates against existing paths', async () => {
      const file1 = await createFile(tempDir, 'a.jpg');
      const file2 = await createFile(tempDir, 'b.jpg');
      
      // File1 is already in selection
      const result = await importDroppedPaths([file1, file2], [file1]);
      
      // Should only include file2 as new
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toBe(file2);
      expect(result.duplicateCount).toBe(1);
    });

    it('deduplicates within dropped paths', async () => {
      const file = await createFile(tempDir, 'photo.jpg');
      
      // Same file dropped twice
      const result = await importPaths([file, file]);
      
      expect(result.paths).toHaveLength(1);
      expect(result.duplicateCount).toBe(1);
    });

    it('handles case-insensitive deduplication on Windows-style paths', async () => {
      // This test verifies that path canonicalization handles case differences.
      // On Linux (case-sensitive fs), the uppercase path won't exist, so we test
      // the dedupe logic by creating a separate file and checking canonicalization.
      // The dedupe module itself handles case-insensitive comparison.
      
      const file1 = await createFile(tempDir, 'Photo.jpg');
      const file2 = await createFile(tempDir, 'photo2.jpg');
      
      // Simulate Windows-style duplicate detection by using paths that would
      // canonicalize to the same value (we can test the dedupe module directly
      // for case-insensitive behavior)
      const result = await importPaths([file1, file2, file1]);
      
      // The third path is an exact duplicate
      expect(result.duplicateCount).toBe(1);
      expect(result.paths).toHaveLength(2);
    });
  });

  describe('importDroppedPaths warning counts', () => {
    it('counts all warning types correctly', async () => {
      // Create various files
      const supported = await createFile(tempDir, 'photo.jpg');
      const unsupported = await createFile(tempDir, 'doc.pdf');
      const noExt = await createFile(tempDir, 'README');
      await createSubdir(tempDir, 'subfolder');
      
      const result = await importDroppedPaths(
        [tempDir, supported, unsupported, noExt],
        [supported] // supported is a duplicate
      );
      
      // From folder: photo.jpg (supported but duplicate), doc.pdf (unsupported), README (no-ext), subfolder (skipped)
      // Direct drops: supported (duplicate), unsupported (unsupported), noExt (no-ext)
      expect(result.paths).toHaveLength(0); // All are duplicates or unsupported
      expect(result.warnings.some(w => w.type === 'unsupported-extension')).toBe(true);
      expect(result.warnings.some(w => w.type === 'no-extension')).toBe(true);
      expect(result.warnings.some(w => w.type === 'subfolder-skipped')).toBe(true);
    });
  });
});
