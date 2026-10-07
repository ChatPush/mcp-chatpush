// Builds the MCP server. Shared by both entry points: src/index.ts (stdio) and src/http.ts (remote).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { ChatPushClient } from "./client.js"
import { SERVER_NAME, SERVER_VERSION, type Config } from "./config.js"
import { accountTools } from "./tools/account.js"
import { bulkTools } from "./tools/bulk.js"
import { chatTools } from "./tools/chat.js"
import { deliveryTools } from "./tools/delivery.js"
import { fileTools } from "./tools/file.js"
import { messengerTools } from "./tools/messengers.js"
import { phoneTools } from "./tools/phone.js"
import { registerTools, type AnyToolDefinition } from "./tools/registry.js"
import { subCustomerTools } from "./tools/subcustomers.js"
import { webhookTools } from "./tools/webhooks.js"

const INSTRUCTIONS = `ChatPush sends WhatsApp, Telegram (personal account or bot), SMS, VK/OK and MAX messages.
Typical flow: get_account (is WhatsApp/Telegram authorized, is the subscription active) → send_message / send_file / send_bulk → get_delivery_status.
Phone numbers use international format with the country code, e.g. 79991234567.`

export const tools: AnyToolDefinition[] = [
  ...accountTools,
  ...deliveryTools,
  ...bulkTools,
  ...phoneTools,
  ...fileTools,
  ...webhookTools,
  ...chatTools,
  ...messengerTools,
  ...subCustomerTools,
]

/**
 * One server instance per connection. In remote mode `token` comes from the caller's
 * Authorization header, so nothing is shared between users.
 */
export function createMcpServer(config: Config, token?: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS })
  registerTools(server, tools, { config, client: new ChatPushClient(config, token) })
  return server
}
