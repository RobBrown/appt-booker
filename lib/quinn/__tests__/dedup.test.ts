import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Set env vars BEFORE any imports so createRedis() sees them at module load
// ---------------------------------------------------------------------------

process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";

// ---------------------------------------------------------------------------
// Mock @upstash/redis before any module import
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockIncr = vi.fn();

vi.mock("@upstash/redis", () => {
  const MockRedis = function () {
    return { get: mockGet, set: mockSet, incr: mockIncr };
  };
  return { Redis: MockRedis };
});

// ---------------------------------------------------------------------------
// Import the module under test (static import after mocks are registered)
// ---------------------------------------------------------------------------

import {
  getHistoryId,
  setHistoryId,
  isProcessed,
  markProcessed,
  getConsecutiveFailures,
  incrementConsecutiveFailures,
  resetConsecutiveFailures,
} from "@/lib/quinn/dedup";

// ---------------------------------------------------------------------------
// Reset mock state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
  mockIncr.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getHistoryId", () => {
  it("returns null when key is absent", async () => {
    mockGet.mockResolvedValueOnce(null);
    const result = await getHistoryId();
    expect(result).toBeNull();
    expect(mockGet).toHaveBeenCalledWith("quinn:historyId");
  });

  it("returns stored string when key exists", async () => {
    mockGet.mockResolvedValueOnce("99887766");
    const result = await getHistoryId();
    expect(result).toBe("99887766");
    expect(mockGet).toHaveBeenCalledWith("quinn:historyId");
  });
});

describe("setHistoryId", () => {
  it("calls redis.set with correct key and no TTL", async () => {
    mockSet.mockResolvedValueOnce("OK");
    await setHistoryId("12345");
    expect(mockSet).toHaveBeenCalledWith("quinn:historyId", "12345");
  });
});

describe("isProcessed", () => {
  it("returns false when key is absent", async () => {
    mockGet.mockResolvedValueOnce(null);
    const result = await isProcessed("msg1");
    expect(result).toBe(false);
  });

  it("returns true when key exists", async () => {
    mockGet.mockResolvedValueOnce("1");
    const result = await isProcessed("msg1");
    expect(result).toBe(true);
    expect(mockGet).toHaveBeenCalledWith("quinn:processed:msg1");
  });
});

describe("markProcessed", () => {
  it("calls redis.set with correct key, value, and 7-day TTL", async () => {
    mockSet.mockResolvedValueOnce("OK");
    await markProcessed("msg1");
    expect(mockSet).toHaveBeenCalledWith("quinn:processed:msg1", "1", { ex: 604800 });
  });
});

describe("getConsecutiveFailures", () => {
  it("returns 0 when key is absent", async () => {
    mockGet.mockResolvedValueOnce(null);
    const result = await getConsecutiveFailures();
    expect(result).toBe(0);
    expect(mockGet).toHaveBeenCalledWith("quinn:consecutiveFailures");
  });

  it("returns stored number when key exists", async () => {
    mockGet.mockResolvedValueOnce(3);
    const result = await getConsecutiveFailures();
    expect(result).toBe(3);
  });
});

describe("incrementConsecutiveFailures", () => {
  it("calls redis.incr with correct key", async () => {
    mockIncr.mockResolvedValueOnce(2);
    const result = await incrementConsecutiveFailures();
    expect(result).toBe(2);
    expect(mockIncr).toHaveBeenCalledWith("quinn:consecutiveFailures");
  });
});

describe("resetConsecutiveFailures", () => {
  it("calls redis.set with correct key and value 0", async () => {
    mockSet.mockResolvedValueOnce("OK");
    await resetConsecutiveFailures();
    expect(mockSet).toHaveBeenCalledWith("quinn:consecutiveFailures", 0);
  });
});
