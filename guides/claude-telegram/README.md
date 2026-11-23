# Claude + Telegram: как подключить Claude к Telegram и писать клиентам

После подключения MCP-сервера ChatPush Claude (Desktop или Code) отправляет сообщения и файлы в Telegram обычной просьбой в чате: «напиши @ivan_petrov, что договор готов». Сообщения уходят с вашего Telegram-аккаунта или от вашего бота.

## Шаг 1. Токен ChatPush

1. Зарегистрируйтесь на [chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=guide&utm_campaign=mcp), первые 10 дней бесплатно.
2. Скопируйте API-токен в кабинете: раздел «Интеграции» (`https://chatpush.ru/front_office/integrations`).

## Шаг 2. Подключите Telegram в ChatPush

- **Личный аккаунт.** В кабинете ChatPush по QR-коду или прямо из Claude: «подключи мне Telegram». Claude пришлёт ссылку на страницу с QR-кодом, отсканируйте его в Telegram: *Настройки → Устройства → Подключить устройство*.
- **Бот.** Подключается в кабинете ChatPush. Бот пишет только тем, кто сам его запустил.

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
| «Напиши в Telegram @ivan_petrov: договор готов» | Сообщение от вашего личного аккаунта по имени пользователя |
| «Отправь в Telegram 79991234567: заказ передан в доставку» | Сообщение по номеру телефона |
| «Отправь в наш рабочий чат отчёт report.pdf» | Файл в групповой чат через личный аккаунт (по ID чата, отрицательный ID — группа) |
| «Напиши через бота всем из списка: завтра вебинар в 12:00» | Рассылка от Telegram-бота |
| «Удали сообщение 94396942» | Доставленное сообщение исчезнет у получателя |

## Личный аккаунт или бот

| | Личный аккаунт (`tdlib`) | Telegram-бот (`telegram`) |
| --- | --- | --- |
| От кого приходит | От вашего аккаунта | От вашего бота |
| Кому можно написать | По номеру, `@username` или ID чата, в том числе в группу | По номеру телефона тем, кто запустил бота |
| Удалить отправленное | Можно | — |

## Перед рассылкой

Claude отправляет настоящие сообщения настоящим людям. Проверяйте текст и список номеров, пишите только тем, кто дал согласие (ст. 18 закона «О рекламе»), и не публикуйте токен.

## Ссылки

- Подробно на сайте: [chatpush.ru/integrations/mcp/claude](https://chatpush.ru/integrations/mcp/claude?utm_source=github&utm_medium=guide&utm_campaign=mcp)
- Все инструкции: [guides](../)
- Описание сервера и 19 инструментов: [README](../../README.md)
