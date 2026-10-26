# ChatPush MCP Server

[![CI](https://github.com/ChatPush/mcp-chatpush/actions/workflows/ci.yml/badge.svg)](https://github.com/ChatPush/mcp-chatpush/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Official MCP server for [ChatPush](https://chatpush.ru) — send WhatsApp, Telegram, SMS, VK/OK and MAX messages, files and bulk mailings from AI agents.

It runs in two modes from the same codebase:

| Mode | Transport | Who it is for | Token |
| --- | --- | --- | --- |
| **Remote** | Streamable HTTP, hosted at `https://mcp.chatpush.ru/mcp` | Yandex and other platforms that connect to a URL; users with no local Node.js | Each caller sends their own token in the `Authorization` header |
| **Local** | stdio, `npx -y chatpush-mcp-server` | Claude Desktop, Claude Code, Cursor, VS Code | `CHATPUSH_TOKEN` in the client config |

## Tools

| Tool | Description |
| --- | --- |
| `get_account` | Full account info: balance, dispatch routing, sender names, subscription, WhatsApp/Telegram session status |
| `get_balance` | Balance, customer ID, dispatch routing channels and registered sender names |
| `get_utm_tags` | UTM tags used to track dispatches |
| `send_message` | Send a text via WhatsApp, Telegram (tdlib), Telegram Bot, SMS, VK/OK or MAX — with cascade, scheduling, priority and reply-to |
| `send_bulk` | Send the same message to many phone numbers at once |
| `send_file` | Send a document, image, audio or video from a local path, URL or base64 (up to 100 MB; base64 only on the hosted server) |
| `get_delivery_status` | Status and details of a delivery, explained in plain words |
| `delete_delivery` | Delete a delivered WhatsApp/Telegram message on all recipient devices |
| `get_phone_info` | Country, operator and normalized format of a phone number |
| `create_webhook` · `get_webhook` · `list_webhooks` · `update_webhook` · `delete_webhook` | Subscribe your backend to incoming messages, delivery statuses and login events |
| `set_chat_client_name` | Rename a contact in the ChatPush web messenger |
| `get_messenger_auth_link` | Link to the QR page that connects WhatsApp or a personal Telegram account |
| `create_sub_customer` · `list_sub_customers` · `get_sub_customer` | Multi-account: create and inspect sub-clients, each with its own token |

## Get a token

Sign up at **[chatpush.ru](https://chatpush.ru)** and copy the API token from the dashboard. To send through WhatsApp or Telegram, connect the messenger in the dashboard first — or call `get_messenger_auth_link` and scan the QR code.

## Remote mode (hosted)

The hosted server exposes one MCP endpoint:

```
POST https://mcp.chatpush.ru/mcp
Authorization: Bearer <ChatPush API token>
```

- Transport: **Streamable HTTP** (MCP protocol 2025-06-18), JSON responses enabled.
- **Stateless:** a fresh server instance per request, so it scales horizontally behind any proxy.
- **No credentials on the server:** the token is read from the request header and used only for that request. Nothing is stored or logged.
- `GET /healthz` returns `{"status":"ok",...}` without a token, for load-balancer checks.
- **Files:** `send_file` takes only `file_base64` here. `file_path` and `file_url` are local-mode only: on a shared server they would point at the server's own disk and network. With the default 20 MB request limit, files up to about 14 MB fit.

Connecting from a client that supports remote MCP servers:

```json
{
  "url": "https://mcp.chatpush.ru/mcp",
  "headers": { "Authorization": "Bearer your_token_here" }
}
```

### Deployment

```bash
docker build -t chatpush-mcp-server .
docker run -p 3000:3000 -e CHATPUSH_ALLOWED_HOSTS=mcp.chatpush.ru chatpush-mcp-server
```

Without Docker: `npm ci && npm run build && npm run start:http`.

Put TLS in front (nginx, Traefik, a cloud load balancer) and point `mcp.chatpush.ru` at it. The service needs no database, no disk and no secrets.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Interface to bind |
| `CHATPUSH_MCP_PATH` | `/mcp` | Path of the MCP endpoint |
| `CHATPUSH_BASE_URL` | `https://api.chatpush.ru` | ChatPush API host |
| `CHATPUSH_ALLOWED_HOSTS` | — | Comma-separated hostnames accepted in the `Host` header of `/mcp` requests (port ignored), e.g. `mcp.chatpush.ru`. **Required in production:** it blocks DNS-rebinding attacks. Empty = any host, with a warning at startup |
| `CHATPUSH_MAX_BODY_MB` | `20` | Largest request body, in MB. Bigger requests get 413 before they are read |
| `CHATPUSH_MAX_CONCURRENT_REQUESTS` | `32` | MCP requests handled at once; the rest get 503 with `Retry-After` |
| `CHATPUSH_ALLOWED_ORIGIN` | `*` | Value for `Access-Control-Allow-Origin` |
| `CHATPUSH_DEBUG` | `0` | `1` logs every request URL to stderr. URLs contain message text and phone numbers, so keep it off in production |

## Local mode (stdio)

Requires Node.js 20 or newer.

### Claude Desktop

*Settings → Developer → Edit Config* (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chatpush": {
      "command": "npx",
      "args": ["-y", "chatpush-mcp-server"],
      "env": { "CHATPUSH_TOKEN": "your_token_here" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add chatpush --env CHATPUSH_TOKEN=your_token_here -- npx -y chatpush-mcp-server
```

### Cursor

Add the same `mcpServers` block to `~/.cursor/mcp.json`.

### VS Code

`.vscode/mcp.json` — VS Code asks for the token and keeps it out of the file:

```json
{
  "inputs": [
    { "type": "promptString", "id": "chatpush_token", "description": "ChatPush token", "password": true }
  ],
  "servers": {
    "chatpush": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chatpush-mcp-server"],
      "env": { "CHATPUSH_TOKEN": "${input:chatpush_token}" }
    }
  }
}
```

## Channels

`dispatch_routing` is an ordered list of channels. ChatPush tries them one by one and moves to the next only if delivery through the previous one fails. Without it, the default routing from your dashboard is used.

| Value | Channel | Recipient |
| --- | --- | --- |
| `whatsapp` | WhatsApp | `phone` or `whatsapp_lid` |
| `tdlib` | Personal Telegram account | `phone`, `username` or `tdlib_user_id` (negative ID = group chat) |
| `telegram` | Telegram Bot | `phone` |
| `sms` | SMS | `phone` |
| `notify` | VK / OK notifications | `phone` |
| `max` | MAX messenger | `phone` |

## Usage examples

| Say | Tool |
| --- | --- |
| "Send a WhatsApp message to +7 999 123-45-67: your order has shipped." | `send_message` |
| "Try WhatsApp first, then SMS: your code is 4821." | `send_message` (cascade) |
| "Remind 79991234567 tomorrow at 09:00 UTC about the appointment." | `send_message` (scheduled) |
| "Send invoice.pdf to 79991234567." | `send_file` |
| "Was message 94396942 delivered?" | `get_delivery_status` |
| "Connect my WhatsApp." | `get_messenger_auth_link` |
| "Create a sub-client called Acme." | `create_sub_customer` |
| "Rename the contact 79991234567 to Ivan from Acme." | `set_chat_client_name` |

## Behaviour

- Parameters go in the URL query string, as the ChatPush API expects; `send_file` uploads the file as `multipart/form-data`.
- Incompatible parameters (a Telegram `username` without the `tdlib` channel, `scheduled_at` in the past) are rejected before any request is sent.
- HTTP 429 is retried up to 3 times with exponential backoff, honouring `Retry-After`; 5xx twice — except for requests that send messages, so nothing is sent twice.
- Requests time out after 30 seconds.
- Errors come back as readable tool errors, e.g. `Invalid ChatPush token. Check your CHATPUSH_TOKEN.`
- All logs go to stderr; stdout carries the MCP protocol in stdio mode.

## Development

```bash
npm install
cp .env.example .env     # put your token in .env
npm run build
npm run dev              # stdio
npm run dev:http         # remote, http://localhost:3000/mcp
npm test                 # unit tests
```

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests (`node:test`): validation, retries, double-send protection, hosted-server limits |
| `npm run typecheck` | Type-check the sources and the tests |
| `npm run check` | Versions in sync across `package.json` / `server.json` / `manifest.json` and all 19 tools exposed |
| `npm run build:mcpb` | Build the Claude Desktop extension into `build/chatpush-mcp-server.mcpb` |
| `npm run inspector` | Open the MCP Inspector against the local server |

## License

[MIT](LICENSE)
