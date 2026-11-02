import { z } from "zod"

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

/** stdio = local server on the user's machine; http = hosted server (https://mcp.chatpush.ru). */
export type ServerMode = "stdio" | "http"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type QueryPrimitive = string | number | boolean
/** Arrays are sent Rails-style (`key[]=a&key[]=b`); `undefined` and `null` are skipped. */
export type QueryValue = QueryPrimitive | QueryPrimitive[] | null | undefined
export type Query = Record<string, QueryValue>

export interface ApiSuccess<T> {
  error: false
  status: number
  data: T
}

/** Structured API error: `{ error: true, code, message, details }`. */
export interface ApiErrorResult {
  error: true
  /** HTTP status (or meta.code from the body); 0 when ChatPush could not be reached. */
  code: number
  message: string
  /** Field errors from `meta.errors`, or the raw body when it has no `meta`. */
  details?: unknown
}

export type ApiResult<T> = ApiSuccess<T> | ApiErrorResult

// ---------------------------------------------------------------------------
// Response schemas (from the example responses in the Postman collection)
// ---------------------------------------------------------------------------

export const metaSchema = z.looseObject({
  code: z.number().optional(),
  status: z.string().optional(),
  message: z.string().optional(),
})

/** Endpoints that answer with just `{ meta: { code: 200, status: "success" } }`. */
export const successResponseSchema = z.looseObject({ meta: metaSchema.optional() })

const idLikeSchema = z.union([z.string(), z.number()])
const moneySchema = z.union([z.string(), z.number()])

export const operatorSchema = z.looseObject({
  id: z.number().nullish(),
  name: z.string().nullish(),
  brand_name: z.string().nullish(),
  country: z.string().nullish(),
  slug: z.string().nullish(),
})

/** POST /api/v1/delivery, POST /api/v1/send_file and GET /api/v1/delivery/:id. */
export const deliverySchema = z.looseObject({
  id: z.number(),
  phone: z.string().nullish(),
  dispatch_routing: z.array(z.string()).nullish(),
  // Creation responses carry status_id/status_description; the status endpoint nests them in `status`.
  status_id: z.number().nullish(),
  status_description: z.string().nullish(),
  status: z.looseObject({ status_id: z.number().nullish(), description: z.string().nullish() }).nullish(),
  operator: operatorSchema.nullish(),
  sender_name: z.string().nullish(),
  priority: z.string().nullish(),
  scheduled_at: z.string().nullish(),
  sum: moneySchema.nullish(),
  total_sms: z.number().nullish(),
  traffic_category: z.number().nullish(),
  external_id: idLikeSchema.nullish(),
  utm_mark: z.string().nullish(),
  callback_url: z.string().nullish(),
  reply_to_message_id: idLikeSchema.nullish(),
  simulate_typing: z.boolean().nullish(),
})

export const deliveryResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  delivery: deliverySchema,
})

export const bulkDeliverySchema = z.looseObject({
  dispatch_routing: z.array(z.string()).nullish(),
  phones_numbers: z.array(z.string()).nullish(),
  usernames: z.array(z.string()).nullish(),
  scheduled_at: z.string().nullish(),
  sender_name: z.string().nullish(),
  state: z.number().nullish(),
  text: z.string().nullish(),
  url_shorting: z.boolean().nullish(),
  utm_mark: z.string().nullish(),
})

export const bulkDeliveryResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  bulk_delivery: bulkDeliverySchema,
})

export const accountSchema = z.looseObject({
  customer_id: z.number().nullish(),
  token: z.string().nullish(),
  total_amount: moneySchema.nullish(),
  dispatch_routing: z.array(z.string()).nullish(),
  sender_names: z.array(z.string()).nullish(),
  subscription_paid_until: z.string().nullish(),
  subscription_status: z.string().nullish(),
  subscription_cost: moneySchema.nullish(),
  tdlib_session: z.number().nullish(),
  whatsapp_session: z.number().nullish(),
})

export const accountResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  account: accountSchema,
})

export const phoneInfoResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  formatted_phone: z.string().nullish(),
  operator: operatorSchema.nullish(),
})

// TODO: verify with API docs — the only documented example is an empty list, so the item shape is unknown.
export const utmMarksResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  utm_marks: z.array(z.unknown()),
})

