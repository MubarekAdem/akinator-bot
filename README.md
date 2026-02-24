# Telegram Akinator Bot

Telegram bot built with clean architecture and powered by `akinator.py` via a Python bridge.

## Environment

Create `.env` with:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
AKINATOR_REGION=en
AKINATOR_CHILD_MODE=false
AKINATOR_TRANSLATE_TO_AMHARIC=true
# optional: absolute path to python executable if auto-detection fails
# PYTHON_BIN=C:\\Python311\\python.exe
# optional: remote python bridge URL (required for Vercel compatibility)
# AKINATOR_BRIDGE_URL=https://your-python-bridge.onrender.com
# required for webhook mode (Vercel/serverless)
# TELEGRAM_WEBHOOK_URL=https://your-domain.vercel.app/api/telegram-webhook
# optional but recommended for webhook security
# TELEGRAM_WEBHOOK_SECRET=your_long_random_secret
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=akinator_bot
```

- `TELEGRAM_BOT_TOKEN` is required.
- `AKINATOR_REGION` is optional (defaults to `en`).
- `AKINATOR_CHILD_MODE` is optional (`true` or `false`, defaults to `false`).
- `AKINATOR_TRANSLATE_TO_AMHARIC` is optional (`true` enables Amharic translation of game questions).
- `PYTHON_BIN` is optional. If omitted, the bot tries `py -3`, then `python3`, then `python`.
- `AKINATOR_BRIDGE_URL` is optional. When set, Node calls external Python bridge over HTTP (`/bridge`) and does not spawn local Python.
- `TELEGRAM_WEBHOOK_URL` is required only for webhook mode.
- `TELEGRAM_WEBHOOK_SECRET` is optional but recommended for webhook mode.
- `MONGODB_URI` is optional (defaults to `mongodb://127.0.0.1:27017`).
- `MONGODB_DB_NAME` is optional (defaults to `akinator_bot`).

Install Python dependency once:

```bash
py -3 -m pip install akinator
```

For bridge server dependencies (FastAPI):

```bash
py -3 -m pip install -r requirements.txt
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

Run local Python bridge server:

```bash
npm run python:bridge
```

Fallback basic HTTP server (without FastAPI):

```bash
npm run python:bridge:basic
```

Webhook registration (for Vercel/serverless mode):

```bash
npm run bot:webhook:set
```

Then deploy Next.js app and keep webhook endpoint at:

`/api/telegram-webhook`

## Vercel-Compatible Setup

1. Deploy Python bridge server (`bot/infrastructure/akinator/python_bridge_fastapi.py`) on a Python host (Render/Railway/Fly/VM).
2. Set `AKINATOR_BRIDGE_URL` in Vercel to that service base URL (example: `https://my-bridge.onrender.com`).
3. Deploy this Next.js app to Vercel.
4. Set `TELEGRAM_WEBHOOK_URL=https://<your-vercel-domain>/api/telegram-webhook`.
5. Run `npm run bot:webhook:set` once to register Telegram webhook.

## Troubleshooting

If `/start` does not begin a game and you see `AKINATOR_CLOUDFLARE_BLOCK`, the Akinator website is blocking your runtime IP (Cloudflare 403).

What to do:

- Run the bot from another network or a VPS/datacenter with a clean IP.
- Keep using long polling (`npm run bot:dev`) once connectivity works.

## Bot Flow

- User sends `/start`.
- Bot asks user to choose language (English or Amharic).
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
