import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Literal

import requests
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel
from pymongo import MongoClient


SCRIPT_PATH = Path(__file__).resolve().parent.parent / "bot" / "infrastructure" / "akinator" / "python_client.py"

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
AKINATOR_REGION = os.getenv("AKINATOR_REGION", "en").strip() or "en"
AKINATOR_CHILD_MODE = os.getenv("AKINATOR_CHILD_MODE", "false").strip().lower() == "true"
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017").strip()
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "akinator_bot").strip() or "akinator_bot"
TELEGRAM_WEBHOOK_URL = os.getenv("TELEGRAM_WEBHOOK_URL", "").strip()
TELEGRAM_WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()

if not TOKEN:
    raise RuntimeError("Missing TELEGRAM_BOT_TOKEN")

mongo = MongoClient(MONGODB_URI)
db = mongo[MONGODB_DB_NAME]
sessions = db["game_sessions"]
chat_prefs = db["chat_prefs"]

API_URL = f"https://api.telegram.org/bot{TOKEN}"

answer_map = {
    "yes": "yes",
    "no": "no",
    "dont_know": "i don't know",
    "probably": "probably",
    "probably_not": "probably not",
}

theme_map = {
    "characters": "c",
    "animals": "a",
    "objects": "o",
}


class BridgeRequest(BaseModel):
    action: Literal["start", "answer", "back"]
    payload: Dict[str, Any]


app = FastAPI(title="Akinator FastAPI Bot", version="1.0.0")


def configure_webhook_from_env() -> None:
    if not TELEGRAM_WEBHOOK_URL:
        return

    payload: Dict[str, Any] = {
        "url": TELEGRAM_WEBHOOK_URL,
        "allowed_updates": ["message", "callback_query"],
    }

    if TELEGRAM_WEBHOOK_SECRET:
        payload["secret_token"] = TELEGRAM_WEBHOOK_SECRET

    response = telegram("setWebhook", payload)
    if not response.get("ok"):
        description = response.get("description") or "Unknown setWebhook error"
        raise RuntimeError(f"Failed to configure webhook: {description}")


def run_bridge(action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    process = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), action],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
    )

    if process.returncode != 0:
        raise RuntimeError(process.stderr.strip() or "Python bridge failed")

    stdout = process.stdout.strip()
    if not stdout:
        raise RuntimeError("AKINATOR_PYTHON_EMPTY_OUTPUT")

    parsed = json.loads(stdout)
    if not parsed.get("ok"):
        code = parsed.get("errorCode") or "AKINATOR_PYTHON_ERROR"
        message = (parsed.get("errorMessage") or "").strip()
        raise RuntimeError(f"{code}:{message}" if message else code)

    return parsed


