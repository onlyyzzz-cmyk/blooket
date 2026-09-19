from __future__ import annotations

import json
import os
import re
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock, Thread
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DATA_FILE = Path(__file__).parent / "data" / "chats.json"
CHAT_LOCK = Lock()
IN_MEMORY_CHATS: list[dict[str, Any]] = []
STORAGE_UNAVAILABLE = False
MODELS = [
    {"id": "qwen/qwen3.8-27b", "name": "Qwen 3.8 27B", "provider": "Alibaba", "tier": "balanced", "supportsImages": True},
    {"id": "openai/gpt-oss-120b", "name": "GPT OSS 120B", "provider": "OpenAI", "tier": "powerful", "supportsImages": False},
    {"id": "openai/gpt-oss-20b", "name": "GPT OSS 20B", "provider": "OpenAI", "tier": "fast", "supportsImages": False},
    {"id": "groq/compound", "name": "Compound", "provider": "Groq", "tier": "powerful", "supportsImages": False},
    {"id": "groq/compound-mini", "name": "Compound Mini", "provider": "Groq", "tier": "fast", "supportsImages": False},
]


try:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    (DATA_FILE.parent / "community").mkdir(exist_ok=True)
except OSError:
    pass

# ==================== COMMUNITY, MODERATION & FORMS ====================
COMMUNITY_FILE = DATA_FILE.parent / "community" / "community.json"
FORMS_FILE = DATA_FILE.parent / "community" / "forms.json"
IN_MEMORY_COMMUNITY: dict[str, Any] = {"messages": [], "members": {}}
IN_MEMORY_FORMS: dict[str, Any] = {"reports": [], "applications": [], "bugs": []}
BADGES = {
    "admin": {"label": "Admin", "color": "#e11d48"},
    "moderator": {"label": "Mod", "color": "#6366f1"},
    "member": {"label": "Member", "color": "#64748b"},
}
ADMIN_IDS = [entry.strip().lower() for entry in os.getenv("ADMIN_IDS", "owner").split(",") if entry.strip()]


def load_json(path: Path, fallback: Any) -> Any:
    try:
        with path.open(encoding="utf-8") as file:
            value = json.load(file)
        if isinstance(value, type(fallback)):
            return value
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return fallback


def save_json(path: Path, value: Any, fallback: dict[str, Any], label: str) -> None:
    fallback.clear()
    if isinstance(value, dict):
        fallback.update(value)
    try:
        temporary = path.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as file:
            json.dump(value, file)
        temporary.replace(path)
    except OSError as error:
        print(f"{label} file unavailable; using in-memory state: {error}")


def load_community() -> dict[str, Any]:
    return load_json(COMMUNITY_FILE, IN_MEMORY_COMMUNITY)


def save_community(state: dict[str, Any]) -> None:
    save_json(COMMUNITY_FILE, state, IN_MEMORY_COMMUNITY, "Community")


def load_forms() -> dict[str, Any]:
    return load_json(FORMS_FILE, IN_MEMORY_FORMS)


def save_forms(state: dict[str, Any]) -> None:
    save_json(FORMS_FILE, state, IN_MEMORY_FORMS, "Forms")


def member_role(member_id: str) -> str:
    state = load_community()
    stored = state.get("members", {}).get(member_id, {}).get("role")
    if stored in ("admin", "moderator"):
        return stored
    if str(member_id).lower() in ADMIN_IDS:
        return "admin"
    return "member"


def public_message(message: dict[str, Any], role: str) -> dict[str, Any]:
    return {"id": message.get("id"), "userId": message.get("userId"), "name": message.get("name"), "text": message.get("text"), "created": message.get("created"), "role": role}


def sanitize_text(value: Any, max_length: int) -> str:
    text = "".join(character if ord(character) >= 32 or character in "\t\n" else " " for character in str(value if value is not None else ""))
    return text.strip()[:max_length]


COMMUNITY_LOCK = Lock()
FORMS_LOCK = Lock()

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

REVIEW_PROMPT = (
    'You are reviewing an application for the "{position}" position on AITutor, a free AI tutoring site for students.\n'
    'Applicant name: {name}\nTimezone: {timezone}\n'
    'Moderation experience: {experience}\nWhy they want the position: {why}\n\n'
    'Decide if they would be a safe, responsible moderator for a student community.\n'
    'Respond with ONLY a JSON object, no other text:\n'
    '{{"decision":"approved"|"rejected","score":0-100,"feedback":"2-3 sentence friendly explanation for the applicant"}}'
)


