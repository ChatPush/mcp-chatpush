# Gemini CLI и Antigravity CLI + ChatPush MCP: сообщения в MAX, WhatsApp\*, Telegram и SMS

Gemini CLI и Antigravity CLI подключают локальные MCP-серверы. С 18 июня 2026 года бесплатные аккаунты и подписки Google AI Pro и Ultra переведены с Gemini CLI на Antigravity CLI ([блог Google](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)). Приложение Gemini подключает только серверы по ссылке и только в США ([справка Google](https://support.google.com/gemini/answer/17209137)).

## Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).
3. Подключите мессенджер, с которого будете писать: MAX, WhatsApp\* или Telegram — в кабинете по QR-коду.

## Gemini CLI

```bash
gemini mcp add -s user -e CHATPUSH_TOKEN=ваш_токен chatpush npx -y chatpush-mcp-server
```

Сервер записывается в `~/.gemini/settings.json`. В папке, которой Gemini CLI ещё не доверяет, сервер будет в статусе Disabled: при первом запуске в папке выберите *Trust folder* или откройте `/permissions` внутри Gemini CLI. Проверка: `/mcp` в сессии.

## Antigravity CLI

Файл `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "chatpush": {
      "command": "npx",
      "args": ["-y", "chatpush-mcp-server"],
      "env": { "CHATPUSH_TOKEN": "ваш_токен" }
    }
  }
}
```

Если ChatPush уже был подключён в Gemini CLI, перенесите настройки командой `agy plugin import gemini`. Проверка: `/mcp`.

## Что просить

| Просьба | Инструмент |
| --- | --- |
| «Напиши в MAX 79991234567: заказ готов к выдаче» | `send_message` |
| «Сначала WhatsApp, если не дойдёт — SMS: запись на 15:00 подтверждена» | `send_message` с каскадом |
| «Отправь клиенту счёт invoice.pdf в Telegram» | `send_file` (MAX, WhatsApp, Telegram) |
| «Дошло ли сообщение 94396942?» | `get_delivery_status` |

Перед массовой рассылкой агент должен показать текст и число получателей и дождаться вашего «да». Пишите только тем, кто дал согласие (ст. 18 закона «О рекламе»).

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/gemini](https://chatpush.ru/integrations/mcp/gemini?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../) · описание сервера: [README](../../README.md)

\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