def telegram(method: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    response = requests.post(f"{API_URL}/{method}", json=payload, timeout=20)
    response.raise_for_status()
    return response.json()


def translate_to_amharic(text: str, enabled: bool) -> str:
    if not enabled or not text.strip():
        return text

    try:
        url = "https://api.mymemory.translated.net/get"
        response = requests.get(
            url,
            params={"q": text, "langpair": "en|am"},
            timeout=8,
        )
        response.raise_for_status()
        body = response.json()
        translated = (((body or {}).get("responseData") or {}).get("translatedText") or "").strip()
        return translated or text
    except Exception:
        return text


def language_keyboard() -> Dict[str, Any]:
    return {
        "inline_keyboard": [
            [{"text": "🇺🇸 English", "callback_data": "aki:language:en"}],
            [{"text": "🇪🇹 አማርኛ", "callback_data": "aki:language:am"}],
        ]
    }


def theme_keyboard(lang: str) -> Dict[str, Any]:
    if lang == "am":
        return {
            "inline_keyboard": [
                [{"text": "🧑 ባህሪያት", "callback_data": "aki:theme:characters"}],
                [{"text": "📦 እቃዎች", "callback_data": "aki:theme:objects"}],
                [{"text": "🐾 እንስሳት", "callback_data": "aki:theme:animals"}],
            ]
        }

    return {
        "inline_keyboard": [
            [{"text": "🧑 Characters", "callback_data": "aki:theme:characters"}],
            [{"text": "📦 Objects", "callback_data": "aki:theme:objects"}],
            [{"text": "🐾 Animals", "callback_data": "aki:theme:animals"}],
        ]
    }


def game_keyboard(lang: str) -> Dict[str, Any]:
    if lang == "am":
        return {
            "inline_keyboard": [
                [{"text": "✅ አዎ", "callback_data": "aki:answer:yes"}],
                [{"text": "❌ አይ", "callback_data": "aki:answer:no"}],
                [{"text": "🤷 አላውቅም", "callback_data": "aki:answer:dont_know"}],
                [{"text": "👍 ምናልባት", "callback_data": "aki:answer:probably"}],
                [{"text": "👎 ምናልባት አይ", "callback_data": "aki:answer:probably_not"}],
                [
                    {"text": "↩️ ተመለስ", "callback_data": "aki:back"},
                    {"text": "🔁 እንደገና ጀምር", "callback_data": "aki:restart"},
                ],
            ]
        }

    return {
        "inline_keyboard": [
            [{"text": "✅ Yes", "callback_data": "aki:answer:yes"}],
            [{"text": "❌ No", "callback_data": "aki:answer:no"}],
            [{"text": "🤷 I don't know", "callback_data": "aki:answer:dont_know"}],
            [{"text": "👍 Probably", "callback_data": "aki:answer:probably"}],
            [{"text": "👎 Probably not", "callback_data": "aki:answer:probably_not"}],
            [
                {"text": "↩️ Back", "callback_data": "aki:back"},
                {"text": "🔁 Restart", "callback_data": "aki:restart"},
            ],
        ]
    }


def win_keyboard(lang: str) -> Dict[str, Any]:
    label = "🔁 ደግሞ ተጫወት" if lang == "am" else "🔁 Play again"
    return {"inline_keyboard": [[{"text": label, "callback_data": "aki:restart"}]]}


def get_lang(chat_id: int) -> str:
    pref = chat_prefs.find_one({"chatId": chat_id})
    return (pref or {}).get("language") or "en"


def set_lang(chat_id: int, lang: str) -> None:
    chat_prefs.update_one({"chatId": chat_id}, {"$set": {"language": lang}}, upsert=True)


def ask_language(chat_id: int) -> None:
    telegram(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": "Choose your language / ቋንቋዎን ይምረጡ:",
            "reply_markup": language_keyboard(),
        },
    )


def ask_theme(chat_id: int, lang: str) -> None:
    text = "Choose a game theme before we start:" if lang == "en" else "ከመጀመር በፊት የጨዋታ አይነት ይምረጡ:"
    telegram("sendMessage", {"chat_id": chat_id, "text": text, "reply_markup": theme_keyboard(lang)})


def render_question(chat_id: int, lang: str, question: str, progress: float) -> None:
    question_text = translate_to_amharic(question, lang == "am")
    label = "Progress" if lang == "en" else "እድገት"
    text = f"🤔 {question_text}\n\n{label}: {progress:.1f}%"
    telegram("sendMessage", {"chat_id": chat_id, "text": text, "reply_markup": game_keyboard(lang)})


def render_guess(chat_id: int, lang: str, name: str, description: str, photo_url: str) -> None:
    label = "I guess" if lang == "en" else "ግምቴ"
    text = f"🎯 {label}: *{name}*\n\n{description}"
    if photo_url:
        telegram(
            "sendPhoto",
            {
                "chat_id": chat_id,
                "photo": photo_url,
                "caption": text,
                "parse_mode": "Markdown",
                "reply_markup": win_keyboard(lang),
            },
        )
        return

    telegram(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "reply_markup": win_keyboard(lang),
        },
    )


def parse_action(data: str) -> Dict[str, str] | None:
    if not data.startswith("aki:"):
        return None

    parts = data.split(":")
    if len(parts) < 2:
        return None

    action_type = parts[1]
    value = parts[2] if len(parts) > 2 else ""
    return {"type": action_type, "value": value}


def handle_start(chat_id: int) -> None:
    sessions.delete_one({"chatId": chat_id})
    ask_language(chat_id)


def handle_theme(chat_id: int, lang: str, theme_id: str) -> None:
    result = run_bridge(
        "start",
        {
            "region": AKINATOR_REGION,
            "childMode": AKINATOR_CHILD_MODE,
            "theme": theme_map.get(theme_id, "c"),
        },
    )

    state = result.get("state") or {}
    engine_state = result.get("engineState") or {}

    sessions.update_one(
        {"chatId": chat_id},
        {
            "$set": {
                "chatId": chat_id,
                "theme": theme_id,
                "engineState": engine_state,
            }
        },
        upsert=True,
    )

    if state.get("isWin"):
        guess = state.get("guess") or {}
        render_guess(chat_id, lang, guess.get("name", ""), guess.get("description", ""), guess.get("photoUrl", ""))
        return

    q = state.get("question") or {}
    render_question(chat_id, lang, q.get("text", ""), float(q.get("progress", 0)))