BUG_TRIAGE_PROMPT = (
    'You are triaging a bug report for AITutor, an AI tutoring website for students.\n'
    'Where the bug happened: {where}\nBug description: {description}\n\n'
    'Respond with ONLY a JSON object, no other text:\n'
    '{"severity":"critical"|"high"|"medium"|"low","category":"chat"|"calculator"|"community"|"auth"|"pages"|"other",'
    '"summary":"one-sentence plain-language summary","note":"one sentence of helpful context for the developer"}'
)


def triage_bug(bug: dict[str, Any]) -> dict[str, Any]:
    """AI triage for bug reports: severity + category so the team can prioritize."""
    prompt = BUG_TRIAGE_PROMPT.format(where=bug.get("where") or "not specified", description=bug.get("description", ""))
    result = call_groq_raw([{"role": "user", "content": prompt}], temperature=0.2, max_tokens=250)
    if result.get("answer"):
        try:
            match = re.search(r"\{[\s\S]*\}", result["answer"])
            if match:
                parsed = json.loads(match.group(0))
                if parsed.get("severity") in ("critical", "high", "medium", "low"):
                    return {
                        "severity": parsed["severity"],
                        "category": sanitize_text(parsed.get("category", "other"), 20) or "other",
                        "summary": sanitize_text(parsed.get("summary", ""), 200),
                        "note": sanitize_text(parsed.get("note", ""), 300),
                        "triagedBy": "ai",
                    }
        except (ValueError, json.JSONDecodeError, KeyError, TypeError) as error:
            print(f"AI bug triage parse failed: {error}")
    return {"severity": "medium", "category": "other", "summary": sanitize_text(bug.get("description", ""), 100), "note": "Triaged automatically without AI — review manually.", "triagedBy": "fallback"}


def review_application(application: dict[str, Any]) -> dict[str, Any]:
    """AI reviewer: score the application. Heuristic fallback without Groq."""
    prompt = REVIEW_PROMPT.format(
        position=application.get("position", "moderator"),
        name=application.get("name", ""),
        timezone=application.get("timezone") or "not provided",
        experience=application.get("experience", ""),
        why=application.get("why", ""),
    )
    result = call_groq_raw([{ "role": "user", "content": prompt }], temperature=0.2, max_tokens=300)
    if result.get("answer"):
        try:
            match = re.search(r"\{[\s\S]*\}", result["answer"])
            if match:
                parsed = json.loads(match.group(0))
                if parsed.get("decision") in ("approved", "rejected"):
                    return {
                        "decision": parsed["decision"],
                        "score": min(max(int(parsed.get("score", 0) or 0), 0), 100),
                        "feedback": sanitize_text(parsed.get("feedback", ""), 600),
                        "reviewer": "ai",
                    }
        except (ValueError, json.JSONDecodeError, KeyError, TypeError) as error:
            print(f"AI review parse failed: {error}")
    word_count = len((application.get("experience", "") + " " + application.get("why", "")).split())
    approved = word_count >= 25
    return {
        "decision": "approved" if approved else "rejected",
        "score": min(word_count * 2, 70),
        "feedback": (
            "Thanks for applying! Your experience looks like a great fit for our community. Welcome aboard."
            if approved
            else "Thanks for applying! We would love a bit more detail about your moderation experience before we can approve you. Feel free to apply again with more information."
        ),
        "reviewer": "fallback",
    }


def send_result_email(to: str, application: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    """Email the review result via the Resend API."""
    key = os.getenv("RESEND_API_KEY", "")
    if not key or not EMAIL_RE.match(to):
        return {"emailed": False, "reason": "RESEND_API_KEY not set" if not key else "invalid email"}
    from_address = os.getenv("RESEND_FROM", "AITutor <onboarding@resend.dev>")
    approved = review.get("decision") == "approved"
    subject = (
        f"Your AITutor {application.get('position', 'moderator')} application was approved! \U0001f389"
        if approved
        else f"Your AITutor {application.get('position', 'moderator')} application result"
    )
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;'
        'border-radius:16px;padding:28px;border:1px solid #e5e7eb">'
        f'<h2 style="color:{"#059669" if approved else "#64748b"}">{"🎉 Approved!" if approved else "Application review"}</h2>'
        f'<p>Hi {application.get("name", "")},</p>'
        f'<p>Our AI reviewer scored your {application.get("position", "moderator")} application '
        f'<strong>{review.get("score", 0)}/100</strong> and {"approved it" if approved else "was not able to approve it this time"}.</p>'
        f'<div style="background:#f6f7fb;border-radius:12px;padding:16px">{review.get("feedback", "")}</div>'
        + (
            '<p><strong>You now have access to the moderation tools</strong> in the AITutor community. '
            'Sign in with the same account you used to apply — your Mod badge and tools are already waiting.</p>'
            if approved
            else '<p>You are still welcome in the community, and you can apply again any time.</p>'
        )
        + '<p style="color:#94a3b8;font-size:12px">AITutor — Learn anything, faster.</p></div>'
    )
    payload = json.dumps({"from": from_address, "to": [to], "subject": subject, "html": html}).encode()
    request = Request("https://api.resend.com/emails", data=payload, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=20) as response:
            response.read()
        return {"emailed": True}
    except (HTTPError, URLError, TimeoutError, OSError) as error:
        print(f"Resend email failed: {error}")
        return {"emailed": False, "reason": str(error)}


