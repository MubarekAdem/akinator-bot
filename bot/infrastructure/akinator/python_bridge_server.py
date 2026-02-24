import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Tuple


SCRIPT_PATH = Path(__file__).with_name("python_client.py")


def run_bridge(action: str, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    process = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), action],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
    )

    if process.returncode != 0:
        message = process.stderr.strip() or "Python bridge failed"
        return 500, {
            "ok": False,
            "errorCode": "AKINATOR_PYTHON_RUNTIME_ERROR",
            "errorMessage": message,
        }

    stdout = process.stdout.strip()
    if not stdout:
        return 500, {
            "ok": False,
            "errorCode": "AKINATOR_PYTHON_EMPTY_OUTPUT",
            "errorMessage": "No output from python bridge",
        }

    try:
        data = json.loads(stdout)
    except Exception:
        return 500, {
            "ok": False,
            "errorCode": "AKINATOR_PYTHON_INVALID_JSON",
            "errorMessage": stdout[:200],
        }

    return 200, data


class BridgeHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return

        body = json.dumps({"ok": True, "status": "healthy"}).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path != "/bridge":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("content-length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            body = json.loads(raw_body.decode("utf-8") or "{}")
        except Exception as exc:
            self._send_json(
                400,
                {
                    "ok": False,
                    "errorCode": "AKINATOR_PYTHON_BAD_JSON",
                    "errorMessage": str(exc),
                },
            )
            return

        action = body.get("action")
        payload = body.get("payload")

        if action not in {"start", "answer", "back"}:
            self._send_json(
                400,
                {
                    "ok": False,
                    "errorCode": "AKINATOR_UNKNOWN_ACTION",
                    "errorMessage": f"Unknown action: {action}",
                },
            )
            return

        if not isinstance(payload, dict):
            self._send_json(
                400,
                {
                    "ok": False,
                    "errorCode": "AKINATOR_PYTHON_BAD_PAYLOAD",
                    "errorMessage": "payload must be an object",
                },
            )
            return

        status, response = run_bridge(action, payload)
        self._send_json(status, response)

    def _send_json(self, status: int, body_obj: Dict[str, Any]) -> None:
        body = json.dumps(body_obj).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    port = int(os.getenv("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), BridgeHandler)
    print(f"Python bridge server listening on :{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
