import { z } from "zod"
import { unwrap } from "../client.js"
import { InputValidationError } from "../errors.js"
import { lines } from "../format.js"
import {
  WEBHOOK_TYPES,
  WEBHOOK_TYPE_DESCRIPTIONS,
  successResponseSchema,
  webhookListResponseSchema,
  webhookResponseSchema,
  type Webhook,
} from "../types.js"
import { assertUnique } from "./common.js"
import { defineTool } from "./registry.js"

const webhookIdSchema = z.number().int().positive().describe("Webhook ID (from create_webhook or list_webhooks).")

const webhookUrlSchema = z.url({ protocol: /^https?$/ }).describe("HTTPS URL to receive notifications as POST requests.")

const webhookTypesSchema = z
  .array(z.enum(WEBHOOK_TYPES))
  .min(1)
  .describe(
    `Event types: ${WEBHOOK_TYPES.map((type) => `${type} (${WEBHOOK_TYPE_DESCRIPTIONS[type]})`).join("; ")}.`,
  )

function formatWebhook(webhook: Webhook): string {
  const types = webhook.types?.length ? webhook.types.join(", ") : "none"
  return `Webhook #${webhook.id} → ${webhook.url ?? "(no url)"}\n  Events: ${types}`
}

const createWebhook = defineTool({
  name: "create_webhook",
  title: "Create webhook",
  description:
    "Register a webhook URL to receive real-time notifications for specific ChatPush events (e.g. whatsapp_log_out, delivery status updates, incoming messages). " +
    "Use it when the user wants their server, CRM or automation (n8n, Make, Zapier) to receive replies or react to WhatsApp/Telegram events.",
  inputSchema: {
    url: webhookUrlSchema,
    types: webhookTypesSchema,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(args, { client }) {
    assertUnique(args.types, "types")
    const result = await client.request({
      method: "POST",
      path: "/api/v1/webhooks",
      query: { url: args.url, types: args.types },
      schema: webhookResponseSchema,
      retryServerErrors: false,
    })
    return lines("Webhook created.", formatWebhook(unwrap(result).webhook))
  },
})

const getWebhook = defineTool({
  name: "get_webhook",
  title: "Get webhook",
  description: "Get details of a specific webhook by its ID: the URL it posts to and the event types it subscribes to.",
  inputSchema: {
    id: webhookIdSchema,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "GET",
      path: `/api/v1/webhooks/${args.id}`,
      schema: webhookResponseSchema,
    })
    return formatWebhook(unwrap(result).webhook)
  },
})

const listWebhooks = defineTool({
  name: "list_webhooks",
  title: "List webhooks",
  description:
    "List all registered webhooks for this ChatPush account. Use it to see where events are delivered or to find a webhook ID before updating or deleting it.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(_args, { client }) {
    const result = await client.request({
      method: "GET",
      path: "/api/v1/webhooks",
      schema: webhookListResponseSchema,
    })
    const { webhooks } = unwrap(result)
    if (!webhooks.length) return "No webhooks registered. Use create_webhook to add one."
    return lines(`Webhooks (${webhooks.length}):`, "", ...webhooks.map(formatWebhook))
  },
})

const deleteWebhook = defineTool({
  name: "delete_webhook",
  title: "Delete webhook",
  description: "Delete a webhook by ID. The webhook will stop receiving notifications.",
  inputSchema: {
    id: webhookIdSchema.describe("Webhook ID to delete."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "DELETE",
      path: `/api/v1/webhooks/${args.id}`,
      schema: successResponseSchema,
    })
    unwrap(result)
    return `Webhook #${args.id} deleted. It will no longer receive notifications.`
  },
})

const updateWebhook = defineTool({
  name: "update_webhook",
  title: "Update webhook",
  description:
    "Update an existing webhook — change its URL or the list of event types it subscribes to. Pass only what should change; types replaces the whole list.",
  inputSchema: {
    id: webhookIdSchema,
    url: webhookUrlSchema.optional().describe("New URL."),
    types: webhookTypesSchema.optional().describe("New list of event types (replaces the current list)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler(args, { client }) {
    if (args.url === undefined && args.types === undefined) {
      throw new InputValidationError("Nothing to update: pass url, types, or both.")
    }
    assertUnique(args.types, "types")
    const result = await client.request({
      method: "PATCH",
      path: `/api/v1/webhooks/${args.id}`,
      query: { url: args.url, types: args.types },
      schema: webhookResponseSchema,
    })
    return lines("Webhook updated.", formatWebhook(unwrap(result).webhook))
  },
})

export const webhookTools = [createWebhook, getWebhook, listWebhooks, deleteWebhook, updateWebhook]
