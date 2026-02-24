import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any, Dict, Literal
from urllib.parse import quote

import requests
from fastapi import FastAPI, Form, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
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
users = db["users"]
guesses = db["guesses"]

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

ADMIN_EMAIL = "akinator@gmail.com"
ADMIN_PASSWORD = "Akinator@123"
ADMIN_SESSION_COOKIE = "users_admin_session"
ADMIN_SESSION_VALUE = "ok"


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
        print(f"Webhook setup warning: {description}")


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

    try:
        data = response.json()
    except Exception:
        data = {
            "ok": False,
            "description": f"HTTP {response.status_code} with non-JSON response",
        }

    if response.status_code >= 400 and isinstance(data, dict) and "ok" not in data:
        data["ok"] = False

    return data


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


def send_or_edit_message(
    chat_id: int,
    text: str,
    reply_markup: Dict[str, Any] | None = None,
    parse_mode: str | None = None,
    message_id: int | None = None,
) -> None:
    base_payload: Dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
    }

    if reply_markup is not None:
        base_payload["reply_markup"] = reply_markup

    if parse_mode:
        base_payload["parse_mode"] = parse_mode

    if message_id is not None:
        edit_payload = dict(base_payload)
        edit_payload["message_id"] = message_id
        edit_response = telegram("editMessageText", edit_payload)
        if edit_response.get("ok"):
            return

    telegram("sendMessage", base_payload)


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


def ask_theme(chat_id: int, lang: str, message_id: int | None = None) -> None:
    text = "Choose a game theme before we start:" if lang == "en" else "ከመጀመር በፊት የጨዋታ አይነት ይምረጡ:"
    send_or_edit_message(chat_id, text, reply_markup=theme_keyboard(lang), message_id=message_id)


def render_question(
    chat_id: int,
    lang: str,
    question: str,
    progress: float,
    message_id: int | None = None,
) -> None:
    question_text = translate_to_amharic(question, lang == "am")
    label = "Progress" if lang == "en" else "እድገት"
    text = f"🤔 {question_text}\n\n{label}: {progress:.1f}%"
    send_or_edit_message(chat_id, text, reply_markup=game_keyboard(lang), message_id=message_id)


def render_guess(
    chat_id: int,
    lang: str,
    name: str,
    description: str,
    photo_url: str,
    message_id: int | None = None,
) -> None:
    track_final_guess(chat_id, lang, name, description, photo_url)

    label = "I guess" if lang == "en" else "ግምቴ"
    text = f"🎯 {label}: *{name}*\n\n{description}"
    send_or_edit_message(
        chat_id,
        text,
        reply_markup=win_keyboard(lang),
        parse_mode="Markdown",
        message_id=message_id,
    )

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


def parse_action(data: str) -> Dict[str, str] | None:
    if not data.startswith("aki:"):
        return None

    parts = data.split(":")
    if len(parts) < 2:
        return None

    action_type = parts[1]
    value = parts[2] if len(parts) > 2 else ""
    return {"type": action_type, "value": value}


def track_user_start(chat_id: int, user: Dict[str, Any] | None) -> None:
    user = user or {}
    first_name = (user.get("first_name") or "").strip()
    last_name = (user.get("last_name") or "").strip()
    username = (user.get("username") or "").strip()
    full_name = f"{first_name} {last_name}".strip()

    users.update_one(
        {"chatId": chat_id},
        {
            "$set": {
                "chatId": chat_id,
                "name": full_name,
                "username": username,
                "updatedAt": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "firstStartedAt": datetime.now(timezone.utc),
            },
            "$inc": {
                "startCount": 1,
            },
        },
        upsert=True,
    )


def track_final_guess(
    chat_id: int,
    lang: str,
    name: str,
    description: str,
    photo_url: str,
) -> None:
    now = datetime.now(timezone.utc)
    guesses.insert_one(
        {
            "chatId": chat_id,
            "lang": lang,
            "guessName": name,
            "guessDescription": description,
            "guessPhotoUrl": photo_url,
            "createdAt": now,
        }
    )

    users.update_one(
        {"chatId": chat_id},
        {
            "$inc": {"guessCount": 1},
            "$set": {
                "lastGuessName": name,
                "lastGuessAt": now,
                "updatedAt": now,
            },
        },
        upsert=True,
    )


