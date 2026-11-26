import { describe, expect, it } from "vitest";
import { parseClientMessage, sanitizeInput, asSeq, asTick } from "@biplane/shared";

class TokenBucketLimiter {
  private tokens: number;
  private lastRefillMs: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    nowMs = 0
  ) {
    this.tokens = capacity;
    this.lastRefillMs = nowMs;
  }

  allow(nowMs: number, cost = 1): boolean {
    const elapsedSec = Math.max(0, (nowMs - this.lastRefillMs) / 1000);
    this.lastRefillMs = nowMs;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}

describe("Server: protocol boundaries & rate limiting", () => {
  it("enforces token-bucket burst and refill over time", () => {
    const limiter = new TokenBucketLimiter(3, 10, 1000);
    expect(limiter.allow(1000)).toBe(true);
    expect(limiter.allow(1000)).toBe(true);
    expect(limiter.allow(1000)).toBe(true);
    expect(limiter.allow(1000)).toBe(false);

    expect(limiter.allow(1200)).toBe(true);
    expect(limiter.allow(1200)).toBe(true);
  });

  it("rejects malformed join/chat frames before room dispatch", () => {
    expect(parseClientMessage({ type: "join", roomId: "", name: "A" }).ok).toBe(false);
    expect(parseClientMessage({ type: "join", roomId: "room_1", name: "" }).ok).toBe(false);
    expect(parseClientMessage({ type: "chat", text: "x".repeat(250) }).ok).toBe(false);
  });

  it("sanitizes valid input frames and drops invalid ones", () => {
    const valid = sanitizeInput({
      type: "input",
      seq: 10,
      tick: 5,
      thrust: true,
      brake: false,
      left: false,
      right: true,
      fire: false,
    });
    expect(valid).toEqual({
      seq: asSeq(10),
      tick: asTick(5),
      thrust: true,
      brake: false,
      left: false,
      right: true,
      fire: false,
    });
    expect(sanitizeInput(null)).toBeNull();
  });
});
