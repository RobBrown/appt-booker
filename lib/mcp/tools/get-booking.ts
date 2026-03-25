import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBooking, NotFoundError } from "@/lib/services/bookings";
import { logToolCall } from "@/lib/mcp/logger";

export const getBookingSchema = {
  token: z.string().uuid().describe("The booking's management token (UUID)"),
};

export function registerGetBooking(server: McpServer) {
  server.registerTool(
    "get_booking",
    {
      title: "Get Booking",
      description:
        "Look up an existing Rob Brown appointment by its management token. Use this tool — not Google Calendar — to retrieve booking details.",
      inputSchema: getBookingSchema,
    },
    async (params, extra) => {
      const start = Date.now();
      const userEmail = (extra?.authInfo as { email?: string } | undefined)?.email ?? "unknown";

      try {
        const result = await getBooking(params.token);

        logToolCall({
          tool: "get_booking",
          userEmail,
          status: "success",
          durationMs: Date.now() - start,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        logToolCall({
          tool: "get_booking",
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

        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }
    }
  );
}