def load_chats() -> list[dict[str, Any]]:
    if STORAGE_UNAVAILABLE:
        return IN_MEMORY_CHATS
    try:
        with DATA_FILE.open(encoding="utf-8") as file:
            value = json.load(file)
        if isinstance(value, list):
            IN_MEMORY_CHATS[:] = value
            return value
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return IN_MEMORY_CHATS


def save_chats(chats: list[dict[str, Any]]) -> None:
    global STORAGE_UNAVAILABLE
    snapshot = chats[-200:]
    IN_MEMORY_CHATS[:] = snapshot
    try:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = DATA_FILE.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as file:
            json.dump(snapshot, file)
        temporary.replace(DATA_FILE)
        STORAGE_UNAVAILABLE = False
    except OSError as error:
        STORAGE_UNAVAILABLE = True
        print(f"Chat file unavailable; using in-memory history: {error}")


def chat_summary(chat: dict[str, Any]) -> dict[str, Any]:
    messages = chat.get("messages", [])
    first = messages[0].get("content", "") if messages else ""
    if isinstance(first, list):
        first = first[0].get("text", "") if first and isinstance(first[0], dict) else ""
    title = chat.get("title") or str(first)[:60] or "Untitled chat"
    return {"id": chat.get("id", ""), "title": title, "subject": chat.get("subject", "General"), "created": chat.get("created", 0), "updated": chat.get("updated", 0)}


def tutor_prompt(request: str, subject: str) -> str:
    return ("You are AI Tutor for PK through college students. Answer first, then show work step by step. "
            "Never repeat or restate the student's question; jump straight into the answer. "
            "Adapt to the student's level. Use plain text/basic markdown only; never use LaTeX. "
            "For math show every calculation, fractions and decimals. End with a Practice section "
            f"containing one similar problem. Keep this focused micro-lesson under 250 words. "
            f"Subject: {subject}. Student request: {request}")


MAX_ANSWER_WORDS = 240


def limit_to_words(text: str) -> str:
    """Trim toward the 250-word micro-lesson limit without cutting mid-sentence."""
    trimmed = (text or "").strip()
    if not trimmed:
        return trimmed
    words = trimmed.split()
    if len(words) <= MAX_ANSWER_WORDS:
        return trimmed
    kept = " ".join(words[:MAX_ANSWER_WORDS])
    # Walk back to the last sentence-ending punctuation so no sentence is cut in half.
    last_stop = max(kept.rfind(". "), kept.rfind("! "), kept.rfind("? "))
    if last_stop > len(kept) * 0.5:
        kept = kept[: last_stop + 1]
    return kept.strip()


