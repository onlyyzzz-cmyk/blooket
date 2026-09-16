"""API routes for chat sessions (GET/POST/DELETE /api/chats).

Sessions are persisted to a JSON file inside a writable data directory so they
survive restarts. Starts completely empty — no mock or seed data.
"""
import json
import os
import tempfile
import time
import uuid
from common import cors_headers, json_response, read_json_body

VALID_SUBJECTS = ("Math", "English", "Science", "History")


def _store_path():
    base = os.environ.get("DATA_DIR") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "data"
    )
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "chats.json")


def _load_chats():
    try:
        with open(_store_path(), "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def _save_chats(chats):
    path = _store_path()
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(chats, fh)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _summary(chat):
    first = chat["messages"][0] if chat["messages"] else {}
    preview = first.get("content", "")
    if isinstance(preview, list):
        preview = next(
            (p.get("text", "") for p in preview if isinstance(p, dict) and p.get("type") == "text"),
            "",
        )
    return {
        "id": chat["id"],
        "title": chat.get("title") or (preview[:60] or "Untitled chat"),
        "subject": chat.get("subject", "Math"),
        "created": chat.get("created", 0),
        "updated": chat.get("updated", 0),
    }


def handler(request):
    method = request.method
    if method == "OPTIONS":
        return 204, cors_headers(), b""

    path = getattr(request, "path", "/api/chats")
    chat_id = None
    if "/api/chats/" in path:
        chat_id = path.rsplit("/api/chats/", 1)[-1].split("?")[0]

    if method == "GET" and not chat_id:
        chats = _load_chats()
        chats.sort(key=lambda c: c.get("updated", 0), reverse=True)
        return json_response(200, {"chats": [_summary(c) for c in chats]}, cors_headers())

    if method == "GET" and chat_id:
        for chat in _load_chats():
            if chat["id"] == chat_id:
                return json_response(200, {"chat": chat}, cors_headers())
        return json_response(404, {"error": "Chat not found."}, cors_headers())

    if method == "POST" and not chat_id:
        data, error = read_json_body(request)
        if error:
            return error
        subject = str(data.get("subject") or "Math")
        if subject not in VALID_SUBJECTS:
            subject = "Math"
        messages = data.get("messages")
        if not isinstance(messages, list) or not messages:
            return json_response(400, {"error": "A chat needs at least one message."}, cors_headers())
        clean = []
        for turn in messages[:80]:
            if (
                isinstance(turn, dict)
                and turn.get("role") in ("user", "assistant")
                and isinstance(turn.get("content"), (str, list))
            ):
                clean.append({"role": turn["role"], "content": turn["content"]})
        if not clean:
            return json_response(400, {"error": "No valid messages."}, cors_headers())

        now = int(time.time())
        chat = {
            "id": uuid.uuid4().hex[:12],
            "subject": subject,
            "messages": clean,
            "created": now,
            "updated": now,
        }
        chat["title"] = data.get("title") or _summary(chat)["title"]
        chats = _load_chats()
        chats.append(chat)
        _save_chats(chats[-200:])
        return json_response(200, {"chat": chat}, cors_headers())

    if method == "POST" and chat_id:
        data, error = read_json_body(request)
        if error:
            return error
        chats = _load_chats()
        for chat in chats:
            if chat["id"] == chat_id:
                add = data.get("add")
                if (
                    isinstance(add, dict)
                    and add.get("role") in ("user", "assistant")
                    and isinstance(add.get("content"), (str, list))
                ):
                    chat["messages"] = (chat["messages"] + [add])[-80:]
                if isinstance(data.get("title"), str) and data["title"].strip():
                    chat["title"] = data["title"].strip()[:80]
                if data.get("subject") in VALID_SUBJECTS:
                    chat["subject"] = data["subject"]
                chat["updated"] = int(time.time())
                _save_chats(chats)
                return json_response(200, {"chat": chat}, cors_headers())
        return json_response(404, {"error": "Chat not found."}, cors_headers())

    if method == "DELETE" and chat_id:
        chats = _load_chats()
        remaining = [c for c in chats if c["id"] != chat_id]
        if len(remaining) == len(chats):
            return json_response(404, {"error": "Chat not found."}, cors_headers())
        _save_chats(remaining)
        return json_response(200, {"ok": True}, cors_headers())

    return json_response(405, {"error": "Method not allowed."}, cors_headers())
