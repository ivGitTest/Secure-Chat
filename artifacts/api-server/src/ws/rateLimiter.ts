/**
 * Per-user sliding-window rate limiter for WebSocket messages.
 *
 * Allows at most MAX_MESSAGES_PER_SECOND messages per user within any 1-second
 * window. Uses a lightweight timestamp-list approach that automatically evicts
 * stale entries.
 *
 * Design note: counters are intentionally NOT deleted when a connection closes.
 * Deleting on disconnect would allow a user to bypass the limit by
 * reconnecting — the new socket would get a fresh budget. Instead, the
 * in-memory entry is cleaned up lazily: the next call to `checkRateLimit` for
 * that userId evicts timestamps older than 1 s, and deletes the map entry
 * entirely once the list becomes empty.
 */

const MAX_MESSAGES_PER_SECOND = 30;
const WINDOW_MS = 1_000;

/** Map from userId → list of message timestamps (ms) within the current window. */
const counters = new Map<string, number[]>();

/** Overrideable clock — lets tests inject a fake `Date.now`. */
export let clock: () => number = Date.now;

/** @internal — used by tests only. */
export function _setClock(fn: () => number): void {
  clock = fn;
}

/** @internal — used by tests only to inspect / reset state. */
export function _resetAll(): void {
  counters.clear();
  clock = Date.now;
}

/**
 * Record a new message from `userId` and check whether the rate limit is exceeded.
 *
 * @returns `true` if the message is allowed, `false` if it should be dropped.
 */
export function checkRateLimit(userId: string): boolean {
  const now = clock();
  const windowStart = now - WINDOW_MS;

  let timestamps = counters.get(userId);
  if (!timestamps) {
    timestamps = [];
    counters.set(userId, timestamps);
  }

  // Evict timestamps outside the current window
  let i = 0;
  while (i < timestamps.length && (timestamps[i] as number) <= windowStart) {
    i++;
  }
  if (i > 0) timestamps.splice(0, i);

  // Lazy cleanup: if the list is empty this userId has no recent traffic.
  // Remove from the map so we don't accumulate empty entries indefinitely.
  if (timestamps.length === 0 && counters.get(userId) === timestamps) {
    counters.delete(userId);
    // Re-create to record this message below.
    timestamps = [];
    counters.set(userId, timestamps);
  }

  if (timestamps.length >= MAX_MESSAGES_PER_SECOND) {
    return false; // rate limit exceeded
  }

  timestamps.push(now);
  return true;
}