def handle_start(chat_id: int, user: Dict[str, Any] | None) -> None:
    track_user_start(chat_id, user)
    sessions.delete_one({"chatId": chat_id})
    ask_language(chat_id)


def handle_theme(chat_id: int, lang: str, theme_id: str, message_id: int | None = None) -> None:
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
        render_guess(
            chat_id,
            lang,
            guess.get("name", ""),
            guess.get("description", ""),
            guess.get("photoUrl", ""),
            message_id,
        )
        return

    q = state.get("question") or {}
    render_question(chat_id, lang, q.get("text", ""), float(q.get("progress", 0)), message_id)


def handle_answer(chat_id: int, lang: str, answer_id: str, message_id: int | None = None) -> None:
    doc = sessions.find_one({"chatId": chat_id})
    if not doc:
        ask_theme(chat_id, lang, message_id)
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
        render_guess(
            chat_id,
            lang,
            guess.get("name", ""),
            guess.get("description", ""),
            guess.get("photoUrl", ""),
            message_id,
        )
        return

    q = state.get("question") or {}
    render_question(chat_id, lang, q.get("text", ""), float(q.get("progress", 0)), message_id)


def handle_back(chat_id: int, lang: str, message_id: int | None = None) -> None:
    doc = sessions.find_one({"chatId": chat_id})
    if not doc:
        ask_theme(chat_id, lang, message_id)
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
        render_guess(
            chat_id,
            lang,
            guess.get("name", ""),
            guess.get("description", ""),
            guess.get("photoUrl", ""),
            message_id,
        )
        return

    q = state.get("question") or {}
    render_question(chat_id, lang, q.get("text", ""), float(q.get("progress", 0)), message_id)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "status": "healthy"}


@app.get("/users", response_class=HTMLResponse)
def users_page(request: Request) -> HTMLResponse:
    if request.cookies.get(ADMIN_SESSION_COOKIE) != ADMIN_SESSION_VALUE:
        return RedirectResponse(url="/users/login", status_code=302)

    user_docs = list(users.find().sort("updatedAt", -1))
    total_users = len(user_docs)
    total_starts = sum(int(doc.get("startCount") or 0) for doc in user_docs)
    total_guesses = sum(int(doc.get("guessCount") or 0) for doc in user_docs)

    rows: list[str] = []
    for index, doc in enumerate(user_docs, start=1):
        name = escape(str(doc.get("name") or "-"))
        username_raw = str(doc.get("username") or "").strip()
        username = f"@{escape(username_raw)}" if username_raw else "-"
        chat_id = escape(str(doc.get("chatId") or "-"))
        start_count = escape(str(doc.get("startCount") or 0))
        guess_count = escape(str(doc.get("guessCount") or 0))
        last_guess = escape(str(doc.get("lastGuessName") or "-"))
        rows.append(
            "<tr>"
            f"<td>{index}</td>"
            f"<td>{name}</td>"
            f"<td>{username}</td>"
            f"<td>{chat_id}</td>"
            f"<td>{start_count}</td>"
            f"<td>{guess_count}</td>"
            f"<td>{last_guess}</td>"
            "</tr>"
        )

    table_rows = "".join(rows) if rows else "<tr><td colspan='7'>No users yet.</td></tr>"
    html = (
        "<!doctype html>"
        "<html>"
        "<head>"
        "<meta charset='utf-8' />"
        "<meta name='viewport' content='width=device-width, initial-scale=1' />"
        "<title>Akinator Bot Users</title>"
        "<style>"
        "body { font-family: Arial, sans-serif; margin: 24px; }"
        "h1 { margin-bottom: 4px; }"
        ".muted { color: #666; margin-top: 0; }"
        ".stats { margin: 16px 0; font-size: 16px; }"
        "table { border-collapse: collapse; width: 100%; }"
        "th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }"
        "th { background: #f6f6f6; }"
        "</style>"
        "</head>"
        "<body>"
        "<h1>Akinator Bot Users</h1>"
        "<p class='muted'>Users tracked when they run /start or /new</p>"
        f"<div class='stats'><strong>Total users:</strong> {total_users} &nbsp;|&nbsp; <strong>Total starts:</strong> {total_starts} &nbsp;|&nbsp; <strong>Total guesses:</strong> {total_guesses}</div>"
        "<table>"
        "<thead><tr><th>#</th><th>Name</th><th>Username</th><th>Chat ID</th><th>Start Count</th><th>Guess Count</th><th>Last Guess</th></tr></thead>"
        f"<tbody>{table_rows}</tbody>"
        "</table>"
        "</body>"
        "</html>"
    )
    return HTMLResponse(content=html)


