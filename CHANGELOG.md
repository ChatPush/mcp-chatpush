# Changelog

## 1.0.0 — unreleased

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
