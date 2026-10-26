import { z } from "zod"
import { SERVER_NAME, SERVER_VERSION, type Config } from "./config.js"
import { AcceptedResponseError, ConfigError, ChatPushRequestError, RATE_LIMIT_MESSAGE, missingTokenMessage } from "./errors.js"
import { isRecord, redactSecrets, truncate } from "./format.js"
import { log } from "./logger.js"
import type { ApiErrorResult, ApiResult, HttpMethod, Query } from "./types.js"

const MAX_RATE_LIMIT_RETRIES = 3
const RATE_LIMIT_BASE_DELAY_MS = 1_000
/**
 * A Retry-After longer than this is reported to the user instead of silently blocking the tool call.
 * Kept short: many MCP clients give up on a tool call after about a minute.
 */
const MAX_RETRY_AFTER_MS = 15_000
const MAX_SERVER_ERROR_RETRIES = 2
const SERVER_ERROR_RETRY_DELAY_MS = 1_000

export interface RequestOptions<S extends z.ZodType> {
  method: HttpMethod
  /** Path relative to CHATPUSH_BASE_URL, e.g. `/api/v1/delivery`. */
  path: string
  /** ChatPush takes parameters in the URL query string, for POST requests too. */
  query?: Query
  /** multipart/form-data body (send_file). */
  form?: FormData
  /** Expected response body. Validated with zod; a mismatch is reported as an error. */
  schema: S
  /**
   * Retry 5xx responses (default true). Disabled for calls that send or create something: the server
   * may have done it before failing, and a retry would do it twice. Such calls are also never reported
   * as "not sent" unless ChatPush certainly did not receive them.
   */
  retryServerErrors?: boolean
}

export class ChatPushClient {
  constructor(
    private readonly config: Config,
    /** Token of the current caller (remote HTTP mode). Falls back to CHATPUSH_TOKEN. */
    private readonly token?: string,
  ) {}

  async request<S extends z.ZodType>(options: RequestOptions<S>): Promise<ApiResult<z.infer<S>>> {
    const { method, path } = options
    const token = this.token ?? this.config.token
    if (!token) throw new ConfigError(missingTokenMessage(this.config.mode))

    const url = this.buildUrl(path, options.query)
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": `${SERVER_NAME}/${SERVER_VERSION}`,
    }
    const retryServerErrors = options.retryServerErrors ?? true
    const nonIdempotent = !retryServerErrors
    let rateLimitRetries = 0
    let serverErrorRetries = 0

