import { z } from "zod"
import { unwrap } from "../client.js"
import { InputValidationError } from "../errors.js"
import { field, lines } from "../format.js"
import { conversationsResponseSchema, type Conversation } from "../types.js"
import { phoneSchema, tdlibUserIdSchema, telegramUsernameSchema } from "./common.js"
import { defineTool } from "./registry.js"

function formatConversation(conversation: Conversation): string {
  return lines(
    `Conversation #${conversation.id} (${conversation.conversation_type ?? "unknown messenger"})`,
    field("  Phone", conversation.client_phone),
    field("  Telegram username", conversation.tdlib_username),
    field("  Telegram user ID", conversation.tdlib_user_id),
    field("  Name in messenger", conversation.messenger_client_name),
    field("  Name in CRM", conversation.crm_client_name),
  )
}

const setChatClientName = defineTool({
  name: "set_chat_client_name",
  title: "Set client name in chat",
  description: [
    "Rename a contact in the ChatPush web messenger, so operators see a person's real name instead of a phone number. The name is stored as the CRM client name of the conversation.",
    "Find the conversation by phone, Telegram username or Telegram user ID — at least one is required. If the contact has both WhatsApp and Telegram conversations, both are renamed.",
  ].join("\n\n"),
  inputSchema: {
    name: z.string().min(1).describe("New name for the contact, e.g. the customer name from your CRM."),
    phone: phoneSchema.optional().describe("Contact phone number in international format."),
    tdlib_username: telegramUsernameSchema.optional().describe("Contact's Telegram username."),
    tdlib_user_id: tdlibUserIdSchema.optional().describe("Contact's Telegram user ID."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  async handler(args, { client }) {
    if (args.phone === undefined && args.tdlib_username === undefined && args.tdlib_user_id === undefined) {
      throw new InputValidationError("Identify the conversation with phone, tdlib_username or tdlib_user_id.")
    }
    const result = await client.request({
      method: "PUT",
      path: "/api/developer_chat/conversations/client_name",
      query: {
        name: args.name,
        phone: args.phone,
        tdlib_username: args.tdlib_username,
        tdlib_user_id: args.tdlib_user_id,
      },
      schema: conversationsResponseSchema,
    })
    const conversations = unwrap(result).conversations ?? []
    const heading = `Contact renamed to "${args.name}" in ${conversations.length} conversation(s).`
    if (!conversations.length) return lines(heading, "ChatPush returned no matching conversations.")
    return lines(heading, "", ...conversations.map(formatConversation))
  },
})

export const chatTools = [setChatClientName]
