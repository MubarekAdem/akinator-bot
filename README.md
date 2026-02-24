# Telegram Akinator Bot (FastAPI Only)

This project now runs as a Python/FastAPI-only Telegram bot.

## Environment

Create `.env` with:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
AKINATOR_REGION=en
AKINATOR_CHILD_MODE=false
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=akinator_bot
# optional but recommended for webhook security
TELEGRAM_WEBHOOK_SECRET=your_long_random_secret
```

## Install

```bash
py -3 -m pip install -r requirements.txt
```

## Run FastAPI App

From project root:

```bash
py -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Health check:

```bash
http://127.0.0.1:8000/health
```

## Register Telegram Webhook

Use your deployed URL:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<your-domain>/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```

Webhook endpoint in this app:

`/telegram/webhook`

## FastAPI Endpoints

- `GET /health`
- `POST /bridge`
- `POST /telegram/webhook`

## Notes

- Bot flow includes language choice (English/Amharic), theme selection, answer buttons, back, and restart.
- Akinator game engine is executed via `bot/infrastructure/akinator/python_client.py`.
