// OAuth 2.1 for the hosted server, so web clients that only speak OAuth (Claude.ai, ChatGPT)
// can connect. The user signs in by pasting their ChatPush API token on our own page.
//
// Nothing is stored: client registrations, authorization codes, access and refresh tokens are
// sealed (AES-256-GCM) with the server key and carry what they need inside — the access token
// carries the caller's ChatPush token. Changing CHATPUSH_OAUTH_KEY signs everybody out;
// regenerating the API token in the ChatPush dashboard signs that account out at the next
// refresh (access tokens live an hour).
//
// Endpoints (RFC 8414, 9728, 7591, PKCE S256 only):
//   /.well-known/oauth-protected-resource[/mcp]  resource metadata
//   /.well-known/oauth-authorization-server      authorization server metadata
//   POST /register                               dynamic client registration
//   GET|POST /authorize                          sign-in page
//   POST /token                                  code and refresh token exchange
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"

export const ACCESS_TOKEN_PREFIX = "cpo_"
const REFRESH_TOKEN_PREFIX = "cpr_"
const CODE_PREFIX = "cpk_"
const CLIENT_PREFIX = "cpc_"

const ACCESS_TTL_S = 60 * 60
const REFRESH_TTL_S = 90 * 24 * 60 * 60
const CODE_TTL_S = 5 * 60
const FORM_TTL_S = 30 * 60
const SCOPE = "chatpush"
const MAX_FORM_BYTES = 64 * 1024
const LOGIN_ATTEMPTS = 10
const LOGIN_WINDOW_MS = 10 * 60 * 1000

export type TokenCheck = "ok" | "invalid" | "unavailable"

export interface OAuthOptions {
  /** Public base URL, e.g. https://mcp.chatpush.ru (no trailing slash). Used as the issuer. */
  issuer: string
  /** Path of the MCP endpoint, e.g. "/mcp". */
  mcpPath: string
  /** 32-byte keys; the first one seals, all of them open (key rotation). */
  keys: readonly Buffer[]
  /** Checks a ChatPush API token against the API. */
  verifyToken: (token: string) => Promise<TokenCheck>
  /** Take the client IP from X-Forwarded-For (behind nginx). */
  trustProxy?: boolean
  /** Clock, for tests. */
  now?: () => number
}

/** Parses CHATPUSH_OAUTH_KEY: comma-separated keys, each 32 bytes as base64/base64url or 64 hex characters. */
export function parseOAuthKeys(raw: string): Buffer[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const key = /^[0-9a-f]{64}$/i.test(part) ? Buffer.from(part, "hex") : Buffer.from(part, "base64url")
      if (key.length !== 32) throw new Error("CHATPUSH_OAUTH_KEY: every key must be 32 bytes (openssl rand -base64 32)")
      return key
    })
}

class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

interface ClientInfo {
  /** Registered redirect URIs. */
  r: string[]
  /** Client name, as the client gave it. */
  n: string
  /** Whether the client authenticates with a client_secret. */
  s: boolean
}

interface FormState {
  c: string
  r: string
  ch: string
  st?: string
  exp: number
}

interface Grant {
  /** ChatPush API token. */
  t: string
  /** sha256 of the client_id the grant belongs to. */
  c: string
  exp: number
}

interface CodeGrant extends Grant {
  r: string
  ch: string
  /** Random id, so a code is redeemed only once. */
  j: string
}

const b64url = (data: Buffer) => data.toString("base64url")
const sha256 = (value: string) => b64url(createHash("sha256").update(value).digest())

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c)
}

/** A redirect URI a client may register: https, http on loopback, or an app's own scheme. */
export function isAllowedRedirectUri(value: string): boolean {
  if (value.length > 2000) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.hash || url.username || url.password) return false
  const scheme = url.protocol.slice(0, -1).toLowerCase()
  if (scheme === "https") return Boolean(url.hostname)
  if (scheme === "http") return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  return !["javascript", "data", "file", "vbscript", "about", "blob", "ftp", "ws", "wss"].includes(scheme)
}

export class OAuthProvider {
  private readonly now: () => number
  private readonly usedCodes = new Map<string, number>()
  private readonly attempts = new Map<string, number[]>()

