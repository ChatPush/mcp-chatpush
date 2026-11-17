import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { request, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { after, before, beforeEach, describe, test } from "node:test"
import { createHttpServer } from "../src/httpServer.js"
import { isAllowedRedirectUri, OAuthProvider, parseOAuthKeys, type TokenCheck } from "../src/oauth.js"
import { json, mockFetch, testConfig } from "./helpers.js"

const ISSUER = "https://mcp.chatpush.ru"
const GOOD = "real-chatpush-token"
const REDIRECT = "https://claude.ai/api/mcp/auth_callback"

let server: Server
let port: number
let clock = 1_800_000_000
let apiState: TokenCheck = "ok"
let restoreFetch: () => void
const apiAuth: string[] = []

before(async () => {
  const oauth = new OAuthProvider({
    issuer: ISSUER,
    mcpPath: "/mcp",
    keys: parseOAuthKeys(randomBytes(32).toString("base64")),
    now: () => clock,
    verifyToken: async (token) => (apiState !== "ok" ? apiState : token === GOOD ? "ok" : "invalid"),
  })
  server = createHttpServer(testConfig("http"), {
    mcpPath: "/mcp",
    allowedHosts: ["mcp.chatpush.ru"],
    allowedOrigin: "*",
    maxBodyBytes: 1024 * 1024,
    maxConcurrentRequests: 4,
    oauth,
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  port = (server.address() as AddressInfo).port
  // The ChatPush API, as the MCP tools see it: records which token reached it.
  restoreFetch = mockFetch((_url, init) => {
    apiAuth.push(String((init?.headers as Record<string, string>).Authorization))
    return json({ status: "ok", data: { balance: 100, currency: "RUB" } })
  }).restore
})
after(async () => {
  restoreFetch()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
beforeEach(() => {
  apiState = "ok"
})

interface Reply {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

/** node:http, so the Host header can be set and fetch stays mocked for the API. */
function call(method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { Host: "mcp.chatpush.ru", ...headers } }, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }))
    })
    req.on("error", reject)
    req.end(body)
  })
}

const form = (values: Record<string, string>) => [
  new URLSearchParams(values).toString(),
  { "Content-Type": "application/x-www-form-urlencoded" },
] as const

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url")
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") }
}

async function register(extra: Record<string, unknown> = {}): Promise<Record<string, string>> {
  const reply = await call("POST", "/register", JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT], ...extra }), {
    "Content-Type": "application/json",
  })
  assert.equal(reply.status, 201, reply.body)
  return JSON.parse(reply.body) as Record<string, string>
}

/** The hidden "request" field of the sign-in page. */
function requestField(html: string): string {
  const match = /name="request" value="([^"]+)"/.exec(html)
  assert.ok(match, "sign-in form")
  return match[1]
}

async function signIn(clientId: string, challenge: string, token = GOOD): Promise<Reply> {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-1",
    resource: `${ISSUER}/mcp`,
  })
  const page = await call("GET", `/authorize?${query}`)
  assert.equal(page.status, 200, page.body)
  return call("POST", "/authorize", ...form({ request: requestField(page.body), token, action: "allow" }))
}

async function fullFlow(): Promise<{ client: Record<string, string>; tokens: Record<string, string> }> {
  const client = await register()
  const { verifier, challenge } = pkce()
  const redirect = await signIn(client.client_id, challenge)
  assert.equal(redirect.status, 302)
  const code = new URL(String(redirect.headers.location)).searchParams.get("code") ?? ""
  const reply = await call(
    "POST",
    "/token",
    ...form({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT }),
  )
  assert.equal(reply.status, 200, reply.body)
  return { client, tokens: JSON.parse(reply.body) as Record<string, string> }
}