@app.get("/users/login", response_class=HTMLResponse)
def users_login_page(error: str | None = None) -> HTMLResponse:
    safe_error = escape(error or "")
    error_html = f"<p class='error'>{safe_error}</p>" if safe_error else ""
    html = (
        "<!doctype html>"
        "<html>"
        "<head>"
        "<meta charset='utf-8' />"
        "<meta name='viewport' content='width=device-width, initial-scale=1' />"
        "<title>Users Login</title>"
        "<style>"
        "body { font-family: Arial, sans-serif; margin: 24px; max-width: 420px; }"
        "h1 { margin-bottom: 16px; }"
        "label { display: block; margin: 10px 0 6px; }"
        "input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; }"
        "button { margin-top: 14px; padding: 10px 14px; border: 0; border-radius: 6px; cursor: pointer; }"
        ".error { color: #c00; margin-top: 10px; }"
        "</style>"
        "</head>"
        "<body>"
        "<h1>Users Login</h1>"
        "<form method='post' action='/users/login'>"
        "<label for='email'>Email</label>"
        "<input id='email' name='email' type='email' required />"
        "<label for='password'>Password</label>"
        "<input id='password' name='password' type='password' required />"
        "<button type='submit'>Login</button>"
        "</form>"
        f"{error_html}"
        "</body>"
        "</html>"
    )
    return HTMLResponse(content=html)


@app.post("/users/login")
def users_login_submit(email: str = Form(...), password: str = Form(...)) -> RedirectResponse:
    if email.strip().lower() != ADMIN_EMAIL or password != ADMIN_PASSWORD:
        return RedirectResponse(url=f"/users/login?error={quote('Invalid credentials')}", status_code=302)

    response = RedirectResponse(url="/users", status_code=302)
    response.set_cookie(
        key=ADMIN_SESSION_COOKIE,
        value=ADMIN_SESSION_VALUE,
        httponly=True,
        samesite="lax",
        secure=True,
        max_age=60 * 60 * 8,
    )
    return response


@app.post("/users/logout")
def users_logout() -> RedirectResponse:
    response = RedirectResponse(url="/users/login", status_code=302)
    response.delete_cookie(ADMIN_SESSION_COOKIE)
    return response


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
            handle_start(chat_id, message.get("from") or {})
        return {"ok": True}

    if callback_query:
        data = callback_query.get("data") or ""
        action = parse_action(data)
        callback_id = callback_query.get("id")
        callback_message = callback_query.get("message") or {}
        chat_id = ((callback_message.get("chat") or {}).get("id"))
        callback_message_id = callback_message.get("message_id")

        if not action or not chat_id:
            if callback_id:
                telegram("answerCallbackQuery", {"callback_query_id": callback_id, "text": "Unknown action"})
            return {"ok": True}

        lang = get_lang(chat_id)

        try:
            if action["type"] == "language":
                lang = "am" if action["value"] == "am" else "en"
                set_lang(chat_id, lang)
                ask_theme(chat_id, lang, callback_message_id)
            elif action["type"] == "theme":
                handle_theme(chat_id, lang, action["value"], callback_message_id)
            elif action["type"] == "answer":
                handle_answer(chat_id, lang, action["value"], callback_message_id)
            elif action["type"] == "back":
                handle_back(chat_id, lang, callback_message_id)
            elif action["type"] == "restart":
                ask_theme(chat_id, lang, callback_message_id)
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