  constructor(private readonly options: OAuthOptions) {
    if (!options.keys.length) throw new Error("OAuth needs at least one key")
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000))
  }

  get resource(): string {
    return `${this.options.issuer}${this.options.mcpPath}`
  }

  get resourceMetadataUrl(): string {
    return `${this.options.issuer}/.well-known/oauth-protected-resource${this.options.mcpPath}`
  }

  /** WWW-Authenticate for a 401 on the MCP endpoint, pointing clients at the sign-in. */
  challenge(error?: "invalid_token"): string {
    const parts = [`Bearer resource_metadata="${this.resourceMetadataUrl}"`, `scope="${SCOPE}"`]
    if (error) parts.push(`error="${error}"`)
    return parts.join(", ")
  }

  // ---- sealing -------------------------------------------------------------------------------

  private seal(kind: string, prefix: string, payload: object): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", this.options.keys[0], iv)
    cipher.setAAD(Buffer.from(kind))
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
    return prefix + b64url(Buffer.concat([iv, body, cipher.getAuthTag()]))
  }

  private open<T>(kind: string, prefix: string, value: string | undefined): T | undefined {
    if (!value?.startsWith(prefix) || value.length > 4096) return undefined
    const raw = Buffer.from(value.slice(prefix.length), "base64url")
    if (raw.length < 12 + 16 + 2) return undefined
    for (const key of this.options.keys) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
        decipher.setAAD(Buffer.from(kind))
        decipher.setAuthTag(raw.subarray(raw.length - 16))
        const text = Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString("utf8")
        const payload = JSON.parse(text) as T & { exp?: number }
        if (payload.exp !== undefined && payload.exp < this.now()) return undefined
        return payload
      } catch {
        // wrong key or tampered: try the next key
      }
    }
    return undefined
  }

  private clientSecret(clientId: string): string {
    return b64url(createHmac("sha256", this.options.keys[0]).update(`client-secret:${clientId}`).digest())
  }

  /** ChatPush token inside a valid access token, or undefined. */
  tokenFromAccessToken(value: string): string | undefined {
    return this.open<Grant>("access", ACCESS_TOKEN_PREFIX, value)?.t
  }

  private issueTokens(token: string, clientHash: string): Record<string, unknown> {
    const now = this.now()
    return {
      access_token: this.seal("access", ACCESS_TOKEN_PREFIX, { t: token, c: clientHash, exp: now + ACCESS_TTL_S } satisfies Grant),
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      refresh_token: this.seal("refresh", REFRESH_TOKEN_PREFIX, { t: token, c: clientHash, exp: now + REFRESH_TTL_S } satisfies Grant),
      scope: SCOPE,
    }
  }

  // ---- routing -------------------------------------------------------------------------------

  /** Handles an OAuth request; returns false when the path is not an OAuth one. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname
    const method = req.method ?? "GET"
    if (method === "GET" && (path === "/.well-known/oauth-protected-resource" || path === `/.well-known/oauth-protected-resource${this.options.mcpPath}`)) {
      this.json(res, 200, this.resourceMetadata(), { "Cache-Control": "public, max-age=3600" })
      return true
    }
    if (method === "GET" && path === "/.well-known/oauth-authorization-server") {
      this.json(res, 200, this.serverMetadata(), { "Cache-Control": "public, max-age=3600" })
      return true
    }
    if (path === "/register") {
      if (method !== "POST") return this.methodNotAllowed(res, "POST")
      await this.register(req, res)
      return true
    }
    if (path === "/authorize") {
      if (method === "GET") this.authorizeGet(res, url)
      else if (method === "POST") await this.authorizePost(req, res)
      else return this.methodNotAllowed(res, "GET, POST")
      return true
    }
    if (path === "/token") {
      if (method !== "POST") return this.methodNotAllowed(res, "POST")
      await this.token(req, res)
      return true
    }
    return false
  }

  private methodNotAllowed(res: ServerResponse, allow: string): true {
    this.json(res, 405, { error: "invalid_request", error_description: "Method not allowed" }, { Allow: allow })
    return true
  }

  private json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    })
    res.end(JSON.stringify(body))
  }

  private oauthError(res: ServerResponse, err: OAuthError): void {
    const headers: Record<string, string> = err.status === 401 ? { "WWW-Authenticate": 'Basic realm="ChatPush MCP"' } : {}
    this.json(res, err.status, { error: err.code, error_description: err.message }, headers)
  }

  resourceMetadata(): Record<string, unknown> {
    return {
      resource: this.resource,
      authorization_servers: [this.options.issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: [SCOPE],
      resource_name: "ChatPush",
      resource_documentation: "https://github.com/ChatPush/mcp-chatpush",
    }
  }

  serverMetadata(): Record<string, unknown> {
    const issuer = this.options.issuer
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: [SCOPE],
      authorization_response_iss_parameter_supported: true,
      service_documentation: "https://github.com/ChatPush/mcp-chatpush",
    }
  }

  // ---- registration --------------------------------------------------------------------------

  private async register(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: Record<string, unknown>
    try {
      const parsed = JSON.parse((await readBody(req, MAX_FORM_BYTES)).toString("utf8")) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error()
      body = parsed as Record<string, unknown>
    } catch {
      this.json(res, 400, { error: "invalid_client_metadata", error_description: "The body must be a JSON object." })
      return
    }
    const uris = body.redirect_uris
    if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every((u) => typeof u === "string" && isAllowedRedirectUri(u))) {
      this.json(res, 400, {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris: 1 to 10 URIs, https (http only on localhost), without a fragment.",
      })
      return
    }
    const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : "MCP-клиент"
    const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none"
    const confidential = method === "client_secret_post" || method === "client_secret_basic"
    const clientId = this.seal("client", CLIENT_PREFIX, { r: uris as string[], n: name, s: confidential } satisfies ClientInfo)
    const reply: Record<string, unknown> = {
      client_id: clientId,
      client_id_issued_at: this.now(),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: confidential ? method : "none",
      scope: SCOPE,
    }
    if (confidential) {
      reply.client_secret = this.clientSecret(clientId)
      reply.client_secret_expires_at = 0
    }
    this.json(res, 201, reply)
  }

  // ---- authorization -------------------------------------------------------------------------

  private authorizeGet(res: ServerResponse, url: URL): void {
    const q = url.searchParams
    const clientId = q.get("client_id") ?? ""
    const client = this.open<ClientInfo>("client", CLIENT_PREFIX, clientId)
    if (!client) {
      this.page(res, 400, errorPage("Неизвестное приложение", "Подключение устарело или ссылка повреждена. Запустите подключение ChatPush в приложении ещё раз."))
      return
    }
    const redirect = q.get("redirect_uri") ?? (client.r.length === 1 ? client.r[0] : "")
    if (!client.r.includes(redirect)) {
      this.page(res, 400, errorPage("Неверный адрес возврата", "Приложение передало адрес, который не регистрировало. Запустите подключение ещё раз."))
      return
    }
    const fail = (error: string, description: string) => this.redirect(res, redirect, { error, error_description: description, state: q.get("state") ?? undefined })
    if (q.get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.")
    const challenge = q.get("code_challenge") ?? ""
    if (q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
      return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.")
    }
    const resource = q.get("resource")
    if (resource && resource.replace(/\/+$/, "") !== this.resource && resource.replace(/\/+$/, "") !== this.options.issuer) {
      return fail("invalid_target", `Unknown resource; use ${this.resource}`)
    }
    const form: FormState = { c: clientId, r: redirect, ch: challenge, st: q.get("state") ?? undefined, exp: this.now() + FORM_TTL_S }
    this.page(res, 200, loginPage(client.n, redirect, this.seal("form", "", form)))
  }

  private async authorizePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const params = new URLSearchParams((await readBody(req, MAX_FORM_BYTES)).toString("utf8"))
    const form = this.open<FormState>("form", "", params.get("request") ?? "")
    const client = form && this.open<ClientInfo>("client", CLIENT_PREFIX, form.c)
    if (!form || !client || !client.r.includes(form.r)) {
      this.page(res, 400, errorPage("Время входа истекло", "Страница была открыта слишком долго. Запустите подключение в приложении ещё раз."))
      return
    }
    if (params.get("action") === "deny") {
      this.redirect(res, form.r, { error: "access_denied", error_description: "The user declined.", state: form.st })
      return
    }

    const again = (status: number, message: string) => this.page(res, status, loginPage(client.n, form.r, params.get("request") ?? "", message))
    if (!this.allowAttempt(req)) {
      again(429, "Слишком много попыток. Подождите 10 минут и попробуйте снова.")
      return
    }
    const token = (params.get("token") ?? "").trim().replace(/^Bearer\s+/i, "")
    if (!token || token.length > 1000 || /\s/.test(token)) {
      again(400, "Вставьте API-токен из раздела «Интеграции» кабинета ChatPush.")
      return
    }
    const check = await this.options.verifyToken(token)
    if (check === "invalid") {
      again(400, "ChatPush не принял этот токен. Скопируйте его ещё раз в разделе «Интеграции» кабинета.")
      return
    }
    if (check === "unavailable") {
      again(503, "ChatPush сейчас не отвечает. Попробуйте ещё раз через минуту.")
      return
    }
    const code = this.seal("code", CODE_PREFIX, {
      t: token,
      c: sha256(form.c),
      r: form.r,
      ch: form.ch,
      j: b64url(randomBytes(12)),
      exp: this.now() + CODE_TTL_S,
    } satisfies CodeGrant)
    this.redirect(res, form.r, { code, state: form.st, iss: this.options.issuer })
  }

  /** Login attempts per client IP: LOGIN_ATTEMPTS per LOGIN_WINDOW_MS. */
  private allowAttempt(req: IncomingMessage): boolean {
    const forwarded = this.options.trustProxy ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : ""
    const ip = forwarded || req.socket.remoteAddress || "unknown"
    const now = Date.now()
    const recent = (this.attempts.get(ip) ?? []).filter((at) => now - at < LOGIN_WINDOW_MS)
    if (recent.length >= LOGIN_ATTEMPTS) return false
    recent.push(now)
    this.attempts.set(ip, recent)
    if (this.attempts.size > 10_000) {
      for (const [key, times] of this.attempts) if (times.every((at) => now - at >= LOGIN_WINDOW_MS)) this.attempts.delete(key)
    }
    return true
  }

  private redirect(res: ServerResponse, target: string, params: Record<string, string | undefined>): void {
    const url = new URL(target)
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value)
    res.writeHead(302, { Location: url.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" })
    res.end()
  }

  private page(res: ServerResponse, status: number, html: string): void {
    res.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    })
    res.end(html)
  }

  // ---- token endpoint ------------------------------------------------------------------------

  private async token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const params = new URLSearchParams((await readBody(req, MAX_FORM_BYTES)).toString("utf8"))
      const clientId = this.authenticateClient(req, params)
      const grantType = params.get("grant_type")
      if (grantType === "authorization_code") this.json(res, 200, this.redeemCode(params, clientId))
      else if (grantType === "refresh_token") this.json(res, 200, await this.refresh(params, clientId))
      else throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token.")
    } catch (err) {
      if (err instanceof OAuthError) this.oauthError(res, err)
      else throw err
    }
  }

  /** client_id from the body or HTTP Basic, with the secret checked for confidential clients. */
  private authenticateClient(req: IncomingMessage, params: URLSearchParams): string {
    let clientId = params.get("client_id") ?? ""
    let secret = params.get("client_secret") ?? undefined
    const basic = /^Basic\s+(.+)$/i.exec(req.headers.authorization ?? "")
    if (basic) {
      const decoded = Buffer.from(basic[1], "base64").toString("utf8")
      const colon = decoded.indexOf(":")
      clientId = decodeURIComponent(colon === -1 ? decoded : decoded.slice(0, colon))
      secret = colon === -1 ? "" : decodeURIComponent(decoded.slice(colon + 1))
    }
    const client = this.open<ClientInfo>("client", CLIENT_PREFIX, clientId)
    if (!client) throw new OAuthError("invalid_client", "Unknown client_id.", 401)
    if (client.s && !(secret && safeEqual(secret, this.clientSecret(clientId)))) {
      throw new OAuthError("invalid_client", "Wrong client_secret.", 401)
    }
    return clientId
  }

  private redeemCode(params: URLSearchParams, clientId: string): Record<string, unknown> {
    const code = this.open<CodeGrant>("code", CODE_PREFIX, params.get("code") ?? "")
    if (!code || this.usedCodes.has(code.j)) throw new OAuthError("invalid_grant", "The code is invalid, expired or already used.")
    if (code.c !== sha256(clientId)) throw new OAuthError("invalid_grant", "The code was issued to another client.")
    const redirect = params.get("redirect_uri")
    if (redirect !== null && redirect !== code.r) throw new OAuthError("invalid_grant", "redirect_uri does not match the authorization request.")
    const verifier = params.get("code_verifier") ?? ""
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(sha256(verifier), code.ch)) {
      throw new OAuthError("invalid_grant", "PKCE check failed: wrong code_verifier.")
    }
    this.usedCodes.set(code.j, code.exp)
    this.forgetExpiredCodes()
    return this.issueTokens(code.t, code.c)
  }

  private forgetExpiredCodes(): void {
    const now = this.now()
    for (const [id, exp] of this.usedCodes) if (exp < now) this.usedCodes.delete(id)
  }

  private async refresh(params: URLSearchParams, clientId: string): Promise<Record<string, unknown>> {
    const grant = this.open<Grant>("refresh", REFRESH_TOKEN_PREFIX, params.get("refresh_token") ?? "")
    if (!grant || grant.c !== sha256(clientId)) throw new OAuthError("invalid_grant", "The refresh token is invalid or expired.")
    // The token may have been regenerated in the dashboard since: then the sign-in ends here.
    const check = await this.options.verifyToken(grant.t)
    if (check === "invalid") throw new OAuthError("invalid_grant", "The ChatPush token is no longer valid; sign in again.")
    if (check === "unavailable") throw new OAuthError("temporarily_unavailable", "ChatPush is not answering, try again shortly.", 503)
    return this.issueTokens(grant.t, grant.c)
  }
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.byteLength
    if (total > limit) throw new OAuthError("invalid_request", "Request body is too large.", 413)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// ---- pages -----------------------------------------------------------------------------------

