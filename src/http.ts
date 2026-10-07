#!/usr/bin/env node
// Remote entry point: MCP over Streamable HTTP, for hosting at https://mcp.chatpush.ru/mcp
//
// Every request carries the caller's own ChatPush token in the Authorization header; the server
// stores no credentials and keeps no session state, so it can run behind any load balancer.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { SERVER_NAME, SERVER_VERSION, loadConfig } from "./config.js"
import { log } from "./logger.js"
import { createMcpServer, tools } from "./server.js"

const config = loadConfig()
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? "0.0.0.0"
const mcpPath = process.env.CHATPUSH_MCP_PATH?.trim() || "/mcp"
/** Comma-separated Host values accepted when set, e.g. "mcp.chatpush.ru". Blocks DNS rebinding. */
const allowedHosts = (process.env.CHATPUSH_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
const allowedOrigin = process.env.CHATPUSH_ALLOWED_ORIGIN?.trim() || "*"

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders(), ...headers })
  res.end(JSON.stringify(body))
}

/** `Authorization: Bearer <token>`; a bare token is accepted too. */
function tokenFromRequest(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (!header) return undefined
  const bearer = /^Bearer\s+(.+)$/i.exec(header)
  const token = (bearer ? bearer[1] : header).trim()
  return token || undefined
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }

  // Health check for the load balancer: no token required, no ChatPush calls.
  if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/")) {
    sendJson(res, 200, { status: "ok", server: SERVER_NAME, version: SERVER_VERSION, tools: tools.length, endpoint: mcpPath })
    return
  }

  if (url.pathname !== mcpPath) {
    sendJson(res, 404, { error: "Not found", endpoint: mcpPath })
    return
  }

  const token = tokenFromRequest(req)
  if (!token) {
    sendJson(
      res,
      401,
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing ChatPush token. Send it as: Authorization: Bearer <token from the ChatPush dashboard>" },
        id: null,
      },
      { "WWW-Authenticate": 'Bearer realm="ChatPush MCP"' },
    )
    return
  }

  // Stateless: a fresh server and transport per request, bound to this caller's token.
  const server = createMcpServer(config, token)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    ...(allowedHosts.length ? { enableDnsRebindingProtection: true, allowedHosts } : {}),
  })

  res.on("close", () => {
    void transport.close()
    void server.close()
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } catch (err) {
    log.error(`Request failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    if (!res.headersSent) {
      sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null })
    }
  }
})

httpServer.listen(port, host, () => {
  log.raw(`ChatPush MCP Server v${SERVER_VERSION} — ${tools.length} tools loaded (Streamable HTTP)`)
  log.raw(`Listening on http://${host}:${port}${mcpPath}`)
  log.raw(`ChatPush API: ${config.baseUrl}`)
  if (allowedHosts.length) log.raw(`Allowed hosts: ${allowedHosts.join(", ")}`)
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info(`${signal} received, shutting down`)
    httpServer.close(() => process.exit(0))
  })
}
