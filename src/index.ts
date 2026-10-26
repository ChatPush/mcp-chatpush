#!/usr/bin/env node
// Local (stdio) entry point: the server runs on the user's machine, the token comes from CHATPUSH_TOKEN.
// For the hosted server (https://mcp.chatpush.ru) see src/http.ts.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { SERVER_VERSION, loadConfig } from "./config.js"
import { missingTokenMessage } from "./errors.js"
import { log } from "./logger.js"
import { createMcpServer, tools } from "./server.js"

async function main(): Promise<void> {
  const config = loadConfig("stdio")
  const server = createMcpServer(config)

  await server.connect(new StdioServerTransport())

  log.raw(`ChatPush MCP Server v${SERVER_VERSION} — ${tools.length} tools loaded`)
  if (!config.token) log.warn(missingTokenMessage(config.mode))
}

main().catch((err: unknown) => {
  log.error(`Failed to start: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
