# AGENTS.md — ChatPush MCP Server

Notes for AI agents (Claude Code, Cursor, Codex, OpenClaw and others) that install, call or modify this server.

## What this server does

Official MCP server for [ChatPush](https://chatpush.ru/integrations/mcp?utm_source=github&utm_medium=agents_md&utm_campaign=mcp): send WhatsApp, Telegram (personal account or bot), MAX, SMS and VK/OK messages, files and bulk mailings from a ChatPush business account; check delivery; connect a messenger by QR code; manage webhooks and sub-accounts. 19 tools.

## Install it for a user

1. The user needs a ChatPush API token: sign up at https://chatpush.ru/customers/sign_up?partner=apimcp (10 days free), then copy the token from https://chatpush.ru/front_office/integrations. Never invent a token and never commit it.
2. Run locally (stdio, Node.js 20+): `npx -y chatpush-mcp-server` with env `CHATPUSH_TOKEN`.
   - Claude Code: `claude mcp add chatpush --env CHATPUSH_TOKEN=<token> -- npx -y chatpush-mcp-server`
   - Claude Desktop: one-file extension https://github.com/ChatPush/mcp-chatpush/releases/latest/download/chatpush-mcp-server.mcpb
   - Cursor / VS Code / other clients: see [README.md](README.md#быстрый-старт).
3. Verify: call `get_balance`. A balance in the answer means the token works.

The hosted endpoint `https://mcp.chatpush.ru/mcp` (Streamable HTTP, `Authorization: Bearer <token>`) is not live yet; use the local mode.

A ready agent skill with the same rules: [`skills/chatpush/SKILL.md`](skills/chatpush/SKILL.md).

## Calling the tools safely

- `send_message`, `send_bulk` and `send_file` deliver **real messages to real people**. Confirm the recipient list and the text with the user before a bulk send.
- Never repeat a send after a network error or an unclear result. Call `get_delivery_status` first; the server itself never retries sends.
- Channels go in `dispatch_routing` as an ordered cascade: `max`, `whatsapp`, `tdlib` (personal Telegram), `telegram` (Telegram bot), `notify` (VK/OK), `sms`. Put `sms` last.
- If sending fails because WhatsApp or Telegram is not connected, call `get_messenger_auth_link` and give the user the QR link.
- Phone numbers are international format without spaces, e.g. `79991234567`.

## Working on the code

- TypeScript, Node.js 20+. `npm ci && npm run build`, `npm test`, `npm run typecheck`, `npm run check` (versions in `package.json`, `server.json`, `manifest.json` must match; exactly 19 tools).
- Logs go to stderr only; stdout carries the MCP protocol in stdio mode.
- Tools live in `src/tools/`, one file per area, registered through `defineTool` in `src/tools/registry.ts`.
