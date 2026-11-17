#!/usr/bin/env node
// Remote entry point: MCP over Streamable HTTP, for hosting at https://mcp.chatpush.ru/mcp
// The server itself lives in src/httpServer.ts.
import { SERVER_VERSION, loadConfig } from "./config.js"
import { createHttpServer } from "./httpServer.js"
import { log } from "./logger.js"
import { OAuthProvider, parseOAuthKeys, type TokenCheck } from "./oauth.js"
import { tools } from "./server.js"

const MB = 1024 * 1024

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    log.error(`${name} must be a positive integer, got "${raw}"`)
    process.exit(1)
  }
  return value
}

const config = loadConfig("http")
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? "0.0.0.0"
const options = {
  mcpPath: process.env.CHATPUSH_MCP_PATH?.trim() || "/mcp",
  allowedHosts: (process.env.CHATPUSH_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  allowedOrigin: process.env.CHATPUSH_ALLOWED_ORIGIN?.trim() || "*",
  maxBodyBytes: positiveInt("CHATPUSH_MAX_BODY_MB", 20) * MB,
  maxConcurrentRequests: positiveInt("CHATPUSH_MAX_CONCURRENT_REQUESTS", 32),
  oauth: oauthFromEnv(),
}

/** OAuth is on when CHATPUSH_OAUTH_KEY is set; it then needs CHATPUSH_PUBLIC_URL. */
function oauthFromEnv(): OAuthProvider | undefined {
  const rawKeys = process.env.CHATPUSH_OAUTH_KEY?.trim()
  if (!rawKeys) return undefined
  const publicUrl = process.env.CHATPUSH_PUBLIC_URL?.trim().replace(/\/+$/, "")
  if (!publicUrl || !/^https:\/\/[^/]+$/.test(publicUrl)) {
    log.error("CHATPUSH_OAUTH_KEY is set, so CHATPUSH_PUBLIC_URL is required: the public https origin, e.g. https://mcp.chatpush.ru")
    process.exit(1)
  }
  let keys: Buffer[]
  try {
    keys = parseOAuthKeys(rawKeys)
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
  return new OAuthProvider({
    issuer: publicUrl,
    mcpPath: process.env.CHATPUSH_MCP_PATH?.trim() || "/mcp",
    keys,
    trustProxy: process.env.CHATPUSH_TRUST_PROXY === "1",
    verifyToken: (token) => verifyChatPushToken(config.baseUrl, token),
  })
}

/** Is this a working ChatPush API token? GET /api/v1/account answers 200 for one. */
async function verifyChatPushToken(baseUrl: string, token: string): Promise<TokenCheck> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/account`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": `chatpush-mcp-server/${SERVER_VERSION}` },
      signal: AbortSignal.timeout(10_000),
    })
    await response.body?.cancel()
    if (response.ok) return "ok"
    return response.status === 401 || response.status === 403 ? "invalid" : "unavailable"
  } catch {
    return "unavailable"
  }
}

// A bug in one request must not take the server down for everyone.
process.on("unhandledRejection", (reason) => {
  log.error(`Unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`)
})

const httpServer = createHttpServer(config, options)

httpServer.listen(port, host, () => {
  log.raw(`ChatPush MCP Server v${SERVER_VERSION} — ${tools.length} tools loaded (Streamable HTTP)`)
  log.raw(`Listening on http://${host}:${port}${options.mcpPath}`)
  log.raw(`ChatPush API: ${config.baseUrl}`)
  log.raw(`Request body limit: ${options.maxBodyBytes / MB} MB, concurrent requests: ${options.maxConcurrentRequests}`)
  log.raw(options.oauth ? `OAuth sign-in: on (${options.oauth.resource})` : "OAuth sign-in: off (set CHATPUSH_OAUTH_KEY and CHATPUSH_PUBLIC_URL to turn it on)")
  if (options.allowedHosts.length) log.raw(`Allowed hosts: ${options.allowedHosts.join(", ")}`)
  else log.warn("CHATPUSH_ALLOWED_HOSTS is not set: any Host header is accepted. Set it in production (DNS-rebinding protection).")
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info(`${signal} received, shutting down`)
    httpServer.close(() => process.exit(0))
  })
}
