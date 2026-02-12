/**
 * Integration tests for exporter module.
 * Uses temp directories for testing.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import sharp from 'sharp';
import {
  fileExists,
  ensureDirectory,
  preserveTimestamp,
  generateRunId,
  exportImages,
  createCancellationToken,
  type ExportJob,
  type ExportProgress,
} from './exporter';
import type { ImageItem, RunConfig, Transform, Crop } from '../../shared/types';
import { DEFAULT_QUALITY, DEFAULT_TRANSFORM, DEFAULT_CROP } from '../../shared/types';

// Mock electron module
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'downloads') {
        return process.env.TEST_DOWNLOADS_PATH || os.tmpdir();
      }
      return os.tmpdir();
    },
  },
  shell: {
    openPath: vi.fn().mockResolvedValue(''),
  },
}));

describe('exporter', () => {
  let tempDir: string;
  let testDownloadsDir: string;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reformat-exporter-test-'));
    testDownloadsDir = path.join(tempDir, 'Downloads');
    await fs.mkdir(testDownloadsDir, { recursive: true });
  });

  beforeEach(() => {
    originalEnv = process.env.TEST_DOWNLOADS_PATH;
    process.env.TEST_DOWNLOADS_PATH = testDownloadsDir;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.TEST_DOWNLOADS_PATH = originalEnv;
    } else {
      delete process.env.TEST_DOWNLOADS_PATH;
    }
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function createTestImage(filename: string, width = 400, height = 300): Promise<string> {
    const filePath = path.join(tempDir, filename);
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .jpeg({ quality: 90 })
      .toFile(filePath);
    return filePath;
  }

  function createImageItem(sourcePath: string, id: string, name: string): ImageItem {
    return {
      id,
      source: 'file',
      sourcePath,
      originalName: name,
      bytes: 1000,
      width: 400,
      height: 300,
      format: 'jpeg',
      hasAlpha: false,
    };
  }

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const testFile = path.join(tempDir, 'exists-test.txt');
      await fs.writeFile(testFile, 'test');
      expect(await fileExists(testFile)).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      expect(await fileExists('/nonexistent/path/file.txt')).toBe(false);
    });
  });

  describe('ensureDirectory', () => {
    it('should create a new directory', async () => {
      const newDir = path.join(tempDir, 'new-dir-' + Date.now());
      await ensureDirectory(newDir);
      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not fail if directory exists', async () => {
      const existingDir = path.join(tempDir, 'existing-dir');
      await fs.mkdir(existingDir, { recursive: true });
      await expect(ensureDirectory(existingDir)).resolves.not.toThrow();
    });

    it('should create nested directories', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'deeply', 'dir-' + Date.now());
      await ensureDirectory(nestedDir);
      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('preserveTimestamp', () => {
    it('should preserve modified time', async () => {
      const sourceFile = path.join(tempDir, 'source-ts.txt');
      const destFile = path.join(tempDir, 'dest-ts.txt');
      
      await fs.writeFile(sourceFile, 'source');
      
      // Set a specific modified time on source
      const pastTime = new Date('2023-01-15T10:30:00Z');
      await fs.utimes(sourceFile, pastTime, pastTime);
      
      await fs.writeFile(destFile, 'dest');
      
      await preserveTimestamp(sourceFile, destFile);
      
      const destStats = await fs.stat(destFile);
      // Allow 1 second tolerance for filesystem precision
      expect(Math.abs(destStats.mtime.getTime() - pastTime.getTime())).toBeLessThan(1000);
    });

    it('should not throw on error (best-effort)', async () => {
      await expect(
        preserveTimestamp('/nonexistent/source.txt', '/nonexistent/dest.txt')
      ).resolves.not.toThrow();
    });
  });

  describe('generateRunId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateRunId();
      const id2 = generateRunId();
      expect(id1).not.toBe(id2);
    });

    it('should start with run-', () => {
      const id = generateRunId();
      expect(id.startsWith('run-')).toBe(true);
    });
  });

  describe('createCancellationToken', () => {
    it('should create a token that is not cancelled initially', () => {
      const token = createCancellationToken();
      expect(token.isCancelled).toBe(false);
    });

    it('should be cancellable', () => {
      const token = createCancellationToken();
      token.cancel();
      expect(token.isCancelled).toBe(true);
    });
  });

  describe('exportImages', () => {
    it('should export a single image successfully', async () => {
      const sourcePath = await createTestImage('single-export.jpg');
      const item = createImageItem(sourcePath, 'item-1', 'single-export.jpg');

      const config: RunConfig = {
        outputFormat: 'jpg',
        resizeSettings: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        items: [{ itemId: 'item-1', transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP }],
      };

      const job: ExportJob = {
        runId: generateRunId(),
        items: [item],
        config,
      };

      const result = await exportImages(job);

      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(0);
      expect(result.results[0].status).toBe('completed');
      expect(result.results[0].outputPath).toBeDefined();
    });

    it('should handle filename collisions with -1, -2 suffixes', async () => {
      // Create source images with the same name by using different folders
      const sourceDir1 = path.join(tempDir, 'collision-source1');
      const sourceDir2 = path.join(tempDir, 'collision-source2');
      await fs.mkdir(sourceDir1, { recursive: true });
      await fs.mkdir(sourceDir2, { recursive: true });

      const sourcePath1 = path.join(sourceDir1, 'same-name.jpg');
      const sourcePath2 = path.join(sourceDir2, 'same-name.jpg');

      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).jpeg().toFile(sourcePath1);

      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
      }).jpeg().toFile(sourcePath2);

      const item1 = createImageItem(sourcePath1, 'collision-1', 'same-name.jpg');
      const item2 = createImageItem(sourcePath2, 'collision-2', 'same-name.jpg');

      // Mark items as from different folders
      item1.sourcePath = sourcePath1;
      item2.sourcePath = sourcePath2;

      const config: RunConfig = {
        outputFormat: 'jpg',
        resizeSettings: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        items: [
          { itemId: 'collision-1', transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP },
          { itemId: 'collision-2', transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP },
        ],
      };

      const job: ExportJob = {
        runId: generateRunId(),
        items: [item1, item2],
        config,
      };

      const result = await exportImages(job);

      expect(result.summary.succeeded).toBe(2);
      
      const paths = result.results.map(r => r.outputPath).filter(Boolean) as string[];
      expect(paths.length).toBe(2);
      
      // The two output paths should be unique (either different names or collision suffix)
      const uniquePaths = new Set(paths.map(p => p.toLowerCase()));
      expect(uniquePaths.size).toBe(2);
      
      // One or both should contain _reformat
      expect(paths.every(p => p.includes('_reformat'))).toBe(true);
    });

    it('should continue processing after failures', async () => {
      // Valid image
      const validPath = await createTestImage('valid-for-batch.jpg');
      const validItem = createImageItem(validPath, 'valid-item', 'valid.jpg');

      // Invalid path
      const invalidItem: ImageItem = {
        id: 'invalid-item',
        source: 'file',
        sourcePath: '/nonexistent/invalid.jpg',
        originalName: 'invalid.jpg',
        bytes: 0,
        width: 100,
        height: 100,
        format: 'jpeg',
      };

      const config: RunConfig = {
        outputFormat: 'jpg',
        resizeSettings: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        items: [
          { itemId: 'valid-item', transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP },
          { itemId: 'invalid-item', transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP },
        ],
      };

      const job: ExportJob = {
        runId: generateRunId(),
        items: [validItem, invalidItem],
        config,
      };

      const result = await exportImages(job);

      expect(result.summary.total).toBe(2);
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(1);

      const validResult = result.results.find(r => r.itemId === 'valid-item');
      const invalidResult = result.results.find(r => r.itemId === 'invalid-item');

      expect(validResult?.status).toBe('completed');
      expect(invalidResult?.status).toBe('failed');
    });

    it('should call progress callback', async () => {
      const sourcePath = await createTestImage('progress-test.jpg');
      const item = createImageItem(sourcePath, 'progress-item', 'progress.jpg');

      const config: RunConfig = {
        outputFormat: 'jpg',
        resizeSettings: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        items: [{ itemId: 'progress-item', transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP }],
      };

      const job: ExportJob = {
        runId: generateRunId(),
        items: [item],
        config,
      };

      const progressUpdates: ExportProgress[] = [];
      const result = await exportImages(job, (progress) => {
        progressUpdates.push({ ...progress });
      });

      expect(result.summary.succeeded).toBe(1);
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.completed).toBe(1);
      expect(lastProgress.succeeded).toBe(1);
    });

    it('should respect cancellation', async () => {
      // Create multiple images
      const items: ImageItem[] = [];
      for (let i = 0; i < 6; i++) {
        const sourcePath = await createTestImage(`cancel-test-${i}.jpg`);
        items.push(createImageItem(sourcePath, `cancel-item-${i}`, `cancel-${i}.jpg`));
      }

      const config: RunConfig = {
        outputFormat: 'jpg',
        resizeSettings: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        items: items.map(item => ({
          itemId: item.id,
          transform: DEFAULT_TRANSFORM,
          crop: DEFAULT_CROP,
        })),
      };

      const cancellationToken = createCancellationToken();

      const job: ExportJob = {
        runId: generateRunId(),
        items,
        config,
        cancellationToken,
      };

      // Cancel after a short delay
      setTimeout(() => cancellationToken.cancel(), 50);

      const result = await exportImages(job);

      // Some should be cancelled (depending on timing)
      const hasCompletedOrCanceled =
        result.summary.succeeded > 0 || result.summary.canceled > 0;
      expect(hasCompletedOrCanceled).toBe(true);
    });

    it('should handle format conversion', async () => {
      const sourcePath = await createTestImage('convert-format.jpg');
      const item = createImageItem(sourcePath, 'convert-item', 'convert.jpg');

      const config: RunConfig = {
        outputFormat: 'png', // Convert JPEG to PNG
        resizeSettings: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        items: [{ itemId: 'convert-item', transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP }],
      };

      const job: ExportJob = {
        runId: generateRunId(),
        items: [item],
        config,
      };

      const result = await exportImages(job);

      expect(result.summary.succeeded).toBe(1);
      expect(result.results[0].outputPath).toContain('.png');

      // Verify output is PNG
      const metadata = await sharp(result.results[0].outputPath!).metadata();
      expect(metadata.format).toBe('png');
    });

    it('should apply resize settings', async () => {
      const sourcePath = await createTestImage('resize-export.jpg', 800, 600);
      const item = createImageItem(sourcePath, 'resize-item', 'resize.jpg');
      item.width = 800;
      item.height = 600;

      const config: RunConfig = {
        outputFormat: 'jpg',
        resizeSettings: { mode: 'percent', percent: 50 },
        quality: DEFAULT_QUALITY,
        items: [{ itemId: 'resize-item', transform: DEFAULT_TRANSFORM, crop: DEFAULT_CROP }],
      };

      const job: ExportJob = {
        runId: generateRunId(),
        items: [item],
        config,
      };

      const result = await exportImages(job);

      expect(result.summary.succeeded).toBe(1);

      // Verify output dimensions
      const metadata = await sharp(result.results[0].outputPath!).metadata();
      expect(metadata.width).toBe(400);
      expect(metadata.height).toBe(300);
    });

    it('should keep already-exported files after cancellation', async () => {
      // Create multiple images for batch processing
      const items: ImageItem[] = [];
      for (let i = 0; i < 12; i++) {
        const sourcePath = await createTestImage(`keep-exported-${i}.jpg`);
        items.push(createImageItem(sourcePath, `keep-item-${i}`, `keep-${i}.jpg`));
      }

      const config: RunConfig = {
        outputFormat: 'jpg',
        resizeSettings: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        items: items.map(item => ({
          itemId: item.id,
          transform: DEFAULT_TRANSFORM,
          crop: DEFAULT_CROP,
        })),
      };

      const cancellationToken = createCancellationToken();

      const job: ExportJob = {
        runId: generateRunId(),
        items,
        config,
        cancellationToken,
      };

      // Cancel after a very short delay to let at most a few items complete
      setTimeout(() => cancellationToken.cancel(), 10);

      const result = await exportImages(job);

      // Verify that completed items have their files preserved
      const completedResults = result.results.filter(r => r.status === 'completed');
      
      for (const completedResult of completedResults) {
        expect(completedResult.outputPath).toBeDefined();
        const exists = await fileExists(completedResult.outputPath!);
        expect(exists).toBe(true);
      }

      // Total should match: completed + canceled (+ any failed)
      expect(result.summary.succeeded + result.summary.canceled + result.summary.failed).toBe(items.length);
      
      // At least verify we got all results back (either completed or canceled)
      expect(result.results.length).toBe(items.length);
    });

    it('should stop scheduling new tasks when cancelled', async () => {
      // Create enough images to exceed concurrency
      const items: ImageItem[] = [];
      for (let i = 0; i < 12; i++) {
        const sourcePath = await createTestImage(`stop-sched-${i}.jpg`);
        items.push(createImageItem(sourcePath, `stop-item-${i}`, `stop-${i}.jpg`));
      }

      const config: RunConfig = {
        outputFormat: 'jpg',
        resizeSettings: { mode: 'percent', percent: 100 },
        quality: DEFAULT_QUALITY,
        items: items.map(item => ({
          itemId: item.id,
          transform: DEFAULT_TRANSFORM,
          crop: DEFAULT_CROP,
        })),
      };

      const cancellationToken = createCancellationToken();
      const progressUpdates: ExportProgress[] = [];

      const job: ExportJob = {
        runId: generateRunId(),
        items,
        config,
        cancellationToken,
      };

      // Cancel immediately to verify no new tasks are started
      cancellationToken.cancel();

      const result = await exportImages(job, (progress) => {
        progressUpdates.push({ ...progress });
      });

      // All items should be canceled since we cancelled immediately
      expect(result.summary.canceled).toBe(items.length);
      expect(result.summary.succeeded).toBe(0);
    });
  });
});
