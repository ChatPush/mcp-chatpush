# Privacy Policy — ChatPush MCP Server

_Last updated: 2026-10-07_

This policy describes how the **ChatPush MCP Server** handles data. It covers both ways the server runs:

- **Local:** the npm package `chatpush-mcp-server` and the Claude Desktop extension, running on the user's own computer.
- **Remote:** the hosted server at `https://mcp.chatpush.ru/mcp`, operated by CHATPUSH LLC.

It supplements the **[CHATPUSH LLC Privacy Policy](https://chatpush.ru/jp/privacypolicy)**, which governs personal data processed by the ChatPush service itself.

## 1. What the server is

The server lets an AI assistant (for example Claude) call the ChatPush API on your behalf. It performs only the actions you or the assistant request, and it talks to one place: the ChatPush API (`https://api.chatpush.ru` by default).

## 2. Data handled

| Data | Source | Purpose |
| --- | --- | --- |
| ChatPush API token | You — in the client configuration (local mode) or the `Authorization` header of each request (remote mode) | Authenticating requests to the ChatPush API |
| Message content and recipients (text, phone numbers, Telegram usernames or IDs, WhatsApp LIDs, scheduling options) | You or the AI assistant, when a messaging tool is called | Sending the message through ChatPush |
| Files you choose to send (local path, URL or base64 content) | You or the AI assistant, when `send_file` is called | Uploading the file to ChatPush for delivery |
| Webhook URLs and event types, contact names, sub-client names | You or the AI assistant, when the matching tool is called | Managing your ChatPush account |
| API responses (delivery IDs and statuses, balance, account and subscription details, operator data) | The ChatPush API | Showing the result of the tool call |

The server collects **no** analytics, telemetry, crash reports, device identifiers or usage statistics.

## 3. Storage

- **No database, cache or history.** Tool inputs and API responses live in memory only while a request is processed.
- **Local mode:** the token is stored by your MCP client — Claude Desktop keeps settings marked as sensitive in its secure storage; other clients keep it in their configuration file or in a local `.env` file you create.
- **Remote mode:** the token arrives with each request, is used for that request and is never written to disk or logs. The hosted server is stateless and keeps no session data between requests.
- `send_file` reads the file you point to, or downloads it from the URL you give, only to upload it to ChatPush. No copy is kept. The hosted server accepts only file content sent in the request (base64): it never reads files from its own disk or downloads URLs.
- Diagnostic logs go to the process's standard error stream and never contain the token. With `CHATPUSH_DEBUG=1` they include request URLs, which may contain message text and phone numbers.
- Data you send through the server is stored by the ChatPush service as described in the [CHATPUSH LLC Privacy Policy](https://chatpush.ru/jp/privacypolicy).

## 4. Sharing

- The server sends data only to the ChatPush API over HTTPS.
- To deliver messages, the ChatPush service passes message content and recipient identifiers to the channels you select (WhatsApp, Telegram, SMS, VK/OK, MAX).
- If you use `send_file` with a URL (local mode only), the server downloads the file from that URL, so the site hosting it receives that request.
- The AI assistant you use receives tool inputs and results as part of your conversation, governed by that provider's privacy policy.

## 5. Retention

- **Server:** retains nothing after a request completes.
- **ChatPush service:** personal data is retained as described in the [CHATPUSH LLC Privacy Policy](https://chatpush.ru/jp/privacypolicy). Download links created for files sent through channels without native file support are valid for 7 days.
- You can revoke access at any time by rotating or deleting your API token in the ChatPush dashboard.

## 6. Your rights

MCP clients such as Claude ask for confirmation before running tools. Rights of access, rectification, erasure and objection regarding data held by the ChatPush service are described in the [CHATPUSH LLC Privacy Policy](https://chatpush.ru/jp/privacypolicy); to exercise them, contact us at the address below.

## 7. Security

All communication with the ChatPush API uses HTTPS and your bearer token. Keep the token secret — anyone who has it can use your ChatPush account. The hosted server accepts requests only over TLS and validates the `Host` header against its allow-list.

## 8. Contact

CHATPUSH LLC
Email: [support@chatpush.ru](mailto:support@chatpush.ru)
Website: <https://chatpush.ru>
