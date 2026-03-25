/**
 * MCP server singleton.
 *
 * Registers all 5 booking tools and the host-info resource.
 * Import and call `initializeMcpServer` from the transport route handler.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCheckAvailability } from "@/lib/mcp/tools/check-availability";
import { registerCreateBooking } from "@/lib/mcp/tools/create-booking";
import { registerGetBooking } from "@/lib/mcp/tools/get-booking";
import { registerRescheduleBooking } from "@/lib/mcp/tools/reschedule-booking";
import { registerCancelBooking } from "@/lib/mcp/tools/cancel-booking";
import { registerHostInfoResource } from "@/lib/mcp/resources/host-info";
import { registerBookAppointmentPrompt } from "@/lib/mcp/prompts/book-appointment";

export function initializeMcpServer(server: McpServer): void {
  // Register all 5 tools
  registerCheckAvailability(server);
  registerCreateBooking(server);
  registerGetBooking(server);
  registerRescheduleBooking(server);
  registerCancelBooking(server);

  // Register the host-info resource
  registerHostInfoResource(server);

  // Register the booking workflow prompt
  registerBookAppointmentPrompt(server);
}
