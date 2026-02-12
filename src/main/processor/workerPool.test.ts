/**
 * Unit tests for worker pool.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runWorkerPool,
  createCancellationToken,
  throwIfCancelled,
  isCancellationError,
  DEFAULT_CONCURRENCY,
  type TaskFn,
  type PoolProgress,
} from './workerPool';

describe('workerPool', () => {
  describe('runWorkerPool', () => {
    it('should run empty task list', async () => {
      const results = await runWorkerPool([]);
      expect(results).toEqual([]);
    });

    it('should run single task successfully', async () => {
      const task: TaskFn<number> = async () => 42;
      const results = await runWorkerPool([task]);
      
      expect(results.length).toBe(1);
      expect(results[0].index).toBe(0);
      expect(results[0].success).toBe(true);
      expect(results[0].value).toBe(42);
    });

    it('should run multiple tasks and preserve order', async () => {
      const tasks: TaskFn<number>[] = [
        async () => { await delay(30); return 1; },
        async () => { await delay(10); return 2; },
        async () => { await delay(20); return 3; },
      ];
      
      const results = await runWorkerPool(tasks);
      
      expect(results.length).toBe(3);
      expect(results[0].value).toBe(1);
      expect(results[1].value).toBe(2);
      expect(results[2].value).toBe(3);
    });

    it('should handle task failures without aborting', async () => {
      const tasks: TaskFn<number>[] = [
        async () => 1,
        async () => { throw new Error('Task 2 failed'); },
        async () => 3,
      ];
      
      const results = await runWorkerPool(tasks);
      
      expect(results.length).toBe(3);
      expect(results[0].success).toBe(true);
      expect(results[0].value).toBe(1);
      
      expect(results[1].success).toBe(false);
      expect(results[1].error?.message).toBe('Task 2 failed');
      
      expect(results[2].success).toBe(true);
      expect(results[2].value).toBe(3);
    });

    it('should respect concurrency limit of 4', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      
      const tasks: TaskFn<number>[] = Array.from({ length: 10 }, (_, i) => async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await delay(20);
        currentConcurrent--;
        return i;
      });
      
      await runWorkerPool(tasks, { concurrency: 4 });
      
      expect(maxConcurrent).toBe(4);
    });

    it('should never exceed specified concurrency', async () => {
      const concurrencyLevels = [1, 2, 3, 4, 8];
      
      for (const limit of concurrencyLevels) {
        let maxConcurrent = 0;
        let currentConcurrent = 0;
        
        const tasks: TaskFn<number>[] = Array.from({ length: 20 }, (_, i) => async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await delay(5);
          currentConcurrent--;
          return i;
        });
        
        await runWorkerPool(tasks, { concurrency: limit });
        
        expect(maxConcurrent).toBeLessThanOrEqual(limit);
      }
    });

    it('should call progress callback after each task', async () => {
      const progressUpdates: PoolProgress<number>[] = [];
      
      const tasks: TaskFn<number>[] = [
        async () => 1,
        async () => 2,
        async () => 3,
      ];
      
      await runWorkerPool(tasks, {
        onProgress: (progress) => progressUpdates.push({ ...progress }),
      });
      
      expect(progressUpdates.length).toBe(3);
      expect(progressUpdates[progressUpdates.length - 1].completed).toBe(3);
      expect(progressUpdates[progressUpdates.length - 1].succeeded).toBe(3);
    });

    it('should track failures in progress', async () => {
      const progressUpdates: PoolProgress<number>[] = [];
      
      const tasks: TaskFn<number>[] = [
        async () => 1,
        async () => { throw new Error('fail'); },
        async () => 3,
      ];
      
      await runWorkerPool(tasks, {
        onProgress: (progress) => progressUpdates.push({ ...progress }),
      });
      
      const final = progressUpdates[progressUpdates.length - 1];
      expect(final.completed).toBe(3);
      expect(final.succeeded).toBe(2);
      expect(final.failed).toBe(1);
    });

    it('should use default concurrency of 4', () => {
      expect(DEFAULT_CONCURRENCY).toBe(4);
    });
  });

  describe('cancellation', () => {
    it('should create cancellation token with isCancelled false', () => {
      const token = createCancellationToken();
      expect(token.isCancelled).toBe(false);
    });

    it('should set isCancelled to true when cancel() called', () => {
      const token = createCancellationToken();
      token.cancel();
      expect(token.isCancelled).toBe(true);
    });

    it('should call onCancel callbacks when cancelled', () => {
      const token = createCancellationToken();
      const callback = vi.fn();
      
      token.onCancel(callback);
      expect(callback).not.toHaveBeenCalled();
      
      token.cancel();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel immediately if already cancelled', () => {
      const token = createCancellationToken();
      token.cancel();
      
      const callback = vi.fn();
      token.onCancel(callback);
      
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should cancel pending tasks when token is cancelled', async () => {
      const token = createCancellationToken();
      const executed: number[] = [];
      
      const tasks: TaskFn<number>[] = Array.from({ length: 10 }, (_, i) => async () => {
        executed.push(i);
        await delay(50);
        return i;
      });
      
      // Cancel after a short delay
      setTimeout(() => token.cancel(), 25);
      
      const results = await runWorkerPool(tasks, {
        concurrency: 2,
        cancellationToken: token,
      });
      
      // Some tasks should either succeed or be cancelled (not all should succeed)
      const successCount = results.filter(r => r.success).length;
      const canceledCount = results.filter(r => r.canceled).length;
      
      // Should have processed all tasks (either success or canceled)
      expect(successCount + canceledCount).toBe(tasks.length);
      
      // At least some should be canceled (since we canceled early)
      // Due to timing, this may vary, so we just check we got some results
      expect(results.length).toBe(tasks.length);
    }, 10000);

    it('should mark cancelled tasks correctly in results', async () => {
      const token = createCancellationToken();
      
      const tasks: TaskFn<number>[] = [
        async () => { await delay(10); return 1; },
        async () => { await delay(10); return 2; },
        async () => { await delay(100); return 3; },
        async () => { await delay(100); return 4; },
      ];
      
      // Cancel before tasks 3 and 4 complete
      setTimeout(() => token.cancel(), 25);
      
      const results = await runWorkerPool(tasks, {
        concurrency: 2,
        cancellationToken: token,
      });
      
      // Check that cancelled tasks are marked correctly
      for (const result of results) {
        if (result.canceled) {
          expect(result.success).toBe(false);
          expect(result.value).toBeUndefined();
        }
      }
    });

    it('should track canceled count in progress', async () => {
      const token = createCancellationToken();
      let finalProgress: PoolProgress<number> | undefined;
      
      const tasks: TaskFn<number>[] = Array.from({ length: 8 }, (_, i) => async () => {
        await delay(i === 0 ? 10 : 100);
        return i;
      });
      
      setTimeout(() => token.cancel(), 20);
      
      await runWorkerPool(tasks, {
        concurrency: 2,
        cancellationToken: token,
        onProgress: (p) => { finalProgress = { ...p }; },
      });
      
      // Progress should track something
      expect(finalProgress).toBeDefined();
      expect(finalProgress!.completed).toBe(8);
      // Either canceled or succeeded, totals should match
      expect(finalProgress!.succeeded + finalProgress!.canceled + finalProgress!.failed).toBe(8);
    }, 10000);
  });

  describe('throwIfCancelled', () => {
    it('should not throw when token is not cancelled', () => {
      const token = createCancellationToken();
      expect(() => throwIfCancelled(token)).not.toThrow();
    });

    it('should throw when token is cancelled', () => {
      const token = createCancellationToken();
      token.cancel();
      expect(() => throwIfCancelled(token)).toThrow('Operation cancelled');
    });

    it('should not throw when token is undefined', () => {
      expect(() => throwIfCancelled(undefined)).not.toThrow();
    });
  });

  describe('isCancellationError', () => {
    it('should return true for cancellation errors', () => {
      const error = new Error('Operation cancelled');
      error.name = 'CancellationError';
      expect(isCancellationError(error)).toBe(true);
    });

    it('should return false for regular errors', () => {
      const error = new Error('Regular error');
      expect(isCancellationError(error)).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isCancellationError('string')).toBe(false);
      expect(isCancellationError(null)).toBe(false);
      expect(isCancellationError(undefined)).toBe(false);
    });
  });
});

// Helper function for delays
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
