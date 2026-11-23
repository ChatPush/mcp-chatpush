# OpenClaw + ChatPush MCP: агент пишет клиентам в MAX, WhatsApp\*, Telegram и SMS

У OpenClaw есть свои каналы, чтобы общаться с самим агентом. ChatPush нужен для другого: агент отправляет сообщения **вашим клиентам** с номеров компании, в том числе в MAX, которого среди каналов OpenClaw нет, и досылает SMS каскадом.

## Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).
3. Подключите мессенджер, с которого будете писать: MAX, WhatsApp\* или Telegram — в кабинете по QR-коду.

## Подключение

OpenClaw сохраняет MCP-серверы из командной строки при остановленном Gateway. Если Gateway запущен в окне терминала, остановите его клавишами Ctrl+C и потом запустите тем же способом.

```bash
openclaw gateway stop
openclaw mcp add chatpush --command npx --arg -y --arg chatpush-mcp-server --env CHATPUSH_TOKEN=ваш_токен
openclaw mcp doctor chatpush --probe
openclaw gateway start
```

`doctor --probe` должен показать, что сервер запустился и отдал инструменты. Проверка в чате: «Какой у меня баланс в ChatPush?».

## Hermes Agent

Блок в `~/.hermes/config.yaml`, токен в `~/.hermes/.env`:

```yaml
mcp_servers:
  chatpush:
    command: npx
    args: ["-y", "chatpush-mcp-server"]
    env:
      CHATPUSH_TOKEN: "${CHATPUSH_TOKEN}"
```

Проверка: `hermes mcp test chatpush`, в чате — `/reload-mcp`.

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/openclaw](https://chatpush.ru/integrations/mcp/openclaw?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../) · описание сервера: [README](../../README.md)

\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
