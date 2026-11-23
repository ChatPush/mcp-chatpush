# n8n + ChatPush MCP: AI Agent отправляет сообщения в MAX, WhatsApp\*, Telegram и SMS

Встроенный узел MCP Client Tool в n8n подключает серверы только по ссылке (HTTP Streamable, SSE), а удалённый адрес ChatPush ещё не запущен. Сегодня рабочий путь — self-hosted n8n с community-узлом [`n8n-nodes-mcp`](https://github.com/nerding-io/n8n-nodes-mcp), который запускает сервер командой. В n8n Cloud непроверенные community-узлы недоступны.

## Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).
3. Подключите мессенджер, с которого будете писать: MAX, WhatsApp\* или Telegram — в кабинете по QR-коду.

## Подключение

1. **Узел.** *Settings → Community Nodes → Install* → `n8n-nodes-mcp`. В режиме очередей ставится вручную в `~/.n8n/nodes` (`npm i n8n-nodes-mcp`) с перезапуском n8n.
2. **Credential** типа *MCP Client (STDIO) API*:

   ```
   Command:       npx
   Arguments:     -y chatpush-mcp-server
   Environments:  CHATPUSH_TOKEN=ваш_токен
   ```

   В Docker токен можно передать переменной контейнера `MCP_CHATPUSH_TOKEN`: узел передаст её серверу без префикса `MCP_`. Переменная `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` нужна только в n8n 1.79–1.84.
3. **Агент.** К узлу AI Agent подключите два узла MCP Client: *List Tools* и *Execute Tool* (имя инструмента и параметры заполняет модель).

В System Message агента пропишите правило: перед рассылкой показывать текст и число получателей и ждать подтверждения; после ошибки не отправлять повторно, а проверять `get_delivery_status`.

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/n8n](https://chatpush.ru/integrations/mcp/n8n?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../) · описание сервера: [README](../../README.md)

\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
