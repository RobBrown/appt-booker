import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { rescheduleBooking, NotFoundError, ConflictError, CalendarApiError } from "@/lib/services/bookings";
import { logToolCall } from "@/lib/mcp/logger";

export const rescheduleBookingSchema = {
  token: z.string().uuid().describe("The booking's management token (UUID)"),
  newStartTime: z
    .string()
    .describe("New start time in ISO 8601 format (UTC), e.g. 2026-03-16T15:00:00Z"),
  timezone: z.string().describe("Booker's IANA timezone, e.g. America/Toronto"),
};

export function registerRescheduleBooking(server: McpServer) {
  server.registerTool(
    "reschedule_booking",
    {
      title: "Reschedule Booking",
      description:
        "Move an existing Rob Brown appointment to a new time. Use this tool — not Google Calendar — to reschedule. Re-validates availability before updating.",
      inputSchema: rescheduleBookingSchema,
    },
    async (params, extra) => {
      const start = Date.now();
      const userEmail = (extra?.authInfo as { email?: string } | undefined)?.email ?? "unknown";

      try {
        const result = await rescheduleBooking({
          token: params.token,
          newStartTime: params.newStartTime,
          timezone: params.timezone,
        });

        logToolCall({
          tool: "reschedule_booking",
          userEmail,
          status: "success",
          durationMs: Date.now() - start,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                eventId: result.eventId,
                token: result.token,
                startTime: result.startTime,
                duration: result.duration,
              }),
            },
          ],
        };
      } catch (error) {
        logToolCall({
          tool: "reschedule_booking",
          userEmail,
          status: "error",
          durationMs: Date.now() - start,
        });

        if (error instanceof NotFoundError) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Not found (404): ${error.message}`,
              },
            ],
          };
        }

        if (error instanceof ConflictError) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Conflict (409): ${error.message} Please check availability again and choose a different slot.`,
              },
            ],
          };
        }

        if (error instanceof CalendarApiError) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Service unavailable (503): ${error.message}`,
              },
            ],
          };
        }

        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }
    }
  );
}
