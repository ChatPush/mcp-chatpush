import type { ApiErrorResult } from "./types.js"

export class ChatPushMcpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** Missing or invalid server configuration (environment variables). */
export class ConfigError extends ChatPushMcpError {}

/** Tool arguments that are incompatible with each other. Raised before any request is sent. */
export class InputValidationError extends ChatPushMcpError {}

/** A failure outside the ChatPush client, e.g. downloading a file for send_file. */
export class NetworkError extends ChatPushMcpError {}

/** ChatPush answered with an error (or could not be reached). Carries the structured error object. */
export class ChatPushRequestError extends ChatPushMcpError {
  constructor(readonly result: ApiErrorResult) {
    super(result.message)
  }
}

export const MISSING_TOKEN_MESSAGE = "CHATPUSH_TOKEN is not set. Add it to your Claude Desktop config."

export const RATE_LIMIT_MESSAGE = "Rate limit exceeded. Retrying automatically."

/** Human-readable message for a failed API call, shown to the model as the tool result. */
export function describeApiError(error: ApiErrorResult): string {
  const { code } = error

  if (code === 401) return "Invalid ChatPush token. Check your CHATPUSH_TOKEN."
  if (code === 422) return `Validation error: ${formatFieldErrors(error.details) ?? error.message}`
  if (code === 429) return `${RATE_LIMIT_MESSAGE} All automatic retries were rate limited too — wait a minute and try again.`
  if (code >= 500) return "ChatPush server error. Try again later."
  if (code === 404) return `Not found: ChatPush has no record with this ID. (${error.message})`
  // 0 = network failure/timeout, 2xx = response in an unexpected format; the message already explains it.
  if (code === 0 || (code >= 200 && code < 300)) return error.message

  const fields = formatFieldErrors(error.details)
  return `ChatPush error (HTTP ${code}): ${error.message}${fields ? ` — ${fields}` : ""}`
}

/** Turns `{ text: ["the text cannot be empty"] }` into `text: the text cannot be empty`. */
export function formatFieldErrors(details: unknown): string | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined
  const parts = Object.entries(details as Record<string, unknown>).map(([field, messages]) => {
    const text = Array.isArray(messages) ? messages.map(String).join(", ") : String(messages)
    return `${field}: ${text}`
  })
  return parts.length ? parts.join("; ") : undefined
}
