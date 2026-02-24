import json
import sys
from typing import Any, Dict

from akinator import Client

ANSWER_VALUES = {"yes", "no", "i don't know", "probably", "probably not"}
THEME_VALUES = {"c", "a", "o"}
SESSION_KEYS = [
    "theme",
    "session_id",
    "signature",
    "identifiant",
    "child_mode",
    "language",
    "question",
    "progression",
    "step",
    "akitude",
    "step_last_proposition",
    "finished",
    "win",
    "id_proposition",
    "name_proposition",
    "description_proposition",
    "proposition",
    "completion",
    "confidence",
    "theme_id",
    "theme_name",
    "photo",
    "flag_photo",
    "pseudo",
]


def _error(code: str, message: str) -> None:
    print(json.dumps({"ok": False, "errorCode": code, "errorMessage": message}))


def _extract_state(client: Client) -> Dict[str, Any]:
    is_win = bool(getattr(client, "win", False))
    state: Dict[str, Any] = {"isWin": is_win}

    if is_win:
        state["guess"] = {
            "name": getattr(client, "name_proposition", "") or "",
            "description": getattr(client, "description_proposition", "") or "",
            "photoUrl": getattr(client, "photo", "") or "",
        }
    else:
        progression = getattr(client, "progression", 0) or 0
        try:
            progress = float(progression)
        except Exception:
            progress = 0.0

        state["question"] = {
            "text": getattr(client, "question", "") or "",
            "progress": progress,
        }

    return state


def _extract_engine_state(client: Client) -> Dict[str, Any]:
    output: Dict[str, Any] = {}
    for key in SESSION_KEYS:
        output[key] = getattr(client, key, None)
    return output


def _hydrate_client(engine_state: Dict[str, Any]) -> Client:
    client = Client()
    for key, value in engine_state.items():
        try:
            setattr(client, key, value)
        except (AttributeError, TypeError):
            continue
    return client


def main() -> int:
    if len(sys.argv) < 2:
        _error("AKINATOR_PYTHON_BAD_ARGS", "Missing action argument")
        return 1

    action = sys.argv[1]
    payload_raw = sys.stdin.read() or "{}"

    try:
        payload = json.loads(payload_raw)
    except Exception as exc:
        _error("AKINATOR_PYTHON_BAD_JSON", str(exc))
        return 1

    try:
        if action == "start":
            region = payload.get("region", "en")
            child_mode = bool(payload.get("childMode", False))
            theme = payload.get("theme", "c")

            if theme not in THEME_VALUES:
                _error("AKINATOR_INVALID_THEME", f"Unsupported theme: {theme}")
                return 0

            client = Client()
            client.start_game(language=region, child_mode=child_mode, theme=theme)

        elif action == "answer":
            engine_state = payload.get("engineState")
            answer = (payload.get("answer") or "").lower().strip()

            if not isinstance(engine_state, dict):
                _error("AKINATOR_MISSING_STATE", "Missing engineState for answer")
                return 0

            if answer not in ANSWER_VALUES:
                _error("AKINATOR_INVALID_ANSWER", f"Unsupported answer: {answer}")
                return 0

            client = _hydrate_client(engine_state)
            client.answer(answer)

        elif action == "back":
            engine_state = payload.get("engineState")

            if not isinstance(engine_state, dict):
                _error("AKINATOR_MISSING_STATE", "Missing engineState for back")
                return 0

            client = _hydrate_client(engine_state)
            client.back()

        else:
            _error("AKINATOR_UNKNOWN_ACTION", f"Unknown action: {action}")
            return 0

        print(
            json.dumps(
                {
                    "ok": True,
                    "state": _extract_state(client),
                    "engineState": _extract_engine_state(client),
                }
            )
        )
        return 0

    except Exception as exc:
        message = str(exc)
        lower = message.lower()

        if "cloudflare" in lower or "blocked" in lower or "attention required" in lower:
            code = "AKINATOR_CLOUDFLARE_BLOCK"
        elif "certificate" in lower or "ssl" in lower:
            code = "AKINATOR_TLS_CERT_ERROR"
        else:
            code = "AKINATOR_PYTHON_EXCEPTION"

        print(json.dumps({"ok": False, "errorCode": code, "errorMessage": message}))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
