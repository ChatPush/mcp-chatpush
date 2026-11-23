---
name: chatpush
description: Send messages, files and bulk mailings to customers in MAX, WhatsApp, Telegram and SMS through the ChatPush MCP server, check delivery and connect a messenger by QR. Use when the user asks to text, notify, remind or message a customer or a list of phone numbers, send a document to a client, check if a message was delivered, or set up ChatPush for an AI agent.
---

# ChatPush: messages to customers from an AI agent

ChatPush is a Russian business messaging service. Its MCP server (`chatpush-mcp-server`) gives the agent 19 tools to send from the company's own MAX, WhatsApp, Telegram and SMS accounts.

## Setup (once)

1. The user needs a ChatPush API token: sign up at https://chatpush.ru/customers/sign_up?partner=apimcp (10 days free), copy the token at https://chatpush.ru/front_office/integrations. Never invent or print the token.
2. Add the server (Node.js 20+):
   - Claude Code: `claude mcp add chatpush --env CHATPUSH_TOKEN=<token> -- npx -y chatpush-mcp-server` (add `--scope user` for all projects)
   - Codex, Cursor, Gemini CLI, other stdio clients: command `npx -y chatpush-mcp-server`, env `CHATPUSH_TOKEN`
   - Claude Desktop: one-file extension https://github.com/ChatPush/mcp-chatpush/releases/latest/download/chatpush-mcp-server.mcpb
3. Check: call `get_balance`. A balance means it works.

## Sending

- One recipient: `send_message` with `phone` (international format, digits only, e.g. `79991234567`) and `text`.
- Channel order goes in `dispatch_routing`, tried one by one: `max`, `whatsapp`, `tdlib` (personal Telegram: `phone`, `username` or `tdlib_user_id`), `telegram` (Telegram bot: only users who started the bot), `notify` (VK/OK), `sms`. Put `sms` last. Without it, the account's default routing is used.
- Text limit: 3500 characters; 938 when SMS is in the route.
- Later: `scheduled_at` in UTC. Convert the user's local time first.
- Files: `send_file` to MAX, WhatsApp or Telegram (`dispatch_routing` sets the channel). SMS cannot carry files.
- Many recipients: `send_bulk`. **Before any bulk send, show the user the text and the number of recipients and wait for an explicit yes.** Send only to people who agreed to receive messages.

## After sending

- `get_delivery_status` with the delivery ID. Never resend after an error or unclear result until the status is checked: the server never retries sends by itself, so a repeat can double-message a customer.
- `delete_delivery` removes a delivered WhatsApp or personal Telegram message on the recipient's devices.

## When something is not connected

- `get_account` shows which messengers are authorized.
- WhatsApp or personal Telegram not connected: `get_messenger_auth_link` returns a QR page link; the user scans it on the phone that will send. MAX and the Telegram bot are connected in the ChatPush dashboard.

## Links

- Product page: https://chatpush.ru/integrations/mcp
- Repository: https://github.com/ChatPush/mcp-chatpush
