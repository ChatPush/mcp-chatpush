import assert from "node:assert/strict"
import { connect, type AddressInfo } from "node:net"
import { request, type Server } from "node:http"
import { after, before, describe, test } from "node:test"
import { createHttpServer, hostnameOf } from "../src/httpServer.js"
import { testConfig } from "./helpers.js"

let server: Server
let base: string

before(async () => {
  server = createHttpServer(testConfig("http"), {
    mcpPath: "/mcp",
    allowedHosts: ["mcp.chatpush.ru"],
    allowedOrigin: "*",
    maxBodyBytes: 1024,
    maxConcurrentRequests: 4,
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => new Promise<void>((resolve) => server.close(() => resolve())))

/** Sends raw bytes, so headers fetch would refuse (a Host with a space) can be tested. */
function rawRequest(text: string): Promise<string> {
  const { port } = server.address() as AddressInfo
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => socket.end(text))
    let data = ""
    socket.on("data", (chunk) => (data += chunk))
    socket.on("end", () => resolve(data))
    socket.on("error", reject)
  })
}

/** POST via node:http: unlike fetch, it lets the test set the Host header. */
function post(path: string, body: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const { port } = server.address() as AddressInfo
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "POST", headers }, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
    req.on("error", reject)
    req.end(body)
  })
}

const mcpHeaders = {
  Host: "mcp.chatpush.ru",
  Authorization: "Bearer test",
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
}

describe("hostnameOf", () => {
  test("drops the port and case", () => assert.equal(hostnameOf("MCP.chatpush.ru:443"), "mcp.chatpush.ru"))
  test("keeps IPv6 brackets", () => assert.equal(hostnameOf("[::1]:3000"), "[::1]"))
})

describe("HTTP server", () => {
  test("a malformed Host does not crash the process", async () => {
    await rawRequest("POST /mcp HTTP/1.1\r\nHost: a b\r\nAuthorization: Bearer x\r\nContent-Length: 0\r\n\r\n")
    const health = await fetch(`${base}/healthz`)
    assert.equal(health.status, 200)
  })

  test("healthz works with any Host", async () => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200)
  })

  test("an unknown Host is refused on /mcp, with or without a port", async () => {
    const reply = await rawRequest("POST /mcp HTTP/1.1\r\nHost: evil.example\r\nAuthorization: Bearer x\r\nContent-Length: 2\r\n\r\n{}")
    assert.match(reply, /^HTTP\/1\.1 403/)
    const withPort = await rawRequest(
      "POST /mcp HTTP/1.1\r\nHost: mcp.chatpush.ru:443\r\nAuthorization: Bearer x\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: 2\r\n\r\n{}",
    )
    assert.doesNotMatch(withPort, /^HTTP\/1\.1 403/)
  })

  test("no token, no MCP", async () => {
    const { Authorization: _, ...noToken } = mcpHeaders
    assert.equal((await post("/mcp", "{}", noToken)).status, 401)
  })

  test("an oversized body is refused with 413", async () => {
    const response = await post("/mcp", "x".repeat(4096), mcpHeaders).catch(() => undefined)
    // The server may close the socket right after answering; either way nothing is processed.
    if (response) assert.equal(response.status, 413)
  })

  test("invalid JSON is a parse error", async () => {
    const response = await post("/mcp", "{", mcpHeaders)
    assert.equal(response.status, 400)
    assert.equal((JSON.parse(response.body) as { error: { code: number } }).error.code, -32700)
  })

  test("tools/list works and send_file has no file_path", async () => {
    const response = await post("/mcp", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }), mcpHeaders)
    assert.equal(response.status, 200)
    const body = JSON.parse(response.body) as { result: { tools: { name: string; inputSchema: { properties: object } }[] } }
    assert.equal(body.result.tools.length, 19)
    const sendFile = body.result.tools.find((tool) => tool.name === "send_file")
    assert.equal(Object.hasOwn(sendFile?.inputSchema.properties ?? {}, "file_path"), false)
  })
})
