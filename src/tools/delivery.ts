import { z } from "zod"
import { unwrap } from "../client.js"
import { describeStatus, describeTrafficCategory, field, formatOperator, lines } from "../format.js"
import { deliveryResponseSchema, successResponseSchema, type Delivery } from "../types.js"
import {
  assertRecipient,
  assertScheduledAt,
  callbackUrlSchema,
  dispatchRoutingSchema,
  externalIdSchema,
  phoneSchema,
  prioritySchema,
  replyToMessageIdSchema,
  scheduledAtSchema,
  senderNameSchema,
  simulateTypingSchema,
  tdlibUserIdSchema,
  telegramUsernameSchema,
  utmMarkSchema,
} from "./common.js"
import { defineTool } from "./registry.js"

export function formatDelivery(delivery: Delivery, heading: string): string {
  const statusId = delivery.status?.status_id ?? delivery.status_id
  const statusDescription = delivery.status?.description ?? delivery.status_description
  return lines(
    heading,
    "",
    field("Delivery ID", delivery.id),
    field("Recipient", delivery.phone),
    field("Status", statusId != null ? describeStatus(statusId, statusDescription) : statusDescription),
    field("Channels", delivery.dispatch_routing),
    field("Operator", formatOperator(delivery.operator)),
    field("Sender name", delivery.sender_name),
    field("Priority", delivery.priority),
    field("Scheduled at (UTC)", delivery.scheduled_at),
    field("Cost", delivery.sum),
    field("SMS segments", delivery.total_sms),
    field("Traffic category", describeTrafficCategory(delivery.traffic_category)),
    field("External ID", delivery.external_id),
    field("UTM mark", delivery.utm_mark),
    field("Reply to message", delivery.reply_to_message_id),
    field("Callback URL", delivery.callback_url),
  )
}

const sendMessage = defineTool({
  name: "send_message",
  title: "Send message",
  description: [
    "Send a text message via WhatsApp, Telegram (tdlib), Telegram Bot, SMS, VK/OK (notify), or MAX (max), with optional cascade fallback between channels. Supports scheduling, priority, reply-to, typing simulation, and delivery callbacks.",
    "Use it when the user asks to text, message, notify or reply to one person or group chat. For many phone numbers use send_bulk; for documents, images, audio or video use send_file.",
    'Recipient: `phone` is required, except for personal Telegram (dispatch_routing ["tdlib"]) where `username` or `tdlib_user_id` can be used instead, and WhatsApp where `whatsapp_lid` can be used.',
    "Returns the delivery ID for get_delivery_status and delete_delivery.",
  ].join("\n\n"),
  inputSchema: {
    phone: phoneSchema
      .optional()
      .describe("Recipient phone in international format, e.g. 79991234567. Optional if username/tdlib_user_id is used for tdlib."),
    text: z
      .string()
      .min(1)
      .describe("Message text. Max 3500 chars; 938 when dispatch_routing (or the account default routing) includes SMS. One SMS segment is 160 Latin characters."),
    sender_name: senderNameSchema.optional(),
    utm_mark: utmMarkSchema.optional(),
    callback_url: callbackUrlSchema.optional(),
    external_id: externalIdSchema.optional(),
    dispatch_routing: dispatchRoutingSchema.optional(),
    scheduled_at: scheduledAtSchema.optional(),
    priority: prioritySchema.optional(),
    username: telegramUsernameSchema
      .optional()
      .describe("Telegram username (format: username or @username). tdlib only."),
    reply_to_message_id: replyToMessageIdSchema.optional(),
    tdlib_user_id: tdlibUserIdSchema.optional(),
    simulate_typing: simulateTypingSchema.optional(),
    whatsapp_lid: z
      .string()
      .regex(/^\d+(@lid)?$/, "whatsapp_lid must look like 43445322325 or 43445322325@lid")
      .optional()
      .describe("WhatsApp LID. Format: 43445322325 or 43445322325@lid. WhatsApp only."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(args, { client }) {
    assertRecipient(args)
    assertScheduledAt(args.scheduled_at)

    const result = await client.request({
      method: "POST",
      path: "/api/v1/delivery",
      query: {
        phone: args.phone,
        text: args.text,
        sender_name: args.sender_name,
        utm_mark: args.utm_mark,
        callback_url: args.callback_url,
        external_id: args.external_id,
        dispatch_routing: args.dispatch_routing,
        scheduled_at: args.scheduled_at,
        priority: args.priority,
        username: args.username,
        reply_to_message_id: args.reply_to_message_id,
        tdlib_user_id: args.tdlib_user_id,
        simulate_typing: args.simulate_typing,
        whatsapp_lid: args.whatsapp_lid,
      },
      schema: deliveryResponseSchema,
      retryServerErrors: false,
    })
    const { delivery } = unwrap(result)
    const scheduled = args.scheduled_at ? ` and scheduled for ${args.scheduled_at} UTC` : ""
    return formatDelivery(
      delivery,
      `Message accepted by ChatPush${scheduled}. Check delivery with get_delivery_status (id ${delivery.id}).`,
    )
  },
})

const getDeliveryStatus = defineTool({
  name: "get_delivery_status",
  title: "Get delivery status",
  description:
    "Get the current status and full details of a specific message delivery by its ID. Returns status, operator info, phone, scheduled time, costs and more. " +
    "Use it after send_message or send_file when the user asks whether a message was delivered or read, or why it failed — the status is explained in plain words.",
  inputSchema: {
    id: z.number().int().positive().describe("Delivery ID from the send_message or send_file response."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "GET",
      path: `/api/v1/delivery/${args.id}`,
      schema: deliveryResponseSchema,
    })
    return formatDelivery(unwrap(result).delivery, `Delivery ${args.id}:`)
  },
})

const deleteDelivery = defineTool({
  name: "delete_delivery",
  title: "Delete delivery",
  description: [
    "Delete a sent message from WhatsApp or Telegram (tdlib). Only works for messages with final 'Delivered' status. Deletion occurs on all recipient devices.",
    "Only messages sent through ChatPush via the tdlib or whatsapp channels can be deleted; SMS cannot. Use it when the user asks to unsend or recall a message.",
  ].join("\n\n"),
  inputSchema: {
    delivery_id: z.number().int().positive().describe("ID of the delivered message to delete (delivery.id from send_message)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "DELETE",
      path: `/api/v1/delivery/${args.delivery_id}`,
      schema: successResponseSchema,
    })
    unwrap(result)
    return `Message ${args.delivery_id} was deleted on all recipient devices.`
  },
})

export const deliveryTools = [sendMessage, getDeliveryStatus, deleteDelivery]
