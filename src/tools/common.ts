// Input schemas and cross-field checks shared by several tools.

import { z } from "zod"
import { InputValidationError } from "../errors.js"

export const DISPATCH_CHANNELS = ["whatsapp", "tdlib", "telegram", "notify", "max", "sms"] as const
export type DispatchChannel = (typeof DISPATCH_CHANNELS)[number]

export const dispatchRoutingSchema = z
  .array(z.enum(DISPATCH_CHANNELS))
  .min(1)
  .max(DISPATCH_CHANNELS.length)
  .describe(
    "Channels in the order ChatPush should try them (cascade: the next channel is used only if delivery through the previous one fails). " +
      "whatsapp = WhatsApp, tdlib = personal Telegram account, telegram = Telegram Bot, notify = VK/OK, max = MAX messenger, sms = SMS. " +
      "If omitted, the account's default routing is used.",
  )

export const phoneSchema = z
  .string()
  .regex(/^\+?[\d\s().-]+$/, "phone may contain only digits, spaces, +, (, ), . and -")
  .refine((value) => {
    const digits = value.replace(/\D/g, "").length
    return digits >= 7 && digits <= 15
  }, "phone must have 7–15 digits in international format, country code first, e.g. 79991234567")

export const telegramUsernameSchema = z
  .string()
  .regex(/^@?[A-Za-z0-9_]{4,32}$/, "must be a Telegram username such as username or @username")

export const tdlibUserIdSchema = z
  .string()
  .regex(/^-?\d+$/, "tdlib_user_id must be an integer, e.g. 123456789 or -1001234567890")
  .describe("Telegram user ID (positive = private chat, negative = group chat). tdlib channel only.")

export const scheduledAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, "scheduled_at must use the format YYYY-MM-DD HH:MM:SS (UTC+0)")
  .describe("Delayed sending time, format YYYY-MM-DD HH:MM:SS in UTC+0. At least 1 minute and at most 1 month ahead.")

export const senderNameSchema = z
  .string()
  .min(1)
  .describe("Registered SMS sender name (see get_balance → sender names).")

export const utmMarkSchema = z.string().min(1).describe("Label for tracking dispatches (see get_utm_tags).")

export const callbackUrlSchema = z
  .url({ protocol: /^https?$/ })
  .describe(
    "URL that receives the final delivery status as a POST request (retried every 2 minutes, up to 10 times, until it returns HTTP 200).",
  )

export const externalIdSchema = z.string().min(1).describe("Your client-side ID for this message (idempotency ID).")

export const prioritySchema = z.enum(["high", "medium", "low"]).describe("Sending priority. Chosen automatically if omitted.")

export const replyToMessageIdSchema = z
  .string()
  .min(1)
  .describe("ID of the message to reply to, taken from an incoming-message webhook.")

export const simulateTypingSchema = z
  .boolean()
  .describe("Default true: show a typing indicator in WhatsApp before sending. false sends instantly.")

// ---------------------------------------------------------------------------
// Validation that runs before a request is sent
// ---------------------------------------------------------------------------

export interface RecipientArgs {
  phone?: string
  username?: string
  tdlib_user_id?: string
  whatsapp_lid?: string
  dispatch_routing?: readonly DispatchChannel[]
}

export function assertRecipient(args: RecipientArgs): void {
  const routing = args.dispatch_routing
  assertUnique(routing, "dispatch_routing")

  const hasTelegramRecipient = args.username !== undefined || args.tdlib_user_id !== undefined
  const hasLid = args.whatsapp_lid !== undefined

  if (!args.phone && !hasTelegramRecipient && !hasLid) {
    throw new InputValidationError(
      "Provide a recipient: phone, or username / tdlib_user_id (personal Telegram via tdlib), or whatsapp_lid (WhatsApp).",
    )
  }
  if (args.username !== undefined && args.tdlib_user_id !== undefined) {
    throw new InputValidationError("Use either username or tdlib_user_id, not both.")
  }
  if (hasTelegramRecipient && !routing?.includes("tdlib")) {
    throw new InputValidationError(
      'username and tdlib_user_id only work with the personal Telegram channel. Set dispatch_routing to include "tdlib", e.g. ["tdlib"].',
    )
  }
  if (hasLid && !routing?.includes("whatsapp")) {
    throw new InputValidationError('whatsapp_lid only works with WhatsApp. Set dispatch_routing to include "whatsapp".')
  }
  if (!args.phone && routing) {
    const needPhone = routing.filter(
      (channel) => !(channel === "tdlib" && hasTelegramRecipient) && !(channel === "whatsapp" && hasLid),
    )
    if (needPhone.length) {
      throw new InputValidationError(
        `Channel(s) ${needPhone.join(", ")} need a phone number. Add phone or remove them from dispatch_routing.`,
      )
    }
  }
}

export function assertUnique(values: readonly string[] | undefined, fieldName: string): void {
  if (!values) return
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) (seen.has(value) ? duplicates : seen).add(value)
  if (duplicates.size) {
    throw new InputValidationError(`${fieldName} contains duplicates: ${[...duplicates].join(", ")}`)
  }
}

/** ChatPush accepts delayed sending from 1 minute to 1 month ahead, in UTC+0. */
export function assertScheduledAt(value: string | undefined, now = new Date()): void {
  if (value === undefined) return
  const at = new Date(`${value.replace(" ", "T")}Z`)
  if (Number.isNaN(at.getTime())) {
    throw new InputValidationError(`scheduled_at "${value}" is not a valid date. Use YYYY-MM-DD HH:MM:SS in UTC+0.`)
  }
  const earliest = new Date(now.getTime() + 60_000)
  const latest = new Date(now)
  latest.setUTCMonth(latest.getUTCMonth() + 1)
  if (at < earliest) {
    throw new InputValidationError(`scheduled_at must be at least 1 minute in the future. Current UTC time is ${formatUtc(now)}.`)
  }
  if (at > latest) {
    throw new InputValidationError(`scheduled_at must be at most 1 month ahead (latest: ${formatUtc(latest)} UTC).`)
  }
}

function formatUtc(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19)
}
