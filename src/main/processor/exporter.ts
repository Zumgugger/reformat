/**
 * Image exporter module.
 * Handles destination folder creation, filename resolution, processing, and timestamp preservation.
 */

import { promises as fs } from 'fs';
import { app } from 'electron';
import type {
  ImageItem,
  ItemRunConfig,
  RunConfig,
  ItemResult,
  ItemStatus,
} from '../../shared/types';
import { resolveOutputSubfolder, buildOutputFolderPath } from '../../shared/paths';
import { resolveOutputPath, getClipboardBasename } from '../../shared/naming';
import { processImage, getOutputExtension, type ProcessResult } from './pipeline';
import {
  runWorkerPool,
  createCancellationToken,
  type CancellationToken,
  type TaskFn,
  type PoolProgress,
  type TaskResult,
} from './workerPool';
import { getClipboardBuffer } from '../clipboard';

/** Export job configuration */
export interface ExportJob {
  /** Unique run ID */
  runId: string;
  /** Items to export */
  items: ImageItem[];
  /** Run configuration with per-item settings */
  config: RunConfig;
  /** Cancellation token */
  cancellationToken?: CancellationToken;
}

/** Progress update for an export run */
export interface ExportProgress {
  /** Run ID */
  runId: string;
  /** Total items */
  total: number;
  /** Completed items (success + failed + canceled) */
  completed: number;
  /** Successful items */
  succeeded: number;
  /** Failed items */
  failed: number;
  /** Canceled items */
  canceled: number;
  /** Latest result */
  latest?: ItemResult;
}

/** Full export result */
export interface ExportResult {
  /** Run ID */
  runId: string;
  /** Output folder path */
  outputFolder: string;
  /** Results per item */
  results: ItemResult[];
  /** Summary counts */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    canceled: number;
  };
}

/** Callback for progress updates */
export type ExportProgressCallback = (progress: ExportProgress) => void;

/**
 * Get the Downloads folder path.
 */
export function getDownloadsPath(): string {
  return app.getPath('downloads');
}

/**
 * Check if a file exists.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    // Ignore if already exists
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Preserve the modified timestamp from source to output file (best-effort).
 */
export async function preserveTimestamp(
  sourcePath: string,
  outputPath: string
): Promise<void> {
  try {
    const stats = await fs.stat(sourcePath);
    await fs.utimes(outputPath, stats.atime, stats.mtime);
  } catch {
    // Best-effort: ignore timestamp preservation failures
  }
}

/**
 * Get the original name for an item (handles clipboard items).
 */
function getItemOriginalName(item: ImageItem): string {
  if (item.source === 'clipboard') {
    return getClipboardBasename();
  }
  return item.originalName;
}

/**
 * Get the per-item config from the run config.
 */
function getItemConfig(config: RunConfig, itemId: string): ItemRunConfig | undefined {
  return config.items.find((ic) => ic.itemId === itemId);
}

/**
 * Generate a unique run ID.
 */
let runCounter = 0;
export function generateRunId(): string {
  return `run-${Date.now()}-${++runCounter}`;
}

/**
 * Create a cancellation token for a run.
 */
export { createCancellationToken, type CancellationToken };

/**
 * Export a batch of images.
 *
 * @param job - Export job configuration
 * @param onProgress - Progress callback
 * @returns Export result
 */
