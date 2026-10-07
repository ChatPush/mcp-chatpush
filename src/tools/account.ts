import { unwrap } from "../client.js"
import {
  describeTdlibSession,
  describeWhatsappSession,
  field,
  isRecord,
  joinDefined,
  lines,
  maskSecret,
} from "../format.js"
import { accountResponseSchema, utmMarksResponseSchema } from "../types.js"
import { defineTool } from "./registry.js"

const getAccount = defineTool({
  name: "get_account",
  title: "Get account",
  description:
    "Get full ChatPush account information including token, balance, dispatch routing, sender names, subscription status and Telegram/WhatsApp sessions count. " +
    "Use it to verify the token works, check whether the subscription is active, or diagnose undelivered messages (e.g. WhatsApp or Telegram not authorized). For just the balance use get_balance.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(_args, { client }) {
    const result = await client.request({ method: "GET", path: "/api/v1/account", schema: accountResponseSchema })
    const { account } = unwrap(result)
    const subscription = joinDefined([
      account.subscription_status ?? undefined,
      account.subscription_paid_until ? `paid until ${account.subscription_paid_until}` : undefined,
      account.subscription_cost != null ? `cost ${account.subscription_cost}` : undefined,
    ])
    return lines(
      "ChatPush account",
      "",
      field("Customer ID", account.customer_id),
      field("Balance", account.total_amount),
      field("Subscription", subscription),
      field("Dispatch routing", account.dispatch_routing),
      field("Sender names", account.sender_names),
      field("WhatsApp session", describeWhatsappSession(account.whatsapp_session)),
      field("Telegram (tdlib) session", describeTdlibSession(account.tdlib_session)),
      // The token is the one already in CHATPUSH_TOKEN; masked so it doesn't spread into conversation logs.
      field("API token", maskSecret(account.token)),
    )
  },
})

const getBalance = defineTool({
  name: "get_balance",
  title: "Get balance",
  description:
    "Get ChatPush account balance, customer ID, available dispatch routing channels, and registered sender names. " +
    "Use it when the user asks how much money is left, before a large mailing, or to find a valid sender_name for SMS.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(_args, { client }) {
    const result = await client.request({ method: "GET", path: "/api/v1/account", schema: accountResponseSchema })
    const { account } = unwrap(result)
    return lines(
      `Balance: ${account.total_amount ?? "unknown"}`,
      field("Customer ID", account.customer_id),
      field("Dispatch routing", account.dispatch_routing),
      field("Sender names", account.sender_names),
    )
  },
})

const getUtmTags = defineTool({
  name: "get_utm_tags",
  title: "Get UTM tags",
  description:
    "Get list of all UTM tags (utm_marks) configured in the ChatPush account for tracking message dispatches. " +
    "Use it to reuse an existing label as utm_mark in send_message, send_bulk or send_file, so statistics stay grouped.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(_args, { client }) {
    const result = await client.request({ method: "GET", path: "/api/v1/utm_mark", schema: utmMarksResponseSchema })
    const { utm_marks: marks } = unwrap(result)
    if (!marks.length) return "No UTM tags yet. Pass utm_mark to send_message, send_bulk or send_file to create one."
    const names = marks.map((mark) => {
      if (typeof mark === "string" || typeof mark === "number") return String(mark)
      if (isRecord(mark)) return String(mark.name ?? mark.utm_mark ?? mark.title ?? JSON.stringify(mark))
      return JSON.stringify(mark)
    })
    return lines(`UTM tags (${names.length}):`, ...names.map((name) => `- ${name}`))
  },
})

export const accountTools = [getAccount, getBalance, getUtmTags]
