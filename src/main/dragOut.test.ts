/**
 * Tests for drag-out export module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  fileExists,
  moveFile,
  checkCollision,
  getSuggestedRenamePath,
} from './dragOut';

describe('dragOut', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reformat-drag-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('fileExists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'content');

      expect(await fileExists(filePath)).toBe(true);
    });

    it('returns false for non-existent file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      expect(await fileExists(filePath)).toBe(false);
    });

    it('returns true for directory', async () => {
      const dirPath = path.join(tempDir, 'subdir');
      await fs.mkdir(dirPath);

      expect(await fileExists(dirPath)).toBe(true);
    });
  });

  describe('checkCollision', () => {
    it('returns true when file exists', async () => {
      const filePath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(filePath, 'content');

      expect(await checkCollision(filePath)).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      expect(await checkCollision(filePath)).toBe(false);
    });
  });

  describe('getSuggestedRenamePath', () => {
    it('returns original path when no collision', async () => {
      const filePath = path.join(tempDir, 'newfile.txt');

      const suggested = await getSuggestedRenamePath(filePath);
      expect(suggested).toBe(filePath);
    });

    it('returns renamed path when collision exists', async () => {
      const filePath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(filePath, 'content');

      const suggested = await getSuggestedRenamePath(filePath);
      expect(suggested).toBe(path.join(tempDir, 'existing-1.txt'));
    });

    it('increments counter for multiple collisions', async () => {
      const originalPath = path.join(tempDir, 'file.txt');
      await fs.writeFile(originalPath, 'content');
      await fs.writeFile(path.join(tempDir, 'file-1.txt'), 'content');
      await fs.writeFile(path.join(tempDir, 'file-2.txt'), 'content');

      const suggested = await getSuggestedRenamePath(originalPath);
      expect(suggested).toBe(path.join(tempDir, 'file-3.txt'));
    });
  });

  describe('moveFile', () => {
    it('moves file to destination', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest', 'output.txt');
      await fs.writeFile(sourcePath, 'content');

      const result = await moveFile(sourcePath, destPath);

      expect(result.success).toBe(true);
      expect(result.destinationPath).toBe(destPath);
      expect(await fileExists(sourcePath)).toBe(false);
      expect(await fileExists(destPath)).toBe(true);
      expect(await fs.readFile(destPath, 'utf8')).toBe('content');
    });

    it('returns error for non-existent source', async () => {
      const sourcePath = path.join(tempDir, 'nonexistent.txt');
      const destPath = path.join(tempDir, 'dest.txt');

      const result = await moveFile(sourcePath, destPath);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Source file not found');
    });

    it('returns error for collision without overwrite or rename', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(sourcePath, 'new');
      await fs.writeFile(destPath, 'old');

      const result = await moveFile(sourcePath, destPath, false, false);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Destination file already exists');
      // Source should still exist
      expect(await fileExists(sourcePath)).toBe(true);
    });

    it('overwrites destination when overwrite is true', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(sourcePath, 'new content');
      await fs.writeFile(destPath, 'old content');

      const result = await moveFile(sourcePath, destPath, true);

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);
      expect(await fileExists(sourcePath)).toBe(false);
      expect(await fs.readFile(destPath, 'utf8')).toBe('new content');
    });

    it('auto-renames when autoRename is true and collision exists', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'existing.txt');
      await fs.writeFile(sourcePath, 'new');
      await fs.writeFile(destPath, 'old');

      const result = await moveFile(sourcePath, destPath, false, true);

      expect(result.success).toBe(true);
      expect(result.renamed).toBe(true);
      expect(result.destinationPath).toBe(path.join(tempDir, 'existing-1.txt'));
      expect(await fileExists(sourcePath)).toBe(false);
      // Original dest should still exist
      expect(await fs.readFile(destPath, 'utf8')).toBe('old');
      // New file should exist
      expect(await fs.readFile(result.destinationPath!, 'utf8')).toBe('new');
    });

    it('creates destination directory if it does not exist', async () => {
      const sourcePath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'new', 'nested', 'dir', 'output.txt');
      await fs.writeFile(sourcePath, 'content');

      const result = await moveFile(sourcePath, destPath);

      expect(result.success).toBe(true);
      expect(await fileExists(destPath)).toBe(true);
    });

    it('handles cross-directory moves', async () => {
      const subDir1 = path.join(tempDir, 'dir1');
      const subDir2 = path.join(tempDir, 'dir2');
      await fs.mkdir(subDir1);
      await fs.mkdir(subDir2);

      const sourcePath = path.join(subDir1, 'file.txt');
      const destPath = path.join(subDir2, 'file.txt');
      await fs.writeFile(sourcePath, 'content');

      const result = await moveFile(sourcePath, destPath);

      expect(result.success).toBe(true);
      expect(await fileExists(sourcePath)).toBe(false);
      expect(await fileExists(destPath)).toBe(true);
    });
  });
});
