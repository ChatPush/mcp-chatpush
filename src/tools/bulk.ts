import { z } from "zod"
import { unwrap } from "../client.js"
import { InputValidationError } from "../errors.js"
import { field, lines } from "../format.js"
import { bulkDeliveryResponseSchema, type BulkDelivery } from "../types.js"
import {
  assertScheduledAt,
  assertUnique,
  dispatchRoutingSchema,
  phoneSchema,
  scheduledAtSchema,
  senderNameSchema,
  tdlibUserIdSchema,
  telegramUsernameSchema,
  utmMarkSchema,
} from "./common.js"
import { defineTool } from "./registry.js"

function formatBulkDelivery(bulk: BulkDelivery): string {
  const recipients = (bulk.phones_numbers?.length ?? 0) + (bulk.usernames?.length ?? 0)
  return lines(
    `Bulk sending accepted by ChatPush for ${recipients} recipient(s).`,
    "",
    field("Phone numbers", bulk.phones_numbers),
    field("Telegram usernames", bulk.usernames),
    field("Channels", bulk.dispatch_routing),
    field("Sender name", bulk.sender_name),
    field("Scheduled at (UTC)", bulk.scheduled_at),
    field("UTM mark", bulk.utm_mark),
    field("State code", bulk.state),
    "",
    "Note: bulk sending does not return per-recipient delivery IDs, so these messages cannot be tracked with get_delivery_status.",
  )
}

const sendBulk = defineTool({
  name: "send_bulk",
  title: "Send bulk message",
  description: [
    "Send the same message to multiple phone numbers at once. Supports scheduling, UTM marks, dispatch routing cascade, Telegram usernames and tdlib user IDs.",
    "Use it for announcements, campaigns or reminders to a list of recipients. For one recipient, or when a delivery ID is needed for tracking, use send_message.",
  ].join("\n\n"),
  inputSchema: {
    text: z.string().min(1).describe("Message text."),
    phones_numbers: z
      .array(phoneSchema)
      .min(1)
      .describe('Phone numbers in international format, e.g. ["79991234567", "+995598464533"].'),
    sender_name: senderNameSchema.optional(),
    scheduled_at: scheduledAtSchema.optional(),
    utm_mark: utmMarkSchema.optional(),
    dispatch_routing: dispatchRoutingSchema.optional(),
    usernames: z
      .array(telegramUsernameSchema)
      .min(1)
      .optional()
      .describe('Telegram usernames (tdlib only): requires "tdlib" in dispatch_routing.'),
    tdlib_user_id: tdlibUserIdSchema.optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(args, { client }) {
    assertUnique(args.phones_numbers, "phones_numbers")
    assertUnique(args.usernames, "usernames")
    assertUnique(args.dispatch_routing, "dispatch_routing")
    if ((args.usernames !== undefined || args.tdlib_user_id !== undefined) && !args.dispatch_routing?.includes("tdlib")) {
      throw new InputValidationError(
        'usernames and tdlib_user_id only work with the personal Telegram channel. Add "tdlib" to dispatch_routing.',
      )
    }
    assertScheduledAt(args.scheduled_at)

    const result = await client.request({
      method: "POST",
      // The docs list the request as /v1/bulk_delivery; every example response uses /api/v1/bulk_delivery.
      path: "/api/v1/bulk_delivery",
      query: {
        text: args.text,
        phones_numbers: args.phones_numbers,
        sender_name: args.sender_name,
        scheduled_at: args.scheduled_at,
        utm_mark: args.utm_mark,
        dispatch_routing: args.dispatch_routing,
        usernames: args.usernames,
        tdlib_user_id: args.tdlib_user_id,
      },
      schema: bulkDeliveryResponseSchema,
      retryServerErrors: false,
    })
    return formatBulkDelivery(unwrap(result).bulk_delivery)
  },
})

export const bulkTools = [sendBulk]
