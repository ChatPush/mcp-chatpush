# ChatGPT и Codex + ChatPush MCP: сообщения клиентам в MAX, WhatsApp\*, Telegram и SMS

Приложение ChatGPT для компьютера и Codex (CLI, расширение для редактора) подключают локальные MCP-серверы. С сервером ChatPush они отправляют сообщения, файлы и рассылки клиентам с номеров вашей компании. ChatGPT в браузере пока подключает только серверы по ссылке с входом через OAuth: для ChatPush это появится позже.

## Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).
3. Подключите мессенджер, с которого будете писать: MAX, WhatsApp\* или Telegram — в кабинете по QR-коду.

## Подключение

**Codex CLI** (нужен Node.js 20+), одной командой:

```bash
codex mcp add chatpush --env CHATPUSH_TOKEN=ваш_токен -- npx -y chatpush-mcp-server
```

Команда записывает сервер в `~/.codex/config.toml`. Проверка: `codex mcp list` — в строке chatpush статус `enabled`.

**Приложение ChatGPT для компьютера** использует ту же конфигурацию Codex: *Settings → MCP servers → Add server → STDIO*, команда `npx`, аргументы `-y chatpush-mcp-server`, переменная `CHATPUSH_TOKEN`. Сохраните и перезапустите приложение. Или добавьте в `~/.codex/config.toml` вручную:

```toml
[mcp_servers.chatpush]
command = "npx"
args = ["-y", "chatpush-mcp-server"]

[mcp_servers.chatpush.env]
CHATPUSH_TOKEN = "ваш_токен"
```

Проверка: спросите «Какой у меня баланс в ChatPush?».

## Что просить

| Просьба | Инструмент |
| --- | --- |
| «Напиши в MAX 79991234567: заказ готов к выдаче» | `send_message` |
| «Сначала WhatsApp, если не дойдёт — SMS: запись на 15:00 подтверждена» | `send_message` с каскадом |
| «Отправь клиенту счёт invoice.pdf в Telegram» | `send_file` (MAX, WhatsApp, Telegram) |
| «Дошло ли сообщение 94396942?» | `get_delivery_status` |

Перед массовой рассылкой агент должен показать текст и число получателей и дождаться вашего «да». Пишите только тем, кто дал согласие (ст. 18 закона «О рекламе»).

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/chatgpt](https://chatpush.ru/integrations/mcp/chatgpt?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../) · описание сервера: [README](../../README.md)

\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
