#!/usr/bin/env node
// Remote entry point: MCP over Streamable HTTP, for hosting at https://mcp.chatpush.ru/mcp
// The server itself lives in src/httpServer.ts.
import { SERVER_VERSION, loadConfig } from "./config.js"
import { createHttpServer } from "./httpServer.js"
import { log } from "./logger.js"
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
  if (options.allowedHosts.length) log.raw(`Allowed hosts: ${options.allowedHosts.join(", ")}`)
  else log.warn("CHATPUSH_ALLOWED_HOSTS is not set: any Host header is accepted. Set it in production (DNS-rebinding protection).")
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info(`${signal} received, shutting down`)
    httpServer.close(() => process.exit(0))
  })
}
