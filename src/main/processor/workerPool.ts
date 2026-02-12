/**
 * Worker pool with fixed concurrency for parallel image processing.
 * Supports cancellation and per-task error handling.
 */

/** Default concurrency limit */
export const DEFAULT_CONCURRENCY = 4;

/** Task function type */
export type TaskFn<T> = () => Promise<T>;

/** Result of a task execution */
export interface TaskResult<T> {
  /** Task index (0-based) */
  index: number;
  /** Whether the task succeeded */
  success: boolean;
  /** Result value (if success) */
  value?: T;
  /** Error (if failed) */
  error?: Error;
  /** Whether the task was canceled */
  canceled?: boolean;
}

/** Cancellation token for aborting tasks */
export interface CancellationToken {
  /** Whether cancellation has been requested */
  isCancelled: boolean;
  /** Request cancellation */
  cancel(): void;
  /** Register a callback for when cancellation is requested */
  onCancel(callback: () => void): void;
}

/**
 * Create a new cancellation token.
 */
export function createCancellationToken(): CancellationToken {
  let cancelled = false;
  const callbacks: (() => void)[] = [];

  return {
    get isCancelled() {
      return cancelled;
    },
    cancel() {
      if (!cancelled) {
        cancelled = true;
        for (const cb of callbacks) {
          try {
            cb();
          } catch {
            // Ignore callback errors
          }
        }
      }
    },
    onCancel(callback: () => void) {
      if (cancelled) {
        // Already cancelled, call immediately
        callback();
      } else {
        callbacks.push(callback);
      }
    },
  };
}

/** Progress callback for worker pool */
export interface PoolProgress<T> {
  /** Total number of tasks */
  total: number;
  /** Number of completed tasks (success + failed) */
  completed: number;
  /** Number of successful tasks */
  succeeded: number;
  /** Number of failed tasks */
  failed: number;
  /** Number of canceled tasks */
  canceled: number;
  /** Latest result */
  latest?: TaskResult<T>;
}

/** Options for running the worker pool */
export interface WorkerPoolOptions<T> {
  /** Concurrency limit (default: 4) */
  concurrency?: number;
  /** Cancellation token */
  cancellationToken?: CancellationToken;
  /** Progress callback (called after each task completes) */
  onProgress?: (progress: PoolProgress<T>) => void;
}

/**
 * Run tasks in parallel with a fixed concurrency limit.
 * Per-task failures don't abort remaining tasks.
 * 
 * @param tasks - Array of task functions to execute
 * @param options - Pool options (concurrency, cancellation, progress)
 * @returns Promise resolving to array of task results in original order
 */
export async function runWorkerPool<T>(
  tasks: TaskFn<T>[],
  options: WorkerPoolOptions<T> = {}
): Promise<TaskResult<T>[]> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    cancellationToken,
    onProgress,
  } = options;

  // Results array (will be filled in order)
  const results: TaskResult<T>[] = new Array(tasks.length);
  
  // Progress tracking
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let canceled = 0;

  function emitProgress(latest?: TaskResult<T>) {
    if (onProgress) {
      onProgress({
        total: tasks.length,
        completed,
        succeeded,
        failed,
        canceled,
        latest,
      });
    }
  }

  // Queue of pending task indices
  const pendingIndices: number[] = [];
  for (let i = 0; i < tasks.length; i++) {
    pendingIndices.push(i);
  }

  // Currently running count
  let inFlight = 0;

  // Promise that resolves when all tasks are done
  return new Promise((resolve) => {
    function checkDone() {
      if (completed === tasks.length) {
        resolve(results);
      }
    }

    async function runNext() {
      // Check if we're done or cancelled
      if (pendingIndices.length === 0) {
        checkDone();
        return;
      }

      // Check cancellation before starting new task
      if (cancellationToken?.isCancelled) {
        // Cancel all remaining pending tasks
        while (pendingIndices.length > 0) {
          const idx = pendingIndices.shift()!;
          results[idx] = {
            index: idx,
            success: false,
            canceled: true,
          };
          completed++;
          canceled++;
          emitProgress(results[idx]);
        }
        checkDone();
        return;
      }

      // Respect concurrency limit
      if (inFlight >= concurrency) {
        return;
      }

      // Get next task
      const taskIndex = pendingIndices.shift()!;
      const task = tasks[taskIndex];
      inFlight++;

      try {
        // Double-check cancellation right before execution
        if (cancellationToken?.isCancelled) {
          results[taskIndex] = {
            index: taskIndex,
            success: false,
            canceled: true,
          };
          canceled++;
        } else {
          const value = await task();
          
          // Check if cancelled during execution
          if (cancellationToken?.isCancelled) {
            results[taskIndex] = {
              index: taskIndex,
              success: false,
              canceled: true,
            };
            canceled++;
          } else {
            results[taskIndex] = {
              index: taskIndex,
              success: true,
              value,
            };
            succeeded++;
          }
        }
      } catch (err) {
        results[taskIndex] = {
          index: taskIndex,
          success: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
        failed++;
      }

      completed++;
      inFlight--;
      emitProgress(results[taskIndex]);

      // If cancelled, cancel all remaining pending tasks before checking done
      if (cancellationToken?.isCancelled && pendingIndices.length > 0) {
        while (pendingIndices.length > 0) {
          const idx = pendingIndices.shift()!;
          results[idx] = {
            index: idx,
            success: false,
            canceled: true,
          };
          completed++;
          canceled++;
          emitProgress(results[idx]);
        }
      }

      // Start more tasks if not cancelled
      while (inFlight < concurrency && pendingIndices.length > 0 && !cancellationToken?.isCancelled) {
        runNext();
      }

      checkDone();
    }

    // Initial kickoff - start up to `concurrency` tasks
    const initialCount = Math.min(concurrency, tasks.length);
    for (let i = 0; i < initialCount; i++) {
      runNext();
    }

    // Handle empty task list
    if (tasks.length === 0) {
      resolve(results);
    }
  });
}

/**
 * Check if cancellation has been requested (utility for tasks).
 */
export function throwIfCancelled(token: CancellationToken | undefined): void {
  if (token?.isCancelled) {
    const error = new Error('Operation cancelled');
    error.name = 'CancellationError';
    throw error;
  }
}

/**
 * Check if an error is a cancellation error.
 */
export function isCancellationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'CancellationError';
}
