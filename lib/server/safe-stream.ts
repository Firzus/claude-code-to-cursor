/**
 * Stream-cleanup helpers — calling `controller.close()` or `reader.cancel()`
 * after the stream has already errored throws synchronously. Wrap them so
 * call sites stay terse.
 */

export function safeClose<T>(controller: ReadableStreamDefaultController<T>): void {
  try {
    controller.close();
  } catch {
    // Controller already closed.
  }
}

export function safeCancel<T>(
  reader: ReadableStreamDefaultReader<T>,
  reason?: unknown,
): void {
  try {
    reader.cancel(reason).catch(() => {});
  } catch {
    // Reader already released.
  }
}
