# Changelog

## 1.1.0 — 2026-11-23

- Hosted server: OAuth 2.1 sign-in for web clients that connect only with OAuth (Claude.ai, ChatGPT). The server is its own authorization server — resource and server metadata, dynamic client registration, PKCE S256, refresh tokens — and the user signs in by pasting the ChatPush API token on a Russian page. Stateless: everything is sealed with `CHATPUSH_OAUTH_KEY`. Off unless `CHATPUSH_OAUTH_KEY` and `CHATPUSH_PUBLIC_URL` are set; a plain token in the `Authorization` header keeps working.

## 1.0.1 — 2026-11-17

- MCP Registry name is now `io.github.ChatPush/whatsapp-telegram-max-sms` (searchable by channel names). The old entry `io.github.ChatPush/mcp-chatpush` should be marked deprecated after the release.
- `send_file` description: files go to MAX, WhatsApp and Telegram.
- Russian README with an English header, `README.en.md`, `guides/`, `AGENTS.md`, `llms.txt`, agent skill `skills/chatpush/SKILL.md`; npm keywords and homepage.

## 1.0.0 — 2026-11-16

- Initial ChatPush MCP server: local (stdio) and remote (Streamable HTTP) transports.
- Hosted server: `send_file` takes only `file_base64` — `file_path` and `file_url` are not offered and are rejected, so the server's disk and internal network stay out of reach.
- Hosted server: request body limit (`CHATPUSH_MAX_BODY_MB`, 20 MB), concurrent request limit (`CHATPUSH_MAX_CONCURRENT_REQUESTS`, 32), own `Host` check (port ignored) instead of the deprecated SDK option, a malformed request no longer stops the process.
- Sends are never reported as "not sent" when they may have gone through: a broken connection after the request left, a response cut off after HTTP 2xx, or a 2xx response in an unexpected format all say "do not repeat".
- Secrets (the account token) are masked in raw API responses shown to the model.
- `file_url` downloads stop at 100 MB instead of buffering the whole body; base64 size is checked before decoding.
- Error messages name the right place for the token in each mode.
- A Retry-After longer than 15 s is reported instead of waited for, so tool calls don't outlive client timeouts.
- POST, PUT and PATCH send parameters in the request body instead of the URL: a 3500-character Cyrillic text made a 21 KB URL that ChatPush answered with HTTP 414 (the limit was about 1350 Cyrillic characters), and texts and phone numbers no longer land in access logs.
- `send_message` / `send_bulk` describe the 938-character text limit when the routing includes SMS.
- Unit tests (`npm test`), run in CI.
- Claude Desktop extension (`.mcpb`) with the ChatPush icon; Glama maintainer set to the ChatPush side.
- The hosted endpoint `https://mcp.chatpush.ru/mcp` is not listed in the MCP Registry yet: it is added in a later release, once the server is deployed.
