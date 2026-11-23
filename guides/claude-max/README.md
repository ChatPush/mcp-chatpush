# Claude + MAX: как подключить Claude к мессенджеру MAX

MAX — российский мессенджер. Через MCP-сервер ChatPush Claude (Desktop или Code) отправляет клиентам сообщения в MAX по номеру телефона, отдельно или первым шагом каскада MAX → WhatsApp\* → Telegram → SMS.

## Шаг 1. Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).

## Шаг 2. Подключите MAX в ChatPush

Подключите мессенджер в кабинете ChatPush. Проверить, какие каналы подключены, можно вопросом к Claude: «какие мессенджеры подключены в ChatPush?».

## Шаг 3. Подключите ChatPush к Claude

**Claude Desktop** (Windows, macOS): скачайте расширение [`chatpush-mcp-server.mcpb`](https://github.com/ChatPush/mcp-chatpush/releases/latest/download/chatpush-mcp-server.mcpb), откройте файл, нажмите Install («Установить») и вставьте токен.

**Claude Code**, одной командой в терминале (нужен Node.js 20+):

```bash
claude mcp add chatpush --env CHATPUSH_TOKEN=ваш_токен -- npx -y chatpush-mcp-server
```

Проверка: спросите «Какой у меня баланс в ChatPush?». Если Claude назвал сумму, всё подключено.

## Что просить у Claude

| Просьба | Что произойдёт |
| --- | --- |
| «Напиши в MAX 79991234567: ваш заказ готов к выдаче» | Сообщение в MAX по номеру |
| «Сначала MAX, если не дойдёт — WhatsApp, потом SMS: запись на 15:00 подтверждена» | Каскад каналов |
| «Разошли в MAX по списку номеров: в субботу работаем до 16:00» | Рассылка |
| «Дошло ли сообщение 94396942?» | Статус доставки |

## Каскад каналов

Если клиент не получил сообщение в MAX, ChatPush сам отправит его в следующий канал из списка. SMS ставьте последним. Как это работает: [chatpush.ru/blog/kaskad](https://chatpush.ru/blog/kaskad?utm_source=github&utm_medium=guide&utm_campaign=mcp).

## Перед рассылкой

Claude отправляет настоящие сообщения настоящим людям. Проверяйте текст и список номеров, пишите только тем, кто дал согласие (ст. 18 закона «О рекламе»), и не публикуйте токен.

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/claude](https://chatpush.ru/integrations/mcp/claude?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../)
- Описание сервера и 19 инструментов: [README](../../README.md)


\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
