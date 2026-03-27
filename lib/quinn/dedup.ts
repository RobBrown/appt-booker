import { Redis } from "@upstash/redis";
import { logger } from "@hal866245/observability-core";

const log = logger.child({ service: "quinn/dedup" });

// ---------------------------------------------------------------------------
// Redis client — lazy singleton, created on first use
// Mirrors the pattern from lib/rate-limit.ts but uses lazy init so that
// unit tests can set process.env before the first call.
// ---------------------------------------------------------------------------

function createRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    log.warn("Redis not configured — state will not persist");
    return null;
  }
  return new Redis({ url, token });
}

let _redis: Redis | null | undefined = undefined;

function getRedis(): Redis | null {
  if (_redis === undefined) {
    _redis = createRedis();
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Redis key constants (D-03)
// ---------------------------------------------------------------------------

const KEY_HISTORY_ID = "quinn:historyId";
const KEY_PROCESSED_PREFIX = "quinn:processed:";
const KEY_CONSECUTIVE_FAILURES = "quinn:consecutiveFailures";

// Dedup TTL: 7 days in seconds (D-03)
const DEDUP_TTL_SECONDS = 604800;

// ---------------------------------------------------------------------------
// Cursor: historyId persistence
// ---------------------------------------------------------------------------

/**
 * Get the stored Gmail historyId cursor.
 * Returns null when key is absent (first run) or Redis is unavailable.
 */
export async function getHistoryId(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  return redis.get<string>(KEY_HISTORY_ID);
}

/**
 * Persist the Gmail historyId cursor.
 * No TTL — cursor must survive indefinitely.
 */
export async function setHistoryId(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(KEY_HISTORY_ID, id);
}

// ---------------------------------------------------------------------------
// Message deduplication
// ---------------------------------------------------------------------------

/**
 * Returns true if this messageId has already been processed.
 * Returns false when key is absent or Redis is unavailable.
 */
export async function isProcessed(messageId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const val = await redis.get(`${KEY_PROCESSED_PREFIX}${messageId}`);
  return val !== null;
}

/**
 * Mark a messageId as processed with a 7-day TTL (D-03).
 */
export async function markProcessed(messageId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(`${KEY_PROCESSED_PREFIX}${messageId}`, "1", { ex: DEDUP_TTL_SECONDS });
}

// ---------------------------------------------------------------------------
// Consecutive failure tracking (D-06)
// ---------------------------------------------------------------------------

/**
 * Get the count of consecutive poll failures.
 * Returns 0 when key is absent or Redis is unavailable.
 */
export async function getConsecutiveFailures(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const val = await redis.get<number>(KEY_CONSECUTIVE_FAILURES);
  return val ?? 0;
}

/**
 * Increment the consecutive failure counter.
 * Returns the new count.
 */
export async function incrementConsecutiveFailures(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  return redis.incr(KEY_CONSECUTIVE_FAILURES);
}

/**
 * Reset the consecutive failure counter to 0 after a successful poll.
 */
export async function resetConsecutiveFailures(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(KEY_CONSECUTIVE_FAILURES, 0);
}
