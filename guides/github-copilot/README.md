# GitHub Copilot + ChatPush MCP: сообщения в MAX, WhatsApp\*, Telegram и SMS из VS Code, Copilot CLI и JetBrains

GitHub Copilot в режиме агента подключает локальные MCP-серверы во всех тарифах, включая бесплатный. Microsoft Copilot (приложение для всех) свои серверы не подключает. Copilot Studio подключает серверы по ссылке: для ChatPush это появится вместе с удалённым сервером.

## Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).
3. Подключите мессенджер, с которого будете писать: MAX, WhatsApp\* или Telegram — в кабинете по QR-коду.

## Copilot CLI и VS Code

Обе программы читают один файл `~/.copilot/mcp-config.json`. Одной командой:

```bash
copilot mcp add --env CHATPUSH_TOKEN=ваш_токен chatpush -- npx -y chatpush-mcp-server
```

Или вручную:

```json
{
  "mcpServers": {
    "chatpush": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "chatpush-mcp-server"],
      "env": { "CHATPUSH_TOKEN": "ваш_токен" },
      "tools": ["*"]
    }
  }
}
```

В VS Code то же самое из палитры команд: `Chat: Open Customizations` → `MCP Servers` → `Add Server` → `Global` → `Copilot Global`. Старый файл `.vscode/mcp.json` VS Code поддерживает до февраля 2027 года.

## JetBrains и Visual Studio

- **JetBrains**: чат Copilot → режим Agent → значок инструментов → *Add MCP Tools*, в открывшийся `mcp.json` добавьте сервер с командой `npx -y chatpush-mcp-server` и переменной `CHATPUSH_TOKEN`.
- **Visual Studio 17.14+**: *View → GitHub Copilot Chat*, добавьте сервер типа stdio с той же командой.

В Copilot Business и Enterprise подключение MCP включает администратор организации (политика «MCP servers in Copilot»).

## Что просить

| Просьба | Инструмент |
| --- | --- |
| «Напиши в MAX 79991234567: заказ готов к выдаче» | `send_message` |
| «Сначала WhatsApp, если не дойдёт — SMS: запись на 15:00 подтверждена» | `send_message` с каскадом |
| «Отправь клиенту счёт invoice.pdf в Telegram» | `send_file` (MAX, WhatsApp, Telegram) |
| «Дошло ли сообщение 94396942?» | `get_delivery_status` |

Перед массовой рассылкой агент должен показать текст и число получателей и дождаться вашего «да». Пишите только тем, кто дал согласие (ст. 18 закона «О рекламе»).

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/copilot](https://chatpush.ru/integrations/mcp/copilot?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../) · описание сервера: [README](../../README.md)

\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
