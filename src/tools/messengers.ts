import { z } from "zod"
import { unwrap } from "../client.js"
import { lines } from "../format.js"
import { authLinkResponseSchema } from "../types.js"
import { defineTool } from "./registry.js"

const getMessengerAuthLink = defineTool({
  name: "get_messenger_auth_link",
  title: "Get messenger authorization link",
  description: [
    "Get a link to the QR-code page that connects a WhatsApp or personal Telegram account to ChatPush. Open the link in a browser and scan the code with the phone that will send messages.",
    "Use it when sending fails because the messenger is not connected (WhatsApp session not started, Telegram not authorized), or when setting the account up for the first time. Check the result afterwards with get_account.",
  ].join("\n\n"),
  inputSchema: {
    messenger: z
      .enum(["whatsapp", "tdlib"])
      .describe('Messenger to connect: "whatsapp" for WhatsApp, "tdlib" for a personal Telegram account.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "POST",
      path: "/api/v1/generate_auth_link",
      query: { messenger: args.messenger },
      schema: authLinkResponseSchema,
      retryServerErrors: false,
    })
    const { link } = unwrap(result)
    const messenger = args.messenger === "whatsapp" ? "WhatsApp" : "Telegram"
    return lines(
      `${messenger} authorization link:`,
      link.link,
      "",
      `Open it in a browser and scan the QR code in ${messenger} (${args.messenger === "whatsapp" ? "Settings → Linked devices → Link a device" : "Settings → Devices → Link Desktop Device"}).`,
      "The QR code appears within a few minutes of the first request. Afterwards check the connection with get_account.",
    )
  },
})

export const messengerTools = [getMessengerAuthLink]