export async function exportImages(
  job: ExportJob,
  onProgress?: ExportProgressCallback
): Promise<ExportResult> {
  const { runId, items, config, cancellationToken } = job;

  // Determine output folder
  const downloadsPath = getDownloadsPath();
  const subfolder = resolveOutputSubfolder(items);
  const outputFolder = buildOutputFolderPath(downloadsPath, subfolder);

  // Ensure output folder exists
  await ensureDirectory(outputFolder);

  // Pre-resolve all output paths to avoid race conditions
  // Track reserved filenames within this batch
  const reservedPaths = new Set<string>();
  
  const combinedExists = async (path: string): Promise<boolean> => {
    // Check both disk and our reserved set
    if (reservedPaths.has(path.toLowerCase())) {
      return true;
    }
    return await fileExists(path);
  };
  
  // Pre-compute all output paths sequentially
  const outputPaths: string[] = [];
  for (const item of items) {
    const originalName = getItemOriginalName(item);
    const outputExtension = getOutputExtension(config.outputFormat, item.format);
    
    const outputPath = await resolveOutputPath(
      outputFolder,
      originalName,
      outputExtension,
      combinedExists
    );
    
    outputPaths.push(outputPath);
    reservedPaths.add(outputPath.toLowerCase());
  }

  // Prepare tasks for worker pool
  const tasks: TaskFn<ItemResult>[] = items.map((item, index) => {
    return async (): Promise<ItemResult> => {
      const itemConfig = getItemConfig(config, item.id);
      const outputPath = outputPaths[index];

      // Get source: either file path or clipboard buffer
      let sourcePath: string | undefined;
      let sourceBuffer: Buffer | undefined;

      if (item.source === 'clipboard') {
        sourceBuffer = getClipboardBuffer(item.id);
        if (!sourceBuffer) {
          return {
            itemId: item.id,
            status: 'failed' as ItemStatus,
            error: 'Clipboard buffer not found',
          };
        }
      } else {
        sourcePath = item.sourcePath;
        if (!sourcePath) {
          return {
            itemId: item.id,
            status: 'failed' as ItemStatus,
            error: 'Source path not found',
          };
        }
      }

      // Process the image
      const processResult: ProcessResult = await processImage({
        sourcePath,
        sourceBuffer,
        outputPath,
        outputFormat: config.outputFormat,
        resize: config.resizeSettings,
        quality: config.quality,
        transform: itemConfig?.transform,
        crop: itemConfig?.crop,
        sourceFormat: item.format,
        sourceWidth: item.width,
        sourceHeight: item.height,
      });

      if (processResult.success) {
        // Preserve timestamp (best-effort)
        if (item.sourcePath) {
          await preserveTimestamp(item.sourcePath, outputPath);
        }

        return {
          itemId: item.id,
          status: 'completed' as ItemStatus,
          outputPath: processResult.outputPath,
          outputBytes: processResult.outputBytes,
          warnings: processResult.warnings.length > 0 ? processResult.warnings : undefined,
        };
      } else {
        return {
          itemId: item.id,
          status: 'failed' as ItemStatus,
          error: processResult.error,
          warnings: processResult.warnings.length > 0 ? processResult.warnings : undefined,
        };
      }
    };
  });

  // Map pool progress to export progress
  const poolProgressCallback = onProgress
    ? (poolProgress: PoolProgress<ItemResult>) => {
        const latest = poolProgress.latest;
        onProgress({
          runId,
          total: poolProgress.total,
          completed: poolProgress.completed,
          succeeded: poolProgress.succeeded,
          failed: poolProgress.failed,
          canceled: poolProgress.canceled,
          latest: latest?.value ?? (latest?.canceled
            ? { itemId: items[latest.index].id, status: 'canceled' as ItemStatus }
            : undefined),
        });
      }
    : undefined;

  // Run the worker pool
  const taskResults = await runWorkerPool(tasks, {
    concurrency: 4,
    cancellationToken,
    onProgress: poolProgressCallback,
  });

  // Convert task results to item results
  const results: ItemResult[] = taskResults.map((taskResult, index) => {
    if (taskResult.canceled) {
      return {
        itemId: items[index].id,
        status: 'canceled' as ItemStatus,
      };
    }
    if (taskResult.success && taskResult.value) {
      return taskResult.value;
    }
    return {
      itemId: items[index].id,
      status: 'failed' as ItemStatus,
      error: taskResult.error?.message ?? 'Unknown error',
    };
  });

  // Calculate summary
  const summary = {
    total: results.length,
    succeeded: results.filter((r) => r.status === 'completed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    canceled: results.filter((r) => r.status === 'canceled').length,
  };

  return {
    runId,
    outputFolder,
    results,
    summary,
  };
}

/**
 * Open a folder in the system file explorer.
 */
export async function openFolder(folderPath: string): Promise<void> {
  const { shell } = await import('electron');
  await shell.openPath(folderPath);
}
