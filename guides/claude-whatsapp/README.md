# Claude + WhatsApp\*: как подключить Claude к WhatsApp и отправлять сообщения клиентам

MCP-сервер ChatPush даёт Claude (Desktop или Code) отправку сообщений и файлов с номера WhatsApp вашей компании. Достаточно попросить: «отправь клиенту прайс в WhatsApp».

## Шаг 1. Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).

## Шаг 2. Подключите номер WhatsApp

В кабинете ChatPush по QR-коду или прямо из Claude: «подключи мне WhatsApp». Claude пришлёт ссылку на страницу с QR-кодом. На телефоне откройте WhatsApp → *Настройки → Связанные устройства → Привязка устройства* и отсканируйте код.

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
| «Напиши в WhatsApp 79991234567: мастер приедет завтра с 10 до 12» | Сообщение с вашего номера |
| «Отправь клиенту price.pdf в WhatsApp» | Файл: документ, фото, аудио или видео |
| «Напомни клиенту завтра в 9:00 о записи» | Отложенная отправка |
| «Попробуй WhatsApp, если не дойдёт — SMS» | Каскад каналов |
| «Дошло ли сообщение 94396942?» | Статус доставки |
| «Удали сообщение 94396942» | Доставленное сообщение исчезнет у получателя |

## Перед рассылкой

Claude отправляет настоящие сообщения настоящим людям. Проверяйте текст и список номеров, пишите только тем, кто дал согласие (ст. 18 закона «О рекламе»), и не публикуйте токен.

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/claude](https://chatpush.ru/integrations/mcp/claude?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../)
- Описание сервера и 19 инструментов: [README](../../README.md)


\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
