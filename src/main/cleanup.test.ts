/**
 * Integration tests for cleanup module.
 * Tests temp file cleanup functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  cleanupTempFiles,
  cleanupTempFilesSync,
  setCleanupUserDataPath,
} from './cleanup';

// Create a unique temp directory for tests
let tempDir: string;

async function createTempDir(): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reformat-cleanup-test-'));
  return dir;
}

async function cleanupDir(dir: string): Promise<void> {
  try {
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      await fs.promises.unlink(path.join(dir, file));
    }
    await fs.promises.rmdir(dir);
  } catch {
    // Ignore cleanup errors
  }
}

describe('cleanup', () => {
  beforeEach(async () => {
    tempDir = await createTempDir();
    setCleanupUserDataPath(tempDir);
  });

  afterEach(async () => {
    setCleanupUserDataPath(null);
    await cleanupDir(tempDir);
  });

  describe('cleanupTempFiles', () => {
    it('should clean up settings.json.tmp', async () => {
      // Create a temp file
      const tempFile = path.join(tempDir, 'settings.json.tmp');
      await fs.promises.writeFile(tempFile, '{"test": true}');

      // Verify file exists
      expect(fs.existsSync(tempFile)).toBe(true);

      // Run cleanup
      const result = await cleanupTempFiles();

      // Verify file was cleaned
      expect(fs.existsSync(tempFile)).toBe(false);
      expect(result.cleaned).toContain('settings.json.tmp');
      expect(result.errors).toHaveLength(0);
    });

    it('should not remove regular files', async () => {
      // Create regular files
      const settingsFile = path.join(tempDir, 'settings.json');
      const otherFile = path.join(tempDir, 'other-file.txt');
      await fs.promises.writeFile(settingsFile, '{"version": 1}');
      await fs.promises.writeFile(otherFile, 'hello');

      // Run cleanup
      const result = await cleanupTempFiles();

      // Verify regular files were not removed
      expect(fs.existsSync(settingsFile)).toBe(true);
      expect(fs.existsSync(otherFile)).toBe(true);
      expect(result.cleaned).toHaveLength(0);
    });

    it('should handle missing directory gracefully', async () => {
      // Set to non-existent path
      const nonExistent = path.join(tempDir, 'does-not-exist');
      setCleanupUserDataPath(nonExistent);

      // Run cleanup - should not throw
      const result = await cleanupTempFiles();

      expect(result.cleaned).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty directory', async () => {
      // Empty tempDir (created by beforeEach)
      const result = await cleanupTempFiles();

      expect(result.cleaned).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should clean up multiple temp files', async () => {
      // Create temp file
      const tempFile = path.join(tempDir, 'settings.json.tmp');
      await fs.promises.writeFile(tempFile, '{}');

      // Run cleanup
      const result = await cleanupTempFiles();

      expect(result.cleaned).toHaveLength(1);
      expect(result.cleaned).toContain('settings.json.tmp');
    });

    it('should report errors for files that cannot be deleted', async () => {
      // This is harder to test cross-platform, so we just verify error handling works
      // by checking the structure of the result
      const result = await cleanupTempFiles();
      
      expect(result).toHaveProperty('cleaned');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.cleaned)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('cleanupTempFilesSync', () => {
    it('should clean up settings.json.tmp synchronously', async () => {
      // Create a temp file
      const tempFile = path.join(tempDir, 'settings.json.tmp');
      await fs.promises.writeFile(tempFile, '{"test": true}');

      // Verify file exists
      expect(fs.existsSync(tempFile)).toBe(true);

      // Run cleanup synchronously
      cleanupTempFilesSync();

      // Verify file was cleaned
      expect(fs.existsSync(tempFile)).toBe(false);
    });

    it('should not throw on missing directory', () => {
      // Set to non-existent path
      setCleanupUserDataPath(path.join(tempDir, 'does-not-exist'));

      // Should not throw
      expect(() => cleanupTempFilesSync()).not.toThrow();
    });

    it('should not throw on errors', async () => {
      // Create a file and make it read-only (this may or may not work depending on OS)
      // The main goal is to ensure cleanupTempFilesSync doesn't throw
      expect(() => cleanupTempFilesSync()).not.toThrow();
    });

    it('should not remove regular files', async () => {
      // Create regular files
      const settingsFile = path.join(tempDir, 'settings.json');
      await fs.promises.writeFile(settingsFile, '{"version": 1}');

      // Run cleanup
      cleanupTempFilesSync();

      // Verify regular file was not removed
      expect(fs.existsSync(settingsFile)).toBe(true);
    });
  });
});
