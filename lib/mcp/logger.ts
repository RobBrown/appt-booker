/**
 * MCP tool call logger.
 *
 * Logs tool name, user email, status, and timing.
 * Deliberately does NOT log request bodies, tokens, or other sensitive data.
 */

export interface ToolCallLogEntry {
  tool: string;
  userEmail: string;
  status: "success" | "error";
  durationMs: number;
}

export function logToolCall(entry: ToolCallLogEntry): void {
  const timestamp = new Date().toISOString();
  // Use console.info for normal tool calls so they're distinguishable from
  // error output (console.error is reserved for actual errors).
  console.info(
    `[MCP] ${timestamp} tool=${entry.tool} user=${entry.userEmail} status=${entry.status} duration=${entry.durationMs}ms`
  );
}
