/**
 * Coalesce renderer check-progress events into one signal update window.
 *
 * IPC can deliver several app results back-to-back. Keeping the buffer as a
 * small module makes the scheduling policy testable without importing the
 * renderer bootstrap module.
 */
type ProgressResult = { name?: string; _sessionId?: string } & Record<string, any>;
type Flush = (_results: ProgressResult[], _sessionId?: string) => void;
type TimerHandle = ReturnType<typeof setTimeout>;

export function createProgressBuffer(
  flush: Flush,
  schedule: (_callback: () => void) => TimerHandle = (_callback) => setTimeout(_callback, 0),
  cancel: (_handle: TimerHandle) => void = (_handle) => clearTimeout(_handle),
) {
  let pending = new Map<string, ProgressResult[]>();
  let timer: TimerHandle | null = null;

  function flushPending() {
    timer = null;
    const batches = pending;
    pending = new Map();
    for (const [sessionKey, results] of batches) {
      flush(results, sessionKey || undefined);
    }
  }

  function enqueue(result: ProgressResult) {
    if (!result || !result.name) return;
    const sessionKey = result._sessionId || "";
    const batch = pending.get(sessionKey) || [];
    batch.push(result);
    pending.set(sessionKey, batch);
    if (timer === null) timer = schedule(flushPending);
  }

  function flushNow() {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    if (pending.size > 0) flushPending();
  }

  function dispose() {
    if (timer !== null) cancel(timer);
    timer = null;
    pending.clear();
  }

  return { enqueue, flush: flushNow, dispose };
}
