import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { cancelBooking, NotFoundError, CalendarApiError } from "@/lib/services/bookings";
import { logToolCall } from "@/lib/mcp/logger";

export const cancelBookingSchema = {
  token: z.string().uuid().describe("The booking's management token (UUID)"),
};

export function registerCancelBooking(server: McpServer) {
  server.registerTool(
    "cancel_booking",
    {
      title: "Cancel Booking",
      description:
        "Cancel an existing Rob Brown appointment. Use this tool — not Google Calendar — to cancel. Permanently removes the calendar event.",
      inputSchema: cancelBookingSchema,
    },
    async (params, extra) => {
      const start = Date.now();
      const userEmail = (extra?.authInfo as { email?: string } | undefined)?.email ?? "unknown";

      try {
        const result = await cancelBooking(params.token);

        logToolCall({
          tool: "cancel_booking",
          userEmail,
          status: "success",
          durationMs: Date.now() - start,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: result.success,
                token: result.token,
                message: "Booking has been successfully cancelled.",
              }),
            },
          ],
        };
      } catch (error) {
        logToolCall({
          tool: "cancel_booking",
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
