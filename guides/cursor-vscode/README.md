# Cursor и VS Code: MCP-сервер для отправки сообщений в WhatsApp\*, Telegram, MAX и SMS

Подключите ChatPush к Cursor или VS Code, и агент в редакторе сможет отправить уведомление команде или клиенту: о выкладке, об инциденте, тестовый код подтверждения.

## Шаг 1. Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).

## Шаг 2. Конфиг редактора

Нужен Node.js 20 или новее.

**Cursor** — `~/.cursor/mcp.json`:

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

**VS Code** — `~/.copilot/mcp-config.json`. Проще всего из палитры команд: `Chat: Open Customizations` → `MCP Servers` → `Add Server` → `Global` → `Copilot Global`. Или создайте файл вручную. Он лежит в домашней папке и не попадает в репозиторий проекта:

```json
{
  "mcpServers": {
    "chatpush": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chatpush-mcp-server"],
      "env": { "CHATPUSH_TOKEN": "ваш_токен" },
      "tools": ["*"]
    }
  }
}
```

Старый формат `.vscode/mcp.json` с `servers` и `inputs` VS Code поддерживает до февраля 2027 года ([документация VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)).

Другие редакторы и агенты, которые запускают MCP-серверы командой (stdio): `npx -y chatpush-mcp-server` и переменная `CHATPUSH_TOKEN`.

## Шаг 3. Проверка

Спросите агента: «Какой у меня баланс в ChatPush?».

## Что просить у агента

| Просьба | Инструмент |
| --- | --- |
| «Напиши в Telegram-чат команды: релиз 2.4 выкачен» | `send_message` |
| «Отправь на 79991234567 тестовый код 4821 по SMS» | `send_message` |
| «Подпиши https://example.com/hooks на входящие сообщения» | `create_webhook` |
| «Какой оператор у номера 79991234567?» | `get_phone_info` |

Не храните токен в репозитории: для Cursor и VS Code используйте файлы настроек в домашней папке.

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/cursor](https://chatpush.ru/integrations/mcp/cursor?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../)
- Описание сервера и 19 инструментов: [README](../../README.md)


\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