const mcp = (token: string) =>
  call("POST", "/mcp", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_balance", arguments: {} } }), {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  })

describe("OAuth metadata", () => {
  test("401 without a token points at the resource metadata", async () => {
    const reply = await call("POST", "/mcp", "{}", { "Content-Type": "application/json" })
    assert.equal(reply.status, 401)
    assert.match(String(reply.headers["www-authenticate"]), /resource_metadata="https:\/\/mcp\.chatpush\.ru\/\.well-known\/oauth-protected-resource\/mcp"/)
  })

  test("resource and authorization server metadata", async () => {
    const resource = JSON.parse((await call("GET", "/.well-known/oauth-protected-resource/mcp")).body) as Record<string, unknown>
    assert.equal(resource.resource, `${ISSUER}/mcp`)
    assert.deepEqual(resource.authorization_servers, [ISSUER])
    const as = JSON.parse((await call("GET", "/.well-known/oauth-authorization-server")).body) as Record<string, unknown>
    assert.equal(as.issuer, ISSUER)
    assert.equal(as.registration_endpoint, `${ISSUER}/register`)
    assert.deepEqual(as.code_challenge_methods_supported, ["S256"])
  })

  test("OAuth endpoints keep the Host check", async () => {
    assert.equal((await call("GET", "/.well-known/oauth-authorization-server", undefined, { Host: "evil.example" })).status, 403)
  })
})

describe("OAuth flow", () => {
  test("sign in, get tokens, call a tool with the caller's own ChatPush token", async () => {
    const { tokens } = await fullFlow()
    assert.match(tokens.access_token, /^cpo_/)
    assert.equal(tokens.token_type, "Bearer")
    assert.ok(!tokens.access_token.includes(GOOD), "the ChatPush token is not readable in the access token")
    apiAuth.length = 0
    const reply = await mcp(tokens.access_token)
    assert.equal(reply.status, 200, reply.body)
    assert.deepEqual(apiAuth, [`Bearer ${GOOD}`])
  })

  test("the redirect carries state and iss", async () => {
    const client = await register()
    const redirect = await signIn(client.client_id, pkce().challenge)
    const location = new URL(String(redirect.headers.location))
    assert.equal(`${location.origin}${location.pathname}`, REDIRECT)
    assert.equal(location.searchParams.get("state"), "st-1")
    assert.equal(location.searchParams.get("iss"), ISSUER)
  })

  test("a wrong ChatPush token stays on the page with an error", async () => {
    const client = await register()
    const reply = await signIn(client.client_id, pkce().challenge, "wrong")
    assert.equal(reply.status, 400)
    assert.match(reply.body, /не принял этот токен/)
  })

  test("ChatPush down: the page says so, no code", async () => {
    apiState = "unavailable"
    const client = await register()
    const reply = await signIn(client.client_id, pkce().challenge)
    assert.equal(reply.status, 503)
  })

  test("deny returns access_denied", async () => {
    const client = await register()
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
      state: "s",
    })
    const page = await call("GET", `/authorize?${query}`)
    const reply = await call("POST", "/authorize", ...form({ request: requestField(page.body), action: "deny" }))
    assert.equal(new URL(String(reply.headers.location)).searchParams.get("error"), "access_denied")
  })

  test("wrong code_verifier, reused code, other client: invalid_grant", async () => {
    const client = await register()
    const other = await register()
    const { verifier, challenge } = pkce()
    const redirect = await signIn(client.client_id, challenge)
    const code = new URL(String(redirect.headers.location)).searchParams.get("code") ?? ""
    const exchange = (values: Record<string, string>) =>
      call("POST", "/token", ...form({ grant_type: "authorization_code", code, client_id: client.client_id, code_verifier: verifier, ...values }))

    assert.equal(JSON.parse((await exchange({ code_verifier: pkce().verifier })).body).error, "invalid_grant")
    assert.equal(JSON.parse((await exchange({ client_id: other.client_id })).body).error, "invalid_grant")
    assert.equal((await exchange({})).status, 200)
    assert.equal(JSON.parse((await exchange({})).body).error, "invalid_grant")
  })

  test("refresh gives a new access token; a regenerated ChatPush token ends it", async () => {
    const { client, tokens } = await fullFlow()
    const refresh = () =>
      call("POST", "/token", ...form({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id }))
    const ok = await refresh()
    assert.equal(ok.status, 200)
    assert.match((JSON.parse(ok.body) as Record<string, string>).access_token, /^cpo_/)
    apiState = "invalid"
    assert.equal(JSON.parse((await refresh()).body).error, "invalid_grant")
  })

  test("an expired access token is refused with invalid_token", async () => {
    const { tokens } = await fullFlow()
    clock += 2 * 60 * 60
    try {
      const reply = await mcp(tokens.access_token)
      assert.equal(reply.status, 401)
      assert.match(String(reply.headers["www-authenticate"]), /error="invalid_token"/)
    } finally {
      clock -= 2 * 60 * 60
    }
  })

  test("a plain ChatPush token in the header still works", async () => {
    apiAuth.length = 0
    assert.equal((await mcp("plain-token")).status, 200)
    assert.deepEqual(apiAuth, ["Bearer plain-token"])
  })

  test("confidential clients must send their secret", async () => {
    const client = await register({ token_endpoint_auth_method: "client_secret_post" })
    assert.ok(client.client_secret)
    const reply = await call("POST", "/token", ...form({ grant_type: "refresh_token", refresh_token: "x", client_id: client.client_id }))
    assert.equal(reply.status, 401)
    assert.equal(JSON.parse(reply.body).error, "invalid_client")
  })
})

describe("OAuth input checks", () => {
  test("redirect URIs", () => {
    assert.equal(isAllowedRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect"), true)
    assert.equal(isAllowedRedirectUri("http://localhost:6274/oauth/callback"), true)
    assert.equal(isAllowedRedirectUri("http://127.0.0.1:33418/"), true)
    assert.equal(isAllowedRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"), true)
    assert.equal(isAllowedRedirectUri("http://evil.example/cb"), false)
    assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false)
    assert.equal(isAllowedRedirectUri("https://claude.ai/cb#x"), false)
  })

  test("registration refuses a bad redirect URI", async () => {
    const reply = await call("POST", "/register", JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }), { "Content-Type": "application/json" })
    assert.equal(reply.status, 400)
  })

  test("authorize with an unregistered redirect shows an error page and does not redirect", async () => {
    const client = await register()
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "https://evil.example/cb",
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
    })
    const reply = await call("GET", `/authorize?${query}`)
    assert.equal(reply.status, 400)
    assert.equal(reply.headers.location, undefined)
  })

  test("authorize without PKCE is refused", async () => {
    const client = await register()
    const reply = await call("GET", `/authorize?${new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT })}`)
    assert.equal(new URL(String(reply.headers.location)).searchParams.get("error"), "invalid_request")
  })

  test("the client name is escaped on the page", async () => {
    const client = await register({ client_name: '<script>alert("x")</script>' })
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
    })
    const page = await call("GET", `/authorize?${query}`)
    assert.ok(!page.body.includes("<script>alert"))
    assert.equal(page.headers["x-frame-options"], "DENY")
  })

  test("keys: 32 bytes, base64 or hex", () => {
    assert.equal(parseOAuthKeys(`${randomBytes(32).toString("hex")}, ${randomBytes(32).toString("base64")}`).length, 2)
    assert.throws(() => parseOAuthKeys("short"))
  })
})