export const webhookSchema = z.looseObject({
  id: z.number(),
  url: z.string().nullish(),
  types: z.array(z.string()).nullish(),
})

export const webhookResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  webhook: webhookSchema,
})

export const webhookListResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  webhooks: z.array(webhookSchema),
})

/** POST /api/v1/generate_auth_link */
export const authLinkResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  link: z.looseObject({ link: z.string() }),
})

export const conversationSchema = z.looseObject({
  id: z.number(),
  customer_id: z.number().nullish(),
  client_phone: z.string().nullish(),
  conversation_type: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  tdlib_user_id: idLikeSchema.nullish(),
  tdlib_username: z.string().nullish(),
  messenger_client_name: z.string().nullish(),
  crm_client_name: z.string().nullish(),
})

/** PUT /api/developer_chat/conversations/client_name */
export const conversationsResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  conversations: z.array(conversationSchema).nullish(),
})

export const subCustomerSchema = z.looseObject({
  name: z.string().nullish(),
  token: z.string().nullish(),
  customer_id: z.number().nullish(),
  subscription_paid_until: z.string().nullish(),
  subscription_status: z.string().nullish(),
  tdlib_session: z.number().nullish(),
  whatsapp_session: z.number().nullish(),
  whatsapp_phone: z.string().nullish(),
})

/** POST /api/sub_customers and GET /api/sub_customers/:customer_id */
export const subCustomerResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  sub_customer: subCustomerSchema,
})

/**
 * GET /api/sub_customers. The docs show a single `sub_customer` object, so both shapes are accepted.
 * TODO: verify with API docs
 */
export const subCustomerListResponseSchema = z.looseObject({
  meta: metaSchema.optional(),
  sub_customers: z.array(subCustomerSchema).nullish(),
  sub_customer: subCustomerSchema.nullish(),
})

export type Delivery = z.infer<typeof deliverySchema>
export type BulkDelivery = z.infer<typeof bulkDeliverySchema>
export type Account = z.infer<typeof accountSchema>
export type Webhook = z.infer<typeof webhookSchema>
export type Conversation = z.infer<typeof conversationSchema>
export type SubCustomer = z.infer<typeof subCustomerSchema>

// ---------------------------------------------------------------------------
// Reference data from the docs ("Webhooks" and "Additional information" sections)
// ---------------------------------------------------------------------------

export const WEBHOOK_TYPES = [
  "whatsapp_log_out",
  "whatsapp_log_in",
  "whatsapp_incoming_msg",
  "tdlib_incoming_msg",
  "max_incoming_msg",
  "whatsapp_status_msg",
] as const

export const WEBHOOK_TYPE_DESCRIPTIONS: Record<(typeof WEBHOOK_TYPES)[number], string> = {
  whatsapp_log_out: "WhatsApp account disconnected",
  whatsapp_log_in: "WhatsApp account connected",
  whatsapp_incoming_msg: "incoming and outgoing WhatsApp messages (with file download links) and incoming WhatsApp calls",
  tdlib_incoming_msg: "incoming and outgoing personal Telegram messages (with file download links) and Telegram calls",
  max_incoming_msg: "incoming and outgoing messages of a connected MAX account",
  whatsapp_status_msg: "statuses of outgoing WhatsApp messages: sent, received, read, played, failed, expired, …",
}

export const TDLIB_SESSION_STATES: Record<number, string> = {
  0: "not authorized — waiting for phone number",
  1: "waiting for login code",
  2: "waiting for 2FA password",
  3: "authorized",
  4: "waiting for QR code scan",
}

export interface DeliveryStatus {
  name: string
  label: string
  final: boolean
  hint: string
}

const RESTRICTION_HINT =
  "A sending restriction triggered: duplicates, flooding one recipient, a blacklisted number, or text/sender name blocked by the spam filter."
const OPERATOR_CRITICAL_HINT = "The operator reported a critical error when trying to send."
const OFFLINE_HINT =
  "SMS: the operator could not deliver (subscriber offline or blocks messages). Messengers: the sender's phone is offline."