def call_groq(messages: list[dict[str, Any]], model: str, temperature: float = 0.35, max_tokens: int = 700, trim: bool = True) -> dict[str, str]:
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        return {"error": "Groq is not configured. Add GROQ_API_KEY in the environment."}
    payload = json.dumps({"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}).encode()
    request = Request("https://api.groq.com/openai/v1/chat/completions", data=payload, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode())
        answer = result.get("choices", [{}])[0].get("message", {}).get("content")
        if isinstance(answer, str) and answer.strip():
            return {"answer": limit_to_words(answer) if trim else answer.strip()}
        return {"error": "Groq did not return an answer. Check the API key and model."}
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError):
        return {"error": "The AI service could not be reached. Check the API key and model."}


def call_groq_raw(messages: list[dict[str, Any]], temperature: float = 0.35, max_tokens: int = 700) -> dict[str, str]:
    """Like call_groq but returns the raw answer without word trimming."""
    return call_groq(messages, MODELS[0]["id"], temperature=temperature, max_tokens=max_tokens, trim=False)


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
        if path == "/api/community":
            state = load_community()
            now = int(time.time() * 1000)
            visible = []
            for message in state.get("messages", [])[-150:]:
                member = state.get("members", {}).get(message.get("userId", ""), {})
                if member.get("banned"):
                    continue
                if member.get("mutedUntil") and member.get("mutedUntil", 0) > now and message.get("created", 0) >= member.get("mutedFrom", 0):
                    continue
                visible.append(public_message(message, member_role(message.get("userId", ""))))
            return self.send_json({"messages": visible, "badges": BADGES})
        if path == "/api/forms":
            reviewer_id = sanitize_text(dict(pair.split("=", 1) for pair in query.split("&") if "=" in pair).get("reviewerId", ""), 64)
            if member_role(reviewer_id) == "member":
                return self.send_json({"error": "Only mods and admins can review forms."}, 403)
            state = load_forms()
            return self.send_json({"reports": state.get("reports", []), "applications": state.get("applications", []), "bugs": state.get("bugs", [])})
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
            model = next((item for item in MODELS if item["id"] == str(data.get("model", ""))), MODELS[0])
            if image.startswith("data:image/") and not model.get("supportsImages"):
                return self.send_json({"error": "This model cannot view images. Switch to Qwen 3.8 27B and send the photo again."}, 400)
            if image.startswith("data:image/"):
                content.append({"type": "image_url", "image_url": {"url": image}})
            messages.append({"role": "user", "content": content})
            result = call_groq(messages, model["id"])
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
        if path == "/api/community":
            user_id = sanitize_text(data.get("userId"), 64)
            name = sanitize_text(data.get("name"), 32)
            text = sanitize_text(data.get("text"), 500)
            if not user_id or not name or not text:
                return self.send_json({"error": "Name and a message are required."}, 400)
            with COMMUNITY_LOCK:
                state = load_community()
                members = state.setdefault("members", {})
                member = members.get(user_id, {})
                now = int(time.time() * 1000)
                if member.get("banned"):
                    return self.send_json({"error": "You are banned from the community. Contact an admin."}, 403)
                if member.get("mutedUntil", 0) > now:
                    minutes = max(1, (member["mutedUntil"] - now) // 60000)
                    return self.send_json({"error": f"You are muted for {minutes} more minute(s)."}, 403)
                message = {"id": secrets.token_hex(6), "userId": user_id, "name": name, "text": text, "created": now}
                member.update({"name": name, "lastSeen": now})
                members[user_id] = member
                state["messages"] = (state.get("messages", []) + [message])[-500:]
                save_community(state)
            return self.send_json({"message": public_message(message, member_role(user_id))})
        if path == "/api/community/moderate":
            moderator_id = sanitize_text(data.get("moderatorId"), 64)
            action = sanitize_text(data.get("action"), 20)
            if member_role(moderator_id) == "member":
                return self.send_json({"error": "Only mods and admins can moderate."}, 403)
            with COMMUNITY_LOCK:
                state = load_community()
                members = state.setdefault("members", {})
                target_id = str(data.get("targetId", ""))
                target = members.setdefault(target_id, {})
                now = int(time.time() * 1000)
                if action == "mute":
                    minutes = min(max(int(data.get("minutes", 10) or 10), 1), 60 * 24 * 7)
                    target["mutedUntil"] = now + minutes * 60000
                    target["mutedFrom"] = now
                elif action == "unmute":
                    target.pop("mutedUntil", None)
                    target.pop("mutedFrom", None)
                elif action == "ban":
                    target["banned"] = True
                elif action == "unban":
                    target.pop("banned", None)
                elif action == "delete-message":
                    state["messages"] = [message for message in state.get("messages", []) if message.get("id") != data.get("messageId")]
                elif action == "grant" and member_role(moderator_id) == "admin":
                    if data.get("role") not in ("admin", "moderator", "member"):
                        return self.send_json({"error": "Invalid role."}, 400)
                    target["role"] = data.get("role")
                else:
                    return self.send_json({"error": "Unknown moderation action."}, 400)
                members[target_id] = target
                save_community(state)
            return self.send_json({"ok": True})
        if path == "/api/forms":
            kind = str(data.get("kind", ""))
            if kind not in ("report", "application", "bug"):
                return self.send_json({"error": "Unknown form type."}, 400)
            now = int(time.time())
            with FORMS_LOCK:
                state = load_forms()
                if kind == "bug":
                    description = sanitize_text(data.get("description"), 2000)
                    where = sanitize_text(data.get("where"), 120)
                    if not description:
                        return self.send_json({"error": "Please describe the bug."}, 400)
                    entry = {"id": secrets.token_hex(6), "kind": kind, "description": description, "where": where, "contact": sanitize_text(data.get("contact"), 80), "created": now, "status": "open"}
                    try:
                        entry["triage"] = triage_bug(entry)
                    except Exception as error:  # noqa: BLE001 — triage must never break submission.
                        print(f"Bug triage failed: {error}")
                        entry["triage"] = {"severity": "unknown", "category": "other", "summary": description[:80], "note": "Automatic triage unavailable — review manually."}
                    state["bugs"] = ([entry] + state.get("bugs", []))[:300]
                    save_forms(state)
                    public_bug = {key: value for key, value in entry.items() if key != "description"}
                    return self.send_json({"ok": True, "entry": public_bug, "triage": entry["triage"]})
                if kind == "report":
                    who = sanitize_text(data.get("memberName"), 60)
                    reason = sanitize_text(data.get("reason"), 1000)
                    if not who or not reason:
                        return self.send_json({"error": "Member name and reason are required."}, 400)
                    entry = {"id": secrets.token_hex(6), "kind": kind, "memberName": who, "reason": reason, "contact": sanitize_text(data.get("contact"), 80), "created": now, "status": "pending"}
                    state["reports"] = ([entry] + state.get("reports", []))[:300]
                    save_forms(state)
                    return self.send_json({"ok": True, "entry": entry})
                # Applications require a signed-in account + email for the result.
                applicant_id = sanitize_text(data.get("userId"), 64)
                email = sanitize_text(data.get("email"), 120).lower()
                name = sanitize_text(data.get("name"), 60)
                position = data.get("position") if data.get("position") in ("moderator", "admin") else "moderator"
                why = sanitize_text(data.get("why"), 1500)
                experience = sanitize_text(data.get("experience"), 1500)
                if not applicant_id or not email:
                    return self.send_json({"error": "Please sign up or sign in first — applications are tied to your AITutor account."}, 401)
                if not EMAIL_RE.match(email):
                    return self.send_json({"error": "A valid email address is required so we can send you the result."}, 400)
                if not name or not why or not experience:
                    return self.send_json({"error": "Name, experience, and motivation are required."}, 400)
                if any(item.get("userId") == applicant_id and item.get("status") == "approved" for item in state.get("applications", [])):
                    return self.send_json({"error": "You already have an approved application on this account."}, 409)
                entry = {"id": secrets.token_hex(6), "kind": kind, "userId": applicant_id, "email": email, "name": name, "position": position, "why": why, "experience": experience, "timezone": sanitize_text(data.get("timezone"), 40), "created": now, "status": "pending"}
                review = review_application(entry)
                entry["review"] = review
                entry["status"] = review["decision"]
                state["applications"] = ([entry] + state.get("applications", []))[:300]
                save_forms(state)
                if review["decision"] == "approved":
                    with COMMUNITY_LOCK:
                        community = load_community()
                        members = community.setdefault("members", {})
                        member = members.get(applicant_id, {})
                        member.update({"role": "admin" if position == "admin" else "moderator", "email": email})
                        members[applicant_id] = member
                        save_community(community)
                email_result = send_result_email(email, entry, review)
                public_entry = {key: value for key, value in entry.items() if key not in ("why", "experience")}
                return self.send_json({"ok": True, "entry": public_entry, "review": {"decision": review["decision"], "score": review["score"], "feedback": review["feedback"]}, "email": email_result})
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


# Keep-alive pinger: hits our own /api/health endpoint on localhost so hosts
# like Bonto that sleep idle single-instance apps see constant traffic and
# never spin the service down. Disable with KEEP_ALIVE_DISABLED=1.
KEEP_ALIVE_INTERVAL_SECONDS = 4 * 60


def start_keep_alive(server: ThreadingHTTPServer) -> None:
    if os.getenv("KEEP_ALIVE_DISABLED") == "1":
        return

    def ping() -> None:
        try:
            with urlopen(f"http://127.0.0.1:{server.server_address[1]}/api/health", timeout=10) as response:
                print(f"[keep-alive] ping {response.status}")
        except (URLError, OSError) as error:
            print(f"[keep-alive] failed: {error}")

    def loop() -> None:
        while True:
            time.sleep(KEEP_ALIVE_INTERVAL_SECONDS)
            ping()

    ping()
    threading.Thread(target=loop, daemon=True, name="keep-alive").start()
    print(f"[keep-alive] pinging every {KEEP_ALIVE_INTERVAL_SECONDS // 60} minutes")


if __name__ == "__main__":
    print(f"AI Tutor Python API listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), ApiHandler).serve_forever()
