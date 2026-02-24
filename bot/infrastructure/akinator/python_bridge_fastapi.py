import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Literal, Tuple

from fastapi import FastAPI
from pydantic import BaseModel
from starlette.responses import JSONResponse


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


class BridgeRequest(BaseModel):
    action: Literal["start", "answer", "back"]
    payload: Dict[str, Any]


app = FastAPI(title="Akinator Python Bridge", version="1.0.0")


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "status": "healthy"}


@app.post("/bridge")
def bridge(request: BridgeRequest) -> JSONResponse:
    status, response = run_bridge(request.action, request.payload)
    return JSONResponse(status_code=status, content=response)
