# ChatPush MCP — подключить Claude и ИИ-агентов к WhatsApp, Telegram, MAX и SMS

[![CI](https://github.com/ChatPush/mcp-chatpush/actions/workflows/ci.yml/badge.svg)](https://github.com/ChatPush/mcp-chatpush/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/chatpush-mcp-server)](https://www.npmjs.com/package/chatpush-mcp-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Русский** · [English](README.en.md)

Официальный MCP-сервер [ChatPush](https://chatpush.ru/integrations/mcp?utm_source=github&utm_medium=readme&utm_campaign=mcp). Подключите его к Claude, ChatGPT и Codex, Cursor, GitHub Copilot, Gemini CLI или своему ИИ-агенту, и ассистент сам отправит сообщение, файл или рассылку в MAX, WhatsApp\*, Telegram и SMS с номеров вашей компании (файлы — в мессенджеры, по SMS только текст). Достаточно написать ему обычную просьбу: «напомни клиенту о записи завтра в 9:00».

> **English:** official MCP server for [ChatPush](https://chatpush.ru/integrations/mcp?utm_source=github&utm_medium=readme&utm_campaign=mcp) — AI agents (Claude, ChatGPT/Codex, Cursor, GitHub Copilot, Gemini CLI, n8n) send WhatsApp, Telegram, MAX and SMS messages, files and bulk mailings from a business account, with channel cascade and delivery status. Install: `npx -y chatpush-mcp-server` with `CHATPUSH_TOKEN`. Full English docs: [README.en.md](README.en.md). For agents: [AGENTS.md](AGENTS.md), [llms.txt](llms.txt), [skills/chatpush/SKILL.md](skills/chatpush/SKILL.md).

- **С ваших номеров.** Сообщения уходят с подключённых MAX, WhatsApp и Telegram, как из кабинета ChatPush.
- **Каскад каналов.** Не дошло в один мессенджер — уйдёт в следующий, SMS последним.
- **Без двойных отправок.** После сбоя сети сервер не повторяет отправку сам: ассистент сначала проверяет статус.
- **19 инструментов.** Отправка, рассылки, файлы, статусы доставки, подключение мессенджера по QR, вебхуки, субаккаунты.
- **Навык для агентов.** [`skills/chatpush/SKILL.md`](skills/chatpush/SKILL.md): когда и как агенту звать ChatPush, с правилами безопасной отправки.
- **Открытый код.** Лицензия MIT, пакет [`chatpush-mcp-server`](https://www.npmjs.com/package/chatpush-mcp-server) в npm, сервер есть в [официальном каталоге MCP](https://registry.modelcontextprotocol.io) под именем `io.github.ChatPush/whatsapp-telegram-max-sms`.

<a href="https://glama.ai/mcp/servers/@ChatPush/mcp-chatpush"><img width="380" height="200" src="https://glama.ai/mcp/servers/@ChatPush/mcp-chatpush/badge" alt="ChatPush MCP Server на Glama" /></a>

## Содержание

- [Как получить токен](#как-получить-токен)
- [Быстрый старт](#быстрый-старт): [Claude Desktop](#claude-desktop), [Claude Code](#claude-code), [Cursor](#cursor), [VS Code](#vs-code), [ChatGPT и Codex](#chatgpt-и-codex), [Gemini CLI и Copilot](#gemini-cli-и-github-copilot), [другие агенты](#другие-ии-агенты-и-клиенты)
- [Что можно попросить у ассистента](#что-можно-попросить-у-ассистента)
- [Claude + Telegram](#claude--telegram), [Claude + WhatsApp](#claude--whatsapp), [Claude + MAX](#claude--max), [SMS и каскад](#sms-и-каскад-каналов)
- [Инструменты](#инструменты)
- [Удалённый сервер по ссылке](#удалённый-mcp-сервер-по-ссылке)
- [Безопасность](#безопасность) · [Цена](#цена) · [Разработка](#разработка)

## Как получить токен

1. Зарегистрируйтесь на **[chatpush.ru](https://chatpush.ru/customers/sign_up?partner=apimcp&utm_source=github&utm_medium=readme&utm_campaign=mcp)**. Первые 10 дней бесплатно.
2. В личном кабинете откройте раздел **«Интеграции»** (`https://chatpush.ru/front_office/integrations`) и скопируйте API-токен.
3. Подключите мессенджер, с которого будете писать: MAX, WhatsApp или Telegram подключаются в кабинете по QR-коду. WhatsApp и личный аккаунт Telegram можно подключить и через ассистента: попросите «подключи мне WhatsApp», он пришлёт ссылку на страницу с QR-кодом (инструмент `get_messenger_auth_link`).

Токен даёт доступ к отправке с вашего аккаунта. Храните его как пароль и не публикуйте в репозиториях.

## Быстрый старт

### Claude Desktop

Самый простой способ, без Node.js и файлов настроек:

1. Скачайте расширение [`chatpush-mcp-server.mcpb`](https://github.com/ChatPush/mcp-chatpush/releases/latest/download/chatpush-mcp-server.mcpb) (Windows и macOS, всегда последняя версия).
2. Откройте файл и нажмите **Install** («Установить»).
3. Вставьте токен. Claude хранит его как секрет.

Вручную: *Settings → Developer → Edit Config* (`claude_desktop_config.json`):

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

### Claude Code

```bash
claude mcp add chatpush --env CHATPUSH_TOKEN=ваш_токен -- npx -y chatpush-mcp-server
```

Команда подключает сервер к проекту в текущей папке. Чтобы он был доступен во всех проектах, добавьте `--scope user` после `add`.

### Cursor

Добавьте тот же блок `mcpServers` в `~/.cursor/mcp.json`.

### VS Code

`~/.copilot/mcp-config.json`. Проще всего из палитры команд: `Chat: Open Customizations` → `MCP Servers` → `Add Server` → `Global` → `Copilot Global`. Или создайте файл вручную. Он лежит в домашней папке и не попадает в репозиторий проекта:

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

### ChatGPT и Codex

```bash
codex mcp add chatpush --env CHATPUSH_TOKEN=ваш_токен -- npx -y chatpush-mcp-server
```

Приложение ChatGPT для компьютера читает ту же конфигурацию Codex (`~/.codex/config.toml`). ChatGPT в браузере подключает только серверы по ссылке: появится вместе с удалённым сервером. Подробно: [guides/chatgpt-codex](guides/chatgpt-codex/).

### Gemini CLI и GitHub Copilot

```bash
gemini mcp add -s user -e CHATPUSH_TOKEN=ваш_токен chatpush npx -y chatpush-mcp-server
copilot mcp add --env CHATPUSH_TOKEN=ваш_токен chatpush -- npx -y chatpush-mcp-server
```

Подробно: [guides/gemini-cli](guides/gemini-cli/), [guides/github-copilot](guides/github-copilot/).

### Другие ИИ-агенты и клиенты

Подойдёт любой клиент, который запускает MCP-сервер командой (транспорт stdio): команда `npx -y chatpush-mcp-server`, переменная окружения `CHATPUSH_TOKEN`. Нужен Node.js 20 или новее.

### Проверка

Спросите ассистента: **«Какой у меня баланс в ChatPush?»** Если он назвал сумму, всё работает.

Подробные инструкции: [все инструкции](guides/) — Claude + [Telegram](guides/claude-telegram/), [WhatsApp](guides/claude-whatsapp/), [MAX](guides/claude-max/); [ChatGPT и Codex](guides/chatgpt-codex/), [Gemini CLI](guides/gemini-cli/), [GitHub Copilot](guides/github-copilot/), [Cursor и VS Code](guides/cursor-vscode/), [OpenClaw](guides/openclaw/), [n8n](guides/n8n/), [другие клиенты](guides/other-clients/). На сайте: [chatpush.ru/integrations/mcp](https://chatpush.ru/integrations/mcp?utm_source=github&utm_medium=readme&utm_campaign=mcp).

## Что можно попросить у ассистента

| Вы пишете | Что происходит | Инструмент |
| --- | --- | --- |
| «Напиши в WhatsApp +7 999 123-45-67: ваш заказ отправлен» | Сообщение уходит с вашего WhatsApp | `send_message` |
| «Сначала попробуй MAX, если не дойдёт — SMS: ваш код 4821» | Каскад каналов | `send_message` |
| «Напомни клиенту 79991234567 завтра в 9:00 о записи» | Отложенная отправка | `send_message` |
| «Отправь счёт invoice.pdf на номер 79991234567» | Отправка файла | `send_file` |
| «Разошли этот текст по списку номеров» | Массовая рассылка | `send_bulk` |
| «Дошло ли сообщение 94396942?» | Статус доставки простыми словами | `get_delivery_status` |
| «Сколько у меня денег в ChatPush?» | Баланс и подключённые каналы | `get_balance` |
| «Подключи мне WhatsApp» | Ссылка на страницу с QR-кодом | `get_messenger_auth_link` |

## Claude + Telegram

Claude пишет клиентам в Telegram двумя способами:

- **Личный аккаунт Telegram** (канал `tdlib`): сообщение приходит от вашего аккаунта. Получателя можно указать номером телефона, именем пользователя (`@username`) или ID чата. Отрицательный ID — групповой чат.
- **Telegram-бот** (канал `telegram`): сообщение приходит от вашего бота, получатель указывается номером телефона. Бот пишет только тем, кто сам его запустил.

Примеры: «Напиши в Telegram @ivan_petrov: договор готов, отправил на почту», «Отправь в наш рабочий чат отчёт за неделю файлом». Сообщение, доставленное через личный аккаунт, можно удалить у получателя: «удали сообщение 94396942» (`delete_delivery`).

Инструкция по шагам: [guides/claude-telegram](guides/claude-telegram/).

## Claude + WhatsApp

Сообщения уходят с вашего номера WhatsApp, подключённого к ChatPush по QR-коду. Если номер ещё не подключён, попросите Claude: «подключи мне WhatsApp».

Примеры: «Напиши в WhatsApp 79991234567: мастер приедет завтра с 10 до 12», «Отправь клиенту прайс price.pdf в WhatsApp». Доставленное сообщение можно удалить у получателя (`delete_delivery`).

Инструкция по шагам: [guides/claude-whatsapp](guides/claude-whatsapp/).

## Claude + MAX

MAX — российский мессенджер. Через ChatPush ассистент отправляет сообщения в MAX по номеру телефона, отдельно или первым шагом каскада.

Примеры: «Напиши в MAX 79991234567: ваш заказ готов к выдаче», «Сначала MAX, если не дойдёт — WhatsApp, потом SMS: запись на 15:00 подтверждена».

Инструкция по шагам: [guides/claude-max](guides/claude-max/).

## SMS и каскад каналов

`dispatch_routing` — упорядоченный список каналов. ChatPush пробует их по очереди и переходит к следующему, только если через предыдущий сообщение не доставлено. Если список не задан, работает порядок по умолчанию из вашего кабинета.

| Значение | Канал | Получатель |
| --- | --- | --- |
| `max` | MAX | `phone` |
| `whatsapp` | WhatsApp | `phone` или `whatsapp_lid` |
| `tdlib` | Личный аккаунт Telegram | `phone`, `username` или `tdlib_user_id` (отрицательный ID — групповой чат) |
| `telegram` | Telegram-бот | `phone` |
| `notify` | Уведомления VK / OK | `phone` |
| `sms` | SMS | `phone` |

Текст сообщения — до 3500 знаков; если в маршруте есть SMS, до 938 знаков. Подробнее про каскад: [chatpush.ru/blog/kaskad](https://chatpush.ru/blog/kaskad?utm_source=github&utm_medium=readme&utm_campaign=mcp).

## Инструменты

| Инструмент | Что делает |
| --- | --- |
| `send_message` | Текстовое сообщение в MAX, WhatsApp, Telegram (личный аккаунт или бот), SMS, VK/OK: каскад, отложенная отправка, приоритет, ответ на сообщение |
| `send_bulk` | Одно сообщение на много номеров сразу |
| `send_file` | Документ, фото, аудио или видео в MAX, WhatsApp или Telegram: с диска, по ссылке или в base64 (до 100 МБ) |
| `get_delivery_status` | Статус и детали доставки понятными словами |
| `delete_delivery` | Удалить доставленное сообщение WhatsApp или Telegram на всех устройствах получателя |
| `get_phone_info` | Страна, оператор и нормальный формат номера |
| `get_account` | Аккаунт целиком: баланс, маршрут отправки, имена отправителя, подписка, состояние WhatsApp и Telegram |
| `get_balance` | Баланс, ID клиента, каналы маршрута и имена отправителя |
| `get_utm_tags` | UTM-метки для статистики рассылок |
| `get_messenger_auth_link` | Ссылка на страницу с QR-кодом для подключения WhatsApp или личного Telegram |
| `set_chat_client_name` | Переименовать контакт в веб-мессенджере ChatPush |
| `create_webhook` · `get_webhook` · `list_webhooks` · `update_webhook` · `delete_webhook` | Подписать свой сервис на входящие сообщения, статусы доставки и события входа |
| `create_sub_customer` · `list_sub_customers` · `get_sub_customer` | Субаккаунты для партнёров и агентств, у каждого свой токен |

Ответы клиентов приходят в веб-мессенджер ChatPush. Разработчик может получать входящие в свой сервис через вебхуки.

## Удалённый MCP-сервер по ссылке

> **Скоро.** Адрес `mcp.chatpush.ru` ещё не запущен. Пока пользуйтесь расширением для Claude Desktop или запуском через `npx`.

Удалённый сервер нужен платформам, которые подключают MCP по ссылке, и тем, у кого нет Node.js:

```
POST https://mcp.chatpush.ru/mcp
Authorization: Bearer <API-токен ChatPush>
```

- Транспорт: **Streamable HTTP** (протокол MCP 2025-06-18).
- **Токен не хранится на сервере:** он приходит в заголовке запроса и используется только для этого запроса.
- `send_file` на удалённом сервере принимает только `file_base64` (до 14 МБ при стандартном лимите запроса 20 МБ). Файлы с диска и по ссылке — в локальном режиме.

Как развернуть сервер у себя (Docker, переменные окружения): [README.en.md → Deployment](README.en.md#deployment).

## Безопасность

- ИИ-ассистент отправляет **настоящие сообщения настоящим клиентам**. Проверяйте текст и список номеров перед рассылкой.
- Рассылайте только по своей базе и с согласия получателей (ст. 18 закона «О рекламе»).
- Не публикуйте токен. Держите токен в файлах настроек в домашней папке, в Claude Desktop ставьте расширение: токен хранится как секрет.
- В ответах модели токен аккаунта скрыт. Сервер не отправляет сообщение повторно после сбоя сети: сначала проверяется статус.

Политика конфиденциальности: [PRIVACY.md](PRIVACY.md).

## Цена

MCP-сервер бесплатный и открытый. Отправка сообщений оплачивается по вашему тарифу ChatPush: [тарифы на chatpush.ru](https://chatpush.ru/?utm_source=github&utm_medium=readme&utm_campaign=mcp). Первые 10 дней бесплатно.

## Разработка

```bash
npm install
cp .env.example .env     # впишите токен в .env
npm run build
npm run dev              # stdio
npm run dev:http         # удалённый режим, http://localhost:3000/mcp
npm test                 # модульные тесты
```

Поведение сервера, переменные окружения и скрипты описаны в [README.en.md](README.en.md#behaviour). Для ИИ-агентов: [AGENTS.md](AGENTS.md), [llms.txt](llms.txt) и навык [skills/chatpush/SKILL.md](skills/chatpush/SKILL.md).

## Лицензия

[MIT](LICENSE)

---

\*WhatsApp принадлежит компании Meta, признанной экстремистской организацией и запрещённой в РФ.
