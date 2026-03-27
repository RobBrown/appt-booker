/**
 * MCP tool call logger.
 *
 * Logs tool name, status, and timing via observability-core.
 * Deliberately does NOT log request bodies, tokens, or other sensitive data.
 * userEmail is omitted (PII) — use a safe surrogate if needed.
 */

import { logger } from "@hal866245/observability-core";

const log = logger.child({ service: "mcp" });

export interface ToolCallLogEntry {
  tool: string;
  userEmail: string;
  status: "success" | "error";
  durationMs: number;
}

export function logToolCall(entry: ToolCallLogEntry): void {
  log.info("MCP tool call", {
    tool: entry.tool,
    status: entry.status,
    duration_ms: entry.durationMs,
  });
}
