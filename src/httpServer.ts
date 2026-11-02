// The remote MCP server (Streamable HTTP). src/http.ts starts it; tests create it directly.
//
// Every request carries the caller's own ChatPush token in the Authorization header; the server
// stores no credentials and keeps no session state, so it can run behind any load balancer.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { SERVER_NAME, SERVER_VERSION, type Config } from "./config.js"
import { formatBytes } from "./format.js"
import { log } from "./logger.js"
import { createMcpServer, tools } from "./server.js"

export interface HttpServerOptions {
  /** Path of the MCP endpoint, e.g. "/mcp". */
  mcpPath: string
  /** Host header values to accept (hostname, port ignored). Empty = accept any (DNS-rebinding check off). */
  allowedHosts: readonly string[]
  /** Value for Access-Control-Allow-Origin. */
  allowedOrigin: string
  /** Largest request body accepted, in bytes. */
  maxBodyBytes: number
  /** MCP requests handled at the same time; the rest get 503. */
  maxConcurrentRequests: number
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly rpcCode = -32600,
  ) {
    super(message)
  }
}

/** Lowercased hostname of a Host header value, without the port: "MCP.chatpush.ru:443" → "mcp.chatpush.ru". */
export function hostnameOf(host: string): string {
  const value = host.trim().toLowerCase()
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1)
  const colon = value.lastIndexOf(":")
  return colon === -1 ? value : value.slice(0, colon)
}

/** `Authorization: Bearer <token>`; a bare token is accepted too. */
function tokenFromRequest(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (!header) return undefined
  const bearer = /^Bearer\s+(.+)$/i.exec(header)
  const token = (bearer ? bearer[1] : header).trim()
  return token || undefined
}

/** Reads and parses a JSON body, refusing anything over `limit` bytes before it is buffered. */
async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const tooLarge = () => new HttpError(413, `Request body is larger than ${formatBytes(limit)}.`)
  const declared = Number(req.headers["content-length"])
  if (declared > limit) throw tooLarge()

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.byteLength
    if (total > limit) throw tooLarge()
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new HttpError(400, "Parse error: the request body is not valid JSON.", -32700)
  }
}

export function createHttpServer(config: Config, options: HttpServerOptions): Server {
  const allowedHosts = new Set(options.allowedHosts.map(hostnameOf).filter(Boolean))
  let activeRequests = 0

  const corsHeaders = (): Record<string, string> => ({
    "Access-Control-Allow-Origin": options.allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  })

  const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => {
    res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders(), ...headers })
    res.end(JSON.stringify(body))
  }

  const sendRpcError = (res: ServerResponse, status: number, code: number, message: string, headers?: Record<string, string>) =>
    sendJson(res, status, { jsonrpc: "2.0", error: { code, message }, id: null }, headers)

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let url: URL
    try {
      url = new URL(req.url ?? "/", "http://localhost")
    } catch {
      sendJson(res, 400, { error: "Bad request URL" })
      return
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders())
      res.end()
      return
    }

    // Health check for the load balancer: no token required, no ChatPush calls.
    if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/")) {
      sendJson(res, 200, { status: "ok", server: SERVER_NAME, version: SERVER_VERSION, tools: tools.length, endpoint: options.mcpPath })
      return
    }

    if (url.pathname !== options.mcpPath) {
      sendJson(res, 404, { error: "Not found", endpoint: options.mcpPath })
      return
    }

    // DNS-rebinding protection, after /healthz so load balancers can probe by IP.
    // Our own check: the SDK's allowedHosts option is deprecated.
    if (allowedHosts.size && !allowedHosts.has(hostnameOf(req.headers.host ?? ""))) {
      sendJson(res, 403, { error: "Host not allowed" })
      return
    }

    const token = tokenFromRequest(req)
    if (!token) {
      sendRpcError(
        res,
        401,
        -32001,
        "Missing ChatPush token. Send it as: Authorization: Bearer <token from the ChatPush dashboard>",
        { "WWW-Authenticate": 'Bearer realm="ChatPush MCP"' },
      )
      return
    }

    if (activeRequests >= options.maxConcurrentRequests) {
      sendRpcError(res, 503, -32000, "Server is busy, try again in a moment.", { "Retry-After": "1" })
      return
    }
    activeRequests++
    res.on("close", () => {
      activeRequests--
    })

    const body = req.method === "POST" ? await readJsonBody(req, options.maxBodyBytes) : undefined

    // Stateless: a fresh server and transport per request, bound to this caller's token.
    const server = createMcpServer(config, token)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on("close", () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  }

  return createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (err instanceof HttpError) {
        if (!res.headersSent) sendRpcError(res, err.status, err.rpcCode, err.message, { Connection: "close" })
        // Stop reading an oversized body instead of draining it.
        if (err.status === 413) req.destroy()
        return
      }
      log.error(`Request failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
      if (!res.headersSent) sendRpcError(res, 500, -32603, "Internal server error")
      else res.end()
    })
  })
}
