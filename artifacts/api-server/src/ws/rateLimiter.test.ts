/**
 * Unit tests for the per-user WebSocket rate limiter.
 * Run with: node --import tsx/esm --test src/ws/rateLimiter.test.ts
 * Or via: pnpm test
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, _setClock, _resetAll } from "./rateLimiter.ts";

// Fake monotonic clock — start at t=0 ms
let fakeNow = 0;
const tick = (ms: number) => { fakeNow += ms; };

describe("checkRateLimit", () => {
  beforeEach(() => {
    fakeNow = 1_000_000; // arbitrary non-zero base
    _resetAll();
    _setClock(() => fakeNow);
  });

  test("allows the first 30 messages within a 1-second window", () => {
    for (let i = 0; i < 30; i++) {
      assert.equal(checkRateLimit("user1"), true, `message ${i + 1} should be allowed`);
    }
  });

  test("rejects the 31st message within the same 1-second window", () => {
    for (let i = 0; i < 30; i++) checkRateLimit("user1");
    assert.equal(checkRateLimit("user1"), false, "31st message should be rejected");
  });

  test("allows messages again after the window slides past old timestamps", () => {
    // Fill the window
    for (let i = 0; i < 30; i++) checkRateLimit("user1");
    assert.equal(checkRateLimit("user1"), false, "should be at limit");

    // Advance time by 1001 ms so every previous timestamp is outside the window
    tick(1_001);

    assert.equal(checkRateLimit("user1"), true, "should be allowed after window expires");
  });

  test("counter persists across simulated reconnect — reconnect does NOT reset the budget", () => {
    // Simulate the user sending 30 messages (hit limit)
    for (let i = 0; i < 30; i++) checkRateLimit("user1");
    assert.equal(checkRateLimit("user1"), false, "should be at limit before reconnect");

    // Simulate disconnect + immediate reconnect (no time passes)
    // Old code called removeRateLimitEntry here; new code does NOT.
    // The counter must still be active.
    assert.equal(checkRateLimit("user1"), false, "should still be rate-limited after reconnect within window");
  });

  test("evicted socket close does not wipe the new socket's counter", () => {
    // Both old and new sockets are for userId "user1".
    // Old flow: new socket is authenticated, evicted socket's close handler
    // fires and used to call removeRateLimitEntry(userId). Now it does not.
    for (let i = 0; i < 29; i++) checkRateLimit("user1");
    // 29 messages in — simulate replacement connection's close handler firing
    // (it should be a no-op; the counter must remain with 29 timestamps)
    // No-op: we simply don't call anything here, matching new server.ts behaviour
    assert.equal(checkRateLimit("user1"), true,  "30th message allowed — counter intact after replacement");
    assert.equal(checkRateLimit("user1"), false, "31st message rejected — counter intact after replacement");
  });

  test("independent users have separate counters", () => {
    for (let i = 0; i < 30; i++) checkRateLimit("alice");
    assert.equal(checkRateLimit("alice"), false, "alice should be limited");
    assert.equal(checkRateLimit("bob"),   true,  "bob should be unaffected");
  });

  test("partial window slide allows proportional new messages", () => {
    // Send 30 messages at t=0
    for (let i = 0; i < 30; i++) checkRateLimit("user1");
    assert.equal(checkRateLimit("user1"), false);

    // Advance 500 ms — only timestamps at t=0 that are now ≤ (now - 1000)
    // are evicted. Since we advanced 500 ms, no timestamps are outside yet
    // (they are all at fakeNow-500, which is within the 1-second window).
    tick(500);
    assert.equal(checkRateLimit("user1"), false, "still limited at 500ms");

    // Advance another 501 ms so now=fakeNow+1001: all 30 original timestamps
    // are now outside the window and get evicted.
    tick(501);
    assert.equal(checkRateLimit("user1"), true, "allowed after full window slides past");
  });
});
