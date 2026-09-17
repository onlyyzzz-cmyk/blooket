from __future__ import annotations

import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DATA_FILE = Path(__file__).parent / "data" / "chats.json"
CHAT_LOCK = Lock()
MODELS = [
    {"id": "qwen/qwen3.8-27b", "name": "Qwen 3.8 27B", "provider": "Alibaba", "tier": "balanced", "supportsImages": True},
    {"id": "openai/gpt-oss-120b", "name": "GPT OSS 120B", "provider": "OpenAI", "tier": "powerful", "supportsImages": False},
    {"id": "openai/gpt-oss-20b", "name": "GPT OSS 20B", "provider": "OpenAI", "tier": "fast", "supportsImages": False},
    {"id": "groq/compound", "name": "Compound", "provider": "Groq", "tier": "powerful", "supportsImages": False},
    {"id": "groq/compound-mini", "name": "Compound Mini", "provider": "Groq", "tier": "fast", "supportsImages": False},
]


def load_chats() -> list[dict[str, Any]]:
    try:
        with DATA_FILE.open(encoding="utf-8") as file:
            value = json.load(file)
        return value if isinstance(value, list) else []
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def save_chats(chats: list[dict[str, Any]]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary = DATA_FILE.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(chats[-200:], file)
    temporary.replace(DATA_FILE)


def chat_summary(chat: dict[str, Any]) -> dict[str, Any]:
    messages = chat.get("messages", [])
    first = messages[0].get("content", "") if messages else ""
    if isinstance(first, list):
        first = first[0].get("text", "") if first and isinstance(first[0], dict) else ""
    title = chat.get("title") or str(first)[:60] or "Untitled chat"
    return {"id": chat.get("id", ""), "title": title, "subject": chat.get("subject", "General"), "created": chat.get("created", 0), "updated": chat.get("updated", 0)}


def tutor_prompt(request: str, subject: str) -> str:
    return ("You are AI Tutor for PK through college students. Answer first, then show work step by step. "
            "Adapt to the student's level. Use plain text/basic markdown only; never use LaTeX. "
            "For math show every calculation, fractions and decimals. End with a Practice section "
            f"containing one similar problem. Subject: {subject}. Student request: {request}")


def call_groq(messages: list[dict[str, Any]], model: str) -> dict[str, str]:
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        return {"error": "Groq is not configured. Add GROQ_API_KEY in the environment."}
    payload = json.dumps({"model": model, "messages": messages, "temperature": 0.35, "max_tokens": 1200}).encode()
    request = Request("https://api.groq.com/openai/v1/chat/completions", data=payload, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode())
        answer = result.get("choices", [{}])[0].get("message", {}).get("content")
        return {"answer": answer} if isinstance(answer, str) and answer.strip() else {"error": "Groq did not return an answer. Check the API key and model."}
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError):
        return {"error": "The AI service could not be reached. Check the API key and model."}


class ApiHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_json({})

    def read_body(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            value = json.loads(self.rfile.read(length) or b"{}")
            return value if isinstance(value, dict) else {}
        except (ValueError, json.JSONDecodeError):
            return {}

    def do_GET(self) -> None:
        path, _, query = self.path.partition("?")
        if path == "/api/health":
            return self.send_json({"ok": True, "configured": bool(os.getenv("GROQ_API_KEY")), "model": MODELS[0]["id"]})
        if path == "/api/models":
            return self.send_json({"models": MODELS})
        if path == "/api/chats":
            chat_id = query.removeprefix("id=") if query.startswith("id=") else ""
            chats = load_chats()
            if chat_id:
                chat = next((item for item in chats if item.get("id") == chat_id), None)
                return self.send_json({"chat": chat} if chat else {"error": "Chat not found."}, 200 if chat else 404)
            chats.sort(key=lambda item: item.get("updated", 0), reverse=True)
            return self.send_json({"chats": [chat_summary(chat) for chat in chats]})
        return self.send_json({"error": "Not found."}, 404)

    def do_POST(self) -> None:
        path, _, query = self.path.partition("?")
        data = self.read_body()
        if path == "/api/tutor":
            prompt = str(data.get("prompt", "")).strip()
            image = str(data.get("image", ""))
            if not prompt and not image:
                return self.send_json({"error": "Add a question or upload a homework image first."}, 400)
            history = data.get("history", []) if isinstance(data.get("history"), list) else []
            messages = [{"role": turn["role"], "content": turn["content"]} for turn in history[-6:] if isinstance(turn, dict) and turn.get("role") in ("user", "assistant") and isinstance(turn.get("content"), str)]
            content: list[dict[str, Any]] = [{"type": "text", "text": tutor_prompt(prompt or "Please explain the attached homework image.", str(data.get("subject", "General")))}]
            if image.startswith("data:image/"):
                content.append({"type": "image_url", "image_url": {"url": image}})
            messages.append({"role": "user", "content": content})
            result = call_groq(messages, str(data.get("model", "")) or MODELS[0]["id"])
            return self.send_json(result, 200 if "answer" in result else 502)
        if path == "/api/chats":
            chat_id = query.removeprefix("id=") if query.startswith("id=") else ""
            with CHAT_LOCK:
                chats = load_chats()
                if not chat_id:
                    messages = [turn for turn in data.get("messages", [])[:80] if isinstance(turn, dict) and turn.get("role") in ("user", "assistant") and isinstance(turn.get("content"), str)] if isinstance(data.get("messages"), list) else []
                    if not messages:
                        return self.send_json({"error": "A chat needs at least one message."}, 400)
                    now = int(time.time())
                    chat = {"id": secrets.token_hex(6), "subject": data.get("subject", "General"), "messages": messages, "created": now, "updated": now}
                    chat["title"] = chat_summary(chat)["title"]
                    chats.append(chat)
                    save_chats(chats)
                    return self.send_json({"chat": chat})
                chat = next((item for item in chats if item.get("id") == chat_id), None)
                if not chat:
                    return self.send_json({"error": "Chat not found."}, 404)
                addition = data.get("add")
                if isinstance(addition, dict) and addition.get("role") in ("user", "assistant") and isinstance(addition.get("content"), str):
                    chat.setdefault("messages", []).append(addition)
                chat["messages"] = chat.get("messages", [])[-80:]
                chat["updated"] = int(time.time())
                save_chats(chats)
                return self.send_json({"chat": chat})
        return self.send_json({"error": "Method not allowed."}, 405)

    def do_DELETE(self) -> None:
        path, _, query = self.path.partition("?")
        if path != "/api/chats":
            return self.send_json({"error": "Method not allowed."}, 405)
        chat_id = query.removeprefix("id=") if query.startswith("id=") else ""
        with CHAT_LOCK:
            chats = load_chats()
            remaining = [chat for chat in chats if chat.get("id") != chat_id]
            if len(remaining) == len(chats):
                return self.send_json({"error": "Chat not found."}, 404)
            save_chats(remaining)
        return self.send_json({"ok": True})


if __name__ == "__main__":
    print(f"AI Tutor Python API listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), ApiHandler).serve_forever()
