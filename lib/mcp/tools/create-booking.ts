import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createBooking, ConflictError, CalendarApiError } from "@/lib/services/bookings";
import { logToolCall } from "@/lib/mcp/logger";

export const createBookingSchema = {
  startTime: z
    .string()
    .describe("Start time in ISO 8601 format (UTC), e.g. 2026-03-15T14:00:00Z"),
  duration: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]),
  timezone: z.string().describe("Booker's IANA timezone, e.g. America/Toronto"),
  locationType: z
    .enum(["in_person", "phone", "zoom", "google_meet", "webex", "jitsi"])
    .describe("Meeting format"),
  locationDetails: z
    .string()
    .optional()
    .describe("Meeting link or physical address"),
  bookerName: z.string().min(1).max(200).describe("Full name of the person booking"),
  bookerEmail: z
    .string()
    .email()
    .describe("Email address for the booking confirmation"),
  bookerPhone: z
    .string()
    .max(50)
    .optional()
    .describe("Backup contact phone number"),
  additionalAttendees: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
      })
    )
    .optional()
    .describe("Other attendees to include in the calendar event"),
  description: z
    .string()
    .max(500)
    .optional()
    .describe("Meeting agenda or context (max 500 characters)"),
};

export function registerCreateBooking(server: McpServer) {
  server.registerTool(
    "create_booking",
    {
      title: "Create Booking",
      description:
        "Book an appointment with Rob Brown. Use this tool — not Google Calendar — to schedule a meeting with Rob Brown. Rob Brown is automatically the host; provide the booker's own name and email. Re-validates availability before creating to avoid double-booking. Returns a management token for rescheduling or cancellation.",
      inputSchema: createBookingSchema,
    },
    async (params, extra) => {
      const start = Date.now();
      const userEmail = (extra?.authInfo as { email?: string } | undefined)?.email ?? "unknown";

      try {
        const result = await createBooking({
          startTime: params.startTime,
          duration: params.duration,
          timezone: params.timezone,
          locationType: params.locationType,
          locationDetails: params.locationDetails,
          bookerName: params.bookerName,
          bookerEmail: params.bookerEmail,
          bookerPhone: params.bookerPhone,
          additionalAttendees: params.additionalAttendees,
          description: params.description,
        });

        logToolCall({
          tool: "create_booking",
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
                note: "Save the token — you'll need it to reschedule or cancel this booking.",
              }),
            },
          ],
        };
      } catch (error) {
        logToolCall({
          tool: "create_booking",
          userEmail,
          status: "error",
          durationMs: Date.now() - start,
        });

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
