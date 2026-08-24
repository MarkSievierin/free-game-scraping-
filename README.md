# Epic Games Free Games Telegram Bot

Node.js script that reads Epic Games Store free promotions from its catalog JSON endpoint and sends games with a `-100%` discount to Telegram.

## Structure

- `index.js` - application entry point
- `src/services` - business logic and integrations with external sources
- `src/clients` - external API clients
- `src/dto` - request DTOs for transport layer input

## Setup

1. Install dependencies:

```bash
npm install
```

2. Fill in `.env`:

```env
APP_TYPE=stage
MAX_GAMES=
ENABLE_EPIC=true
ENABLE_STEAM=false
EPIC_LOCALE=ru-RU
EPIC_COUNTRY=UA
EPIC_ALLOW_COUNTRIES=UA

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=free_games
MYSQL_USER=free_games_bot
MYSQL_PASSWORD=your_mysql_password

BOT_TOKEN=your_telegram_bot_token
CHAT_ID=your_chat_id

BOT_TOKEN_DEV=your_stage_telegram_bot_token
CHAT_ID_DEV=your_stage_chat_id
TELEGRAM_CHANNEL_USERNAME=free_games7722
```

`ENABLE_EPIC` and `ENABLE_STEAM` control which source flows run. At least one of them must be `true`.
`APP_TYPE=prod` writes `prod` records, every other value writes `stage` records. Records are unique by `server_type + uuid`.

3. Initialize MySQL database and run migrations:

```bash
npm run setup:db
```

The bot stores Telegram `message_id` values for sent games. On later runs it removes fresh stale posts, or edits older posts to mark the offer as ended.

## Run

Run the bot:

```bash
npm start
```

For cron:

```bash
cd /root/free-game-scraping-stage && npm start
```

## Remote MySQL Access

Keep MySQL bound to the server and connect from a local machine through SSH:

```bash
ssh -N -L 3307:127.0.0.1:3306 root@SERVER_IP
```

Then connect DBeaver to:

```text
Host: 127.0.0.1
Port: 3307
Database: free_games
User: free_games_bot
Password: MYSQL_PASSWORD
```