def handle_answer(chat_id: int, lang: str, answer_id: str) -> None:
    doc = sessions.find_one({"chatId": chat_id})
    if not doc:
        ask_theme(chat_id, lang)
        return

    result = run_bridge(
        "answer",
        {
            "engineState": doc.get("engineState") or {},
            "answer": answer_map.get(answer_id, "yes"),
        },
    )

    state = result.get("state") or {}
    engine_state = result.get("engineState") or {}
    sessions.update_one({"chatId": chat_id}, {"$set": {"engineState": engine_state}}, upsert=True)

    if state.get("isWin"):
        guess = state.get("guess") or {}
        render_guess(chat_id, lang, guess.get("name", ""), guess.get("description", ""), guess.get("photoUrl", ""))
        return

    q = state.get("question") or {}
    render_question(chat_id, lang, q.get("text", ""), float(q.get("progress", 0)))


def handle_back(chat_id: int, lang: str) -> None:
    doc = sessions.find_one({"chatId": chat_id})
    if not doc:
        ask_theme(chat_id, lang)
        return

    result = run_bridge(
        "back",
        {
            "engineState": doc.get("engineState") or {},
        },
    )

    state = result.get("state") or {}
    engine_state = result.get("engineState") or {}
    sessions.update_one({"chatId": chat_id}, {"$set": {"engineState": engine_state}}, upsert=True)

    if state.get("isWin"):
        guess = state.get("guess") or {}
        render_guess(chat_id, lang, guess.get("name", ""), guess.get("description", ""), guess.get("photoUrl", ""))
        return

    q = state.get("question") or {}
    render_question(chat_id, lang, q.get("text", ""), float(q.get("progress", 0)))


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "status": "healthy"}


@app.on_event("startup")
def startup() -> None:
    configure_webhook_from_env()


@app.post("/bridge")
def bridge(request: BridgeRequest) -> Dict[str, Any]:
    return run_bridge(request.action, request.payload)


@app.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> Dict[str, Any]:
    if (
        TELEGRAM_WEBHOOK_SECRET
        and x_telegram_bot_api_secret_token is not None
        and x_telegram_bot_api_secret_token != TELEGRAM_WEBHOOK_SECRET
    ):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    update = await request.json()

    message = update.get("message") or {}
    callback_query = update.get("callback_query") or {}

    if message:
        chat_id = (message.get("chat") or {}).get("id")
        text = (message.get("text") or "").strip()
        if chat_id and text in {"/start", "/new"}:
            handle_start(chat_id)
        return {"ok": True}

    if callback_query:
        data = callback_query.get("data") or ""
        action = parse_action(data)
        callback_id = callback_query.get("id")
        chat_id = (((callback_query.get("message") or {}).get("chat") or {}).get("id"))

        if not action or not chat_id:
            if callback_id:
                telegram("answerCallbackQuery", {"callback_query_id": callback_id, "text": "Unknown action"})
            return {"ok": True}

        lang = get_lang(chat_id)

        try:
            if action["type"] == "language":
                lang = "am" if action["value"] == "am" else "en"
                set_lang(chat_id, lang)
                ask_theme(chat_id, lang)
            elif action["type"] == "theme":
                handle_theme(chat_id, lang, action["value"])
            elif action["type"] == "answer":
                handle_answer(chat_id, lang, action["value"])
            elif action["type"] == "back":
                handle_back(chat_id, lang)
            elif action["type"] == "restart":
                ask_theme(chat_id, lang)
            else:
                if callback_id:
                    telegram("answerCallbackQuery", {"callback_query_id": callback_id, "text": "Unknown action"})

            if callback_id:
                telegram("answerCallbackQuery", {"callback_query_id": callback_id})
        except Exception as exc:
            if callback_id:
                telegram(
                    "answerCallbackQuery",
                    {
                        "callback_query_id": callback_id,
                        "text": f"Error: {str(exc)[:120]}",
                        "show_alert": False,
                    },
                )

    return {"ok": True}
