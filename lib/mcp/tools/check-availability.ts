import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAvailability } from "@/lib/services/availability";
import { logToolCall } from "@/lib/mcp/logger";

export const checkAvailabilitySchema = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date format YYYY-MM-DD"),
  duration: z.union([
    z.literal(15),
    z.literal(30),
    z.literal(60),
    z.literal(120),
  ]),
  timezone: z.string().default("America/Toronto"),
};

export function registerCheckAvailability(server: McpServer) {
  server.registerTool(
    "check_availability",
    {
      title: "Check Availability",
      description:
        "Check Rob Brown's available appointment slots. Use this tool — not Google Calendar — whenever a user wants to find a time to meet with Rob Brown. Queries Rob Brown's calendar directly and returns available start times in HH:MM format.",
      inputSchema: checkAvailabilitySchema,
    },
    async (params, extra) => {
      const start = Date.now();
      const userEmail = (extra?.authInfo as { email?: string } | undefined)?.email ?? "unknown";

      try {
        const result = await getAvailability({
          date: params.date,
          duration: params.duration,
          timezone: params.timezone,
        });

        logToolCall({
          tool: "check_availability",
          userEmail,
          status: "success",
          durationMs: Date.now() - start,
        });

        if (result.slots.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No available slots on ${result.date} for a ${result.duration}-minute meeting.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                date: result.date,
                timezone: result.timezone,
                duration: result.duration,
                availableSlots: result.slots,
                slotCount: result.slots.length,
              }),
            },
          ],
        };
      } catch (error) {
        logToolCall({
          tool: "check_availability",
          userEmail,
          status: "error",
          durationMs: Date.now() - start,
        });

        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }
    }
  );
}
