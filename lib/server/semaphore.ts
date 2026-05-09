/**
 * Tiny FIFO semaphore — limits how many tasks can be in their critical
 * section at once. Zero runtime deps (backend stays Bun built-ins only).
 *
 * Usage:
 *   const sem = createSemaphore(3);
 *   const release = await sem.acquire();
 *   try { ...work... } finally { release(); }
 */
export interface Semaphore {
  acquire(): Promise<() => void>;
  /** Number of tasks currently holding a slot. */
  active(): number;
  /** Number of waiters queued. */
  pending(): number;
}

export function createSemaphore(max: number): Semaphore {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`createSemaphore: max must be a positive integer (got ${max})`);
  }

  let activeCount = 0;
  const waiters: Array<(release: () => void) => void> = [];

  function makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeCount--;
      const next = waiters.shift();
      if (next) {
        activeCount++;
        next(makeRelease());
      }
    };
  }

  return {
    acquire(): Promise<() => void> {
      if (activeCount < max) {
        activeCount++;
        return Promise.resolve(makeRelease());
      }
      return new Promise<() => void>((resolve) => {
        waiters.push(resolve);
      });
    },
    active() {
      return activeCount;
    },
    pending() {
      return waiters.length;
    },
  };
}
