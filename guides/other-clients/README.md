# MCP-клиенты: как подключить ChatPush в LM Studio, Qwen Code, Goose, Zed, Jan, Cherry Studio и других

Любой клиент, который запускает MCP-сервер командой (stdio), подключает ChatPush одинаково:

- команда: `npx`
- аргументы: `-y chatpush-mcp-server`
- переменная окружения: `CHATPUSH_TOKEN=ваш_токен`
- нужен Node.js 20 или новее

Большинство клиентов принимают такой блок `mcpServers`:

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

## Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).
3. Подключите мессенджер, с которого будете писать: MAX, WhatsApp\* или Telegram — в кабинете по QR-коду.

## Где лежат настройки

Каталог с готовым конфигом для каждого клиента и ссылкой на его документацию — на странице [chatpush.ru/integrations/mcp/clients](https://chatpush.ru/integrations/mcp/clients?utm_source=github&utm_medium=guide&utm_campaign=mcp): Qwen Code, Kimi Code, Grok Build, Mistral Vibe, Goose, Warp, Zed, Devin Desktop, LM Studio, Jan, Cherry Studio, Chatbox, Msty, Flowise, Langflow.

**DeepSeek, Ollama и другие модели** сами MCP-серверы не подключают. Подключите модель в клиенте, который умеет MCP (Cherry Studio, Chatbox, LM Studio, Jan), и добавьте туда ChatPush. Слабые локальные модели могут не вызывать инструменты: выбирайте модели с поддержкой tool use.

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/clients](https://chatpush.ru/integrations/mcp/clients?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../) · описание сервера: [README](../../README.md)

\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