    for (;;) {
      log.debug(`${method} ${url}`)
      let response: Response
      try {
        response = await fetch(url, {
          method,
          headers,
          body: options.form,
          signal: AbortSignal.timeout(this.config.timeoutMs),
        })
      } catch (err) {
        return this.networkError(err, method, path, nonIdempotent)
      }

      if (response.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
        const delay = retryAfterMs(response.headers.get("retry-after")) ?? RATE_LIMIT_BASE_DELAY_MS * 2 ** rateLimitRetries
        if (delay <= MAX_RETRY_AFTER_MS) {
          rateLimitRetries++
          log.warn(`${RATE_LIMIT_MESSAGE} (${method} ${path}, retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES} in ${delay} ms)`)
          await response.body?.cancel()
          await sleep(delay)
          continue
        }
      }

      if (response.status >= 500 && retryServerErrors && serverErrorRetries < MAX_SERVER_ERROR_RETRIES) {
        serverErrorRetries++
        log.warn(
          `ChatPush server error ${response.status} on ${method} ${path}, retry ${serverErrorRetries}/${MAX_SERVER_ERROR_RETRIES} in ${SERVER_ERROR_RETRY_DELAY_MS} ms`,
        )
        await response.body?.cancel()
        await sleep(SERVER_ERROR_RETRY_DELAY_MS)
        continue
      }

      let payload: unknown
      try {
        payload = await readPayload(response)
      } catch (err) {
        if (response.ok && nonIdempotent) {
          throw new AcceptedResponseError(
            `ChatPush accepted the request (HTTP ${response.status}), but the connection broke while reading its response (${describeCause(err)}). ` +
              "It has most likely been done — do NOT repeat it. Check the result first (get_delivery_status, list_webhooks, list_sub_customers or the ChatPush dashboard).",
          )
        }
        return this.networkError(err, method, path, nonIdempotent)
      }
      const failure = extractFailure(response, payload)
      if (failure) {
        log.warn(`${method} ${path} failed: HTTP ${failure.code} ${failure.message}`)
        return failure
      }

      const parsed = options.schema.safeParse(payload)
      if (!parsed.success) {
        log.warn(`Unexpected response shape for ${method} ${path}: ${z.prettifyError(parsed.error)}`)
        const raw = truncate(JSON.stringify(redactSecrets(payload)), 1500)
        if (nonIdempotent) {
          throw new AcceptedResponseError(
            `ChatPush accepted the request (HTTP ${response.status}), but its response is in an unexpected format, so the details can't be shown. ` +
              `Do NOT repeat the request — it has been done. Raw response: ${raw}`,
          )
        }
        return {
          error: true,
          code: response.status,
          message: `ChatPush returned a response in an unexpected format. Raw response: ${raw}`,
          details: redactSecrets(payload),
        }
      }
      return { error: false, status: response.status, data: parsed.data }
    }
  }

  private buildUrl(path: string, query: Query | undefined): string {
    const url = new URL(`${this.config.baseUrl}${path}`)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue
      if (Array.isArray(value)) {
        // Rails-style arrays, as in the docs: dispatch_routing[]=whatsapp&dispatch_routing[]=sms
        for (const item of value) url.searchParams.append(`${key}[]`, String(item))
      } else {
        url.searchParams.append(key, String(value))
      }
    }
    return url.toString()
  }

  private networkError(err: unknown, method: HttpMethod, path: string, nonIdempotent: boolean): ApiErrorResult {
    const timedOut = err instanceof Error && err.name === "TimeoutError"
    let message: string
    if (timedOut) {
      message = `ChatPush did not respond within ${this.config.timeoutMs / 1000} seconds. The request may still have been processed — check before repeating it.`
    } else if (nonIdempotent && !neverReachedServer(err)) {
      message =
        `The connection to ChatPush broke (${describeCause(err)}) after the request was sent. ChatPush may have accepted it — do NOT repeat it blindly. ` +
        "Check first (get_delivery_status, list_webhooks, list_sub_customers or the ChatPush dashboard)."
    } else {
      message = `Could not reach ChatPush at ${this.config.baseUrl}: ${describeCause(err)}. Check your network connection${this.config.mode === "stdio" ? " and CHATPUSH_BASE_URL" : ""}.`
    }
    log.warn(`${method} ${path}: ${message}`)
    return { error: true, code: 0, message }
  }
}

/** Throws the structured API error so tool handlers can stay linear. */
export function unwrap<T>(result: ApiResult<T>): T {
  if (result.error) throw new ChatPushRequestError(result)
  return result.data
}

function extractFailure(response: Response, payload: unknown): ApiErrorResult | undefined {
  const meta = isRecord(payload) && isRecord(payload.meta) ? payload.meta : undefined
  // Some endpoints report failures in `meta` while answering with HTTP 200.
  const metaFailed = meta !== undefined && (meta.status === "fail" || meta.status === "failed")
  if (response.ok && !metaFailed) return undefined

  const metaCode = typeof meta?.code === "number" ? meta.code : undefined
  const code = response.ok ? (metaCode ?? 422) : response.status
  const message =
    typeof meta?.message === "string"
      ? meta.message
      : typeof payload === "string" && payload.trim()
        ? truncate(payload.trim(), 300)
        : response.statusText || "Request failed"
  return { error: true, code, message, details: redactSecrets(meta ? meta.errors : payload) }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/** Errors raised before the request left this machine: ChatPush certainly did not receive it. */
const NOT_SENT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
])

function neverReachedServer(err: unknown): boolean {
  const cause = err instanceof Error ? err.cause : undefined
  return isRecord(cause) && typeof cause.code === "string" && NOT_SENT_CODES.has(cause.code)
}

function describeCause(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause
    if (isRecord(cause) && typeof cause.code === "string") return `${err.message} (${cause.code})`
    return err.message
  }
  return String(err)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