const STYLE = `
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#161615;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:460px;margin:48px auto;padding:0 16px}.card{background:#fff;border-radius:16px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0 0 12px}p{margin:0 0 14px}.muted{color:#5f6368;font-size:14px}.app{font-weight:600;word-break:break-word}
.host{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#f1f3f4;border-radius:6px;padding:2px 6px;word-break:break-all}
label{display:block;font-weight:600;margin:18px 0 6px}input[type=password]{width:100%;padding:12px;border:1px solid #c7c9cc;border-radius:10px;font:inherit}
input[type=password]:focus{outline:3px solid #8ab4f8;border-color:#1a73e8}.row{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
button{font:inherit;font-weight:600;border-radius:10px;padding:11px 18px;cursor:pointer;border:1px solid #c7c9cc;background:#fff;color:#161615}
button.primary{background:#1a73e8;border-color:#1a73e8;color:#fff;flex:1}.error{background:#fce8e6;color:#a50e0e;border-radius:10px;padding:10px 12px;margin:0 0 14px}
a{color:#1a73e8}@media (prefers-color-scheme:dark){body{background:#131314;color:#e8eaed}.card{background:#1f1f20;box-shadow:none}.muted{color:#9aa0a6}
.host{background:#2d2e30}input[type=password]{background:#131314;color:#e8eaed;border-color:#5f6368}button{background:#2d2e30;color:#e8eaed;border-color:#5f6368}
button.primary{background:#8ab4f8;border-color:#8ab4f8;color:#131314}.error{background:#5c1d18;color:#f6aea9}a{color:#8ab4f8}}`

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} — ChatPush</title><style>${STYLE}</style></head><body><main><div class="card">${body}</div></main></body></html>`
}

function loginPage(clientName: string, redirect: string, request: string, error?: string): string {
  let host = redirect
  try {
    const url = new URL(redirect)
    host = url.host || `${url.protocol}//`
  } catch {
    // keep the raw value
  }
  return shell(
    "Вход",
    `<h1>Подключение к ChatPush</h1>
<p><span class="app">${escapeHtml(clientName)}</span> просит доступ к вашему аккаунту ChatPush. Приложение сможет отправлять сообщения, файлы и рассылки от имени аккаунта и смотреть баланс и статусы доставки.</p>
<p class="muted">После входа вы вернётесь на <span class="host">${escapeHtml(host)}</span>. Если вы не начинали подключение сами — закройте страницу.</p>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/authorize" autocomplete="off">
<input type="hidden" name="request" value="${escapeHtml(request)}">
<label for="token">API-токен ChatPush</label>
<input type="password" id="token" name="token" required autofocus spellcheck="false">
<p class="muted" style="margin-top:8px">Токен — в кабинете ChatPush, раздел <a href="https://chatpush.ru/front_office/integrations" target="_blank" rel="noopener noreferrer">«Интеграции»</a>. Нет аккаунта — <a href="https://chatpush.ru/customers/sign_up" target="_blank" rel="noopener noreferrer">10 дней бесплатно</a>.</p>
<div class="row"><button type="submit" name="action" value="allow" class="primary">Разрешить доступ</button><button type="submit" name="action" value="deny" formnovalidate>Отмена</button></div>
</form>
<p class="muted" style="margin-top:18px">Отозвать доступ: создайте новый API-токен в разделе «Интеграции» — подключение перестанет работать в течение часа.</p>`,
  )
}

function errorPage(title: string, text: string): string {
  return shell(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p>`)
}
