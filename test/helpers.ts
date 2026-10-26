// Shared test helpers: a fake fetch for the ChatPush API and an in-memory MCP client.
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { Config } from "../src/config.js"
import { createMcpServer } from "../src/server.js"
import type { ServerMode } from "../src/types.js"

export function testConfig(mode: ServerMode = "stdio"): Config {
  return { mode, token: "test-token", baseUrl: "https://api.chatpush.test", timeoutMs: 2_000 }
}

export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

/** Replaces global fetch for one test; returns the recorded calls and a restore function. */
export function mockFetch(handler: FetchHandler): { calls: string[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    return handler(url, init)
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })
}

/** fetch() rejection the way undici reports it: TypeError("fetch failed") with a coded cause. */
export function networkFailure(code: string): Error {
  return new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) })
}

export async function connectClient(config: Config): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await createMcpServer(config).connect(serverTransport)
  const client = new Client({ name: "test", version: "0.0.0" })
  await client.connect(clientTransport)
  return client
}

export function resultText(result: object): string {
  const content = (result as { content?: unknown }).content as { type: string; text?: string }[] | undefined
  return (content ?? []).map((part) => part.text ?? "").join("\n")
}
