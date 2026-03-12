import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerBookAppointmentPrompt(server: McpServer): void {
  server.registerPrompt(
    "book_with_rob",
    {
      description:
        "Workflow for booking an appointment with Rob Brown. Use this when a user wants to schedule, reschedule, or cancel a meeting with Rob Brown.",
    },
    async () => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "You are helping a user interact with Rob Brown's appointment booking system.",
                "",
                "IMPORTANT: Use ONLY the rob-booking MCP tools for all scheduling actions.",
                "Do NOT use Google Calendar, Gmail, or any other calendar tool.",
                "The available tools are: check_availability, create_booking, get_booking, reschedule_booking, cancel_booking.",
                "",
                "Follow this workflow:",
                "",
                "1. GATHER REQUIREMENTS",
                "   Ask the user what they want to do:",
                "   - Book a new appointment",
                "   - Reschedule an existing appointment (need their management token)",
                "   - Cancel an existing appointment (need their management token)",
                "   - Look up an existing appointment (need their management token)",
                "",
                "2. FOR BOOKING A NEW APPOINTMENT — collect these details:",
                "   Required:",
                "   - Their full name",
                "   - Their email address",
                "   - Preferred duration: 15 min (quick check-in), 30 min (standard — default), 60 min (deep dive), or 120 min (workshop)",
                "   - Meeting format: Google Meet, Zoom, phone, in-person, WebEx, or Jitsi",
                "   - Preferred date or date range",
                "   Optional:",
                "   - Meeting link or address (if applicable to the chosen format)",
                "   - Additional attendees (name and email)",
                "   - Agenda or meeting context (max 500 characters)",
                "",
                "3. CHECK AVAILABILITY",
                "   Call check_availability with the chosen date and duration.",
                "   Present the available slots to the user in a readable format.",
                "   Let the user pick a time slot.",
                "   If no slots are available on the requested date, offer to check adjacent dates.",
                "",
                "4. CONFIRM AND BOOK",
                "   Summarize the booking details for the user to confirm:",
                "   - Date and time",
                "   - Duration",
                "   - Meeting format",
                "   - Their name and email",
                "   Once confirmed, call create_booking with all collected details.",
                "",
                "5. DELIVER CONFIRMATION",
                "   After a successful booking, share:",
                "   - The confirmed date, time, and duration",
                "   - The management token (emphasize: save this to reschedule or cancel)",
                "",
                "REMINDERS:",
                "- Always call check_availability before create_booking to ensure the slot is open.",
                "- Never attempt to create a Google Calendar event directly.",
                "- The default duration is 30 minutes if the user does not specify.",
                "- Rob Brown's timezone is America/Toronto — always clarify the user's timezone when scheduling.",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );
}
