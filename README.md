# Telegram Akinator Bot

Telegram bot built with clean architecture and powered by `akinator.py` via a Python bridge.

## Environment

Create `.env` with:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
AKINATOR_REGION=en
AKINATOR_CHILD_MODE=false
# optional: absolute path to python executable if auto-detection fails
# PYTHON_BIN=C:\\Python311\\python.exe
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=akinator_bot
```

- `TELEGRAM_BOT_TOKEN` is required.
- `AKINATOR_REGION` is optional (defaults to `en`).
- `AKINATOR_CHILD_MODE` is optional (`true` or `false`, defaults to `false`).
- `PYTHON_BIN` is optional. If omitted, the bot tries `py -3`, then `python3`, then `python`.
- `MONGODB_URI` is optional (defaults to `mongodb://127.0.0.1:27017`).
- `MONGODB_DB_NAME` is optional (defaults to `akinator_bot`).

Install Python dependency once:

```bash
py -3 -m pip install akinator
```

## Run Bot

```bash
npm install
npm run bot:dev
```

Production start:

```bash
npm run bot:start
```

## Troubleshooting

If `/start` does not begin a game and you see `AKINATOR_CLOUDFLARE_BLOCK`, the Akinator website is blocking your runtime IP (Cloudflare 403).

What to do:

- Run the bot from another network or a VPS/datacenter with a clean IP.
- Keep using long polling (`npm run bot:dev`) once connectivity works.

## Bot Flow

- User sends `/start`.
- Bot shows theme selection (Characters / Objects / Animals).
- Bot starts Akinator after selected theme.
- Bot shows answer buttons (Yes / No / I don't know / Probably / Probably not).
- User can use `Back` and `Restart` buttons.
- When progress reaches a guess, bot sends result and offers `Play again`.

## Architecture

```
bot/
	application/
		ports/
		services/
	config/
	domain/
	infrastructure/
		akinator/
	interfaces/
		telegram/
```

- `domain`: core game models and answer options.
- `application`: use-case service and abstraction ports.
- `infrastructure`: Python bridge (`akinator.py`) + Mongo session store.
- `interfaces`: Telegram handlers and inline keyboards.
- `config`: environment validation and defaults.