export const DELIVERY_STATUSES: Record<number, DeliveryStatus> = {
  0: { name: "telecommunication_company_error", label: "Operator error", final: true, hint: "The operator reported an error when sending." },
  1: { name: "enroute", label: "Passed to the operator", final: false, hint: "The operator accepted the message; the delivery status will appear later." },
  2: { name: "delivered", label: "Delivered", final: true, hint: "The message has been delivered to the recipient." },
  3: { name: "expired", label: "Expired", final: true, hint: "Not delivered: the subscriber was unreachable for too long or their phone memory is full." },
  4: { name: "deleted", label: "Deleted", final: true, hint: "The message was deleted." },
  5: { name: "undeliverable", label: "Unable to deliver", final: true, hint: "The recipient is offline or has blocked receiving messages." },
  6: { name: "accepted", label: "Accepted", final: false, hint: "Accepted by ChatPush and being passed to the operator." },
  7: { name: "unknown", label: "Failed to deliver", final: true, hint: "The operator reported an unknown error." },
  8: { name: "rejected", label: "Rejected", final: true, hint: "The operator rejected the delivery, possibly because the client refuses SMS." },
  9: { name: "internal_server_error", label: "Server error", final: true, hint: "ChatPush could not process the request; their team is on it." },
  10: { name: "unhandled_error", label: "Unhandled error", final: true, hint: "Unknown operator error; ChatPush's team is on it." },
  11: { name: "incorrect_number", label: "Invalid number", final: true, hint: "The phone number in the request is wrong." },
  12: { name: "forbidden", label: "Forbidden", final: true, hint: RESTRICTION_HINT },
  13: { name: "not_enough_money", label: "Insufficient funds", final: true, hint: "Top up the ChatPush balance." },
  14: { name: "waiting_for_sending", label: "Waiting to be sent", final: false, hint: "Queued; it will be passed to the operator soon." },
  15: { name: "in_progress", label: "In processing", final: false, hint: "Being processed; the status will update shortly." },
  16: { name: "read", label: "Read", final: true, hint: "The recipient has read the message." },
  17: { name: "too_many_requests", label: "Request limit exceeded", final: true, hint: "Telegram reports too many requests; check the account at https://t.me/SpamBot." },
  18: { name: "cancelled", label: "Cancelled", final: true, hint: "Delivery was cancelled." },
  20: { name: "smpp_queue_expired", label: "Unable to deliver", final: true, hint: OPERATOR_CRITICAL_HINT },
  21: { name: "moderating", label: "On moderation", final: false, hint: "Under moderation; the decision will be emailed." },
  22: { name: "moderation_declined", label: "Moderation rejected", final: true, hint: "The message failed moderation; see the email for the reason." },
  25: { name: "external_restriction", label: "Restrictions on sending", final: true, hint: RESTRICTION_HINT },
  26: { name: "length_restriction", label: "Message length limit", final: true, hint: "Blocked by the message length limit in account settings." },
  27: { name: "kazakhstan_restriction", label: "Kazakhstan restriction", final: true, hint: "Promotional messages to Kazakhstan are prohibited after 22:00." },
  28: { name: "operator_restriction", label: "Operator restriction", final: true, hint: "Blocked by an operator restriction for this account." },
  31: { name: "payment_transaction_error", label: "Payment error", final: true, hint: "ChatPush could not complete the payment." },
  32: { name: "subscription_expired", label: "Messenger subscription not paid", final: true, hint: "Pay for the messenger subscription in the ChatPush dashboard to continue sending." },
  33: { name: "incorrect_delivery_params", label: "Invalid sending parameters", final: true, hint: "The request parameters were incorrect." },
  34: { name: "foreign_delivery_restricted", label: "Restrictions on sending", final: true, hint: RESTRICTION_HINT },
  35: { name: "rate_limit_error", label: "Delivery request limit exceeded", final: true, hint: "Messenger sends are queued at about 1 per minute and the queue limit was exceeded." },
  36: { name: "blocked_by_subscription_expired", label: "Subscription suspended", final: true, hint: "The subscription is suspended." },
  37: { name: "daily_limit_error", label: "Daily limit exceeded", final: true, hint: "The daily sending limit has been exceeded." },
  38: { name: "sender_name_error", label: "Sender name error", final: true, hint: "The sender name is invalid." },
  44: { name: "whatsapp_unregistered_number", label: "WhatsApp unregistered number", final: true, hint: "This number is not registered in WhatsApp." },
  45: { name: "whatsapp_session_doesnt_exist", label: "WhatsApp session not started", final: true, hint: "WhatsApp is not authorized in ChatPush; scan the QR code in the dashboard." },
  46: { name: "smsc_dos_error", label: "Waiting to be sent", final: false, hint: "Queued; it will be passed to the operator soon." },
  47: { name: "smsc_not_enough_money", label: "Unprocessed error", final: true, hint: "Unknown operator error; ChatPush's team is on it." },
  48: { name: "smsc_unavailable_number", label: "Unavailable number", final: true, hint: "The operator could not deliver to this number." },
  49: { name: "aggregate_forbidden", label: "Prohibited", final: true, hint: "The operator prohibits sending from shared sender names." },
  50: { name: "tdlib_not_authorized", label: "Telegram not authorized", final: true, hint: "Personal Telegram is logged out; log in again in the ChatPush dashboard." },
  51: { name: "customer_settings_delivery_time_restriction_cancel", label: "Sending time restriction", final: true, hint: "Blocked by the sending-time restriction in account settings." },
  52: { name: "waba_not_authorized", label: "WABA not authorized", final: true, hint: "WhatsApp Business API sending stopped; log in again." },
  53: { name: "mobile_operator_not_identified", label: "Mobile operator not identified", final: true, hint: "The recipient's mobile operator could not be identified." },
  56: { name: "safe_sending_limit_exceeded", label: "Safe sending limit exceeded", final: true, hint: "Sending paused to avoid a number ban; it resumes when the limit refreshes and grows over time." },
  57: { name: "too_many_messages_to_new_contacts", label: "Too many messages to new contacts", final: true, hint: "Telegram temporarily limits messages to new contacts; limits grow as the account has more conversations." },
  58: { name: "user_not_found_in_telegram", label: "User not found in Telegram", final: true, hint: "The account may be hidden, not exist, or be temporarily restricted." },
  69: { name: "smpp_connection_error", label: "Unable to deliver", final: true, hint: OPERATOR_CRITICAL_HINT },
  88: { name: "smpp_sending_limit_error", label: "Unable to deliver", final: true, hint: OPERATOR_CRITICAL_HINT },
  257: { name: "smpp_transmitter_not_allowed_region", label: "Unable to deliver", final: true, hint: OFFLINE_HINT },
  555: { name: "blacklisted_number_error", label: "Blacklisted", final: true, hint: "The recipient is blacklisted by the client or by ChatPush." },
  1281: { name: "source_addr_forbidden", label: "Sender name blocked by operator", final: true, hint: "The operator blocked this sender name." },
  1282: { name: "smpp_num_blacklisted", label: "Unable to deliver", final: true, hint: "Problem with the recipient number: a prohibited direction, or the recipient blocks this message class." },
  1283: { name: "template_violation", label: "Invalid text or template", final: true, hint: "The operator rejected the text parameters." },
  1284: { name: "smpp_msg_blacklisted", label: "Rejected", final: true, hint: "The text contains forbidden words." },
  1285: { name: "smpp_not_enough_money", label: "Unable to deliver", final: true, hint: OPERATOR_CRITICAL_HINT },
  1286: { name: "smpp_foreign_delivery_restricted", label: "Restrictions on sending", final: true, hint: RESTRICTION_HINT },
  1287: { name: "smpp_down_msisdn", label: "Operator error", final: true, hint: "Operator error; ChatPush's team is on it." },
  1288: { name: "smpp_megafon_wrong_provider", label: "Unable to deliver", final: true, hint: OPERATOR_CRITICAL_HINT },
  1293: { name: "smpp_beeline_wrong_provider", label: "Unable to deliver", final: true, hint: OPERATOR_CRITICAL_HINT },
  1299: { name: "smpp_beeline_partner_blocked", label: "Unable to deliver", final: true, hint: OFFLINE_HINT },
  2291: { name: "smpp_anti_spam_block", label: "Subscriber spam filter", final: true, hint: "The subscriber has blocked receiving SMS." },
}

export const TRAFFIC_CATEGORIES: Record<number, string> = {
  0: "advertising",
  1: "transactional",
  2: "service",
}
