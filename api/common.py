"""Shared helpers for AI Tutor API routes."""
import json
import os
import urllib.request
import urllib.error

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "qwen/qwen3.8-27b"

TUTOR_PROMPT = (
    "You are AI Tutor, a warm expert teacher. Help the student learn instead of "
    "only giving an answer. Identify the subject, explain the reasoning in clear "
    "steps, call out common mistakes, and end with one short practice question. "
    "Use Markdown. Student request: {request}"
)


def json_response(status, payload, extra_headers=None):
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    return status, headers, json.dumps(payload).encode("utf-8")


def cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def read_json_body(request):
    """Parse the request body; returns (data, error_response)."""
    try:
        length = int(request.headers.get("Content-Length") or 0)
        raw = request.rfile.read(length) if length else b"{}"
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None, json_response(400, {"error": "Body must be a JSON object."})
        return data, None
    except (ValueError, json.JSONDecodeError, AttributeError):
        return None, json_response(400, {"error": "Invalid JSON body."})


def groq_key():
    return os.environ.get("GROQ_API_KEY")


def call_groq(messages):
    """Call Groq chat completions. Returns (answer, error_response)."""
    api_key = groq_key()
    if not api_key:
        return None, json_response(
            503,
            {"error": "Groq is not configured yet. Set GROQ_API_KEY in your environment."},
        )

    payload = json.dumps(
        {
            "model": MODEL,
            "messages": messages,
            "temperature": 0.35,
            "max_tokens": 1200,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        GROQ_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
        answer = (
            result.get("choices", [{}])[0]
            .get("message", {})
            .get("content")
            or "I could not create an explanation this time."
        )
        return answer, None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        return None, json_response(
            502,
            {"error": f"The tutor could not reach Groq right now. ({exc.code}: {detail})"},
        )
    except (urllib.error.URLError, TimeoutError, OSError):
        return None, json_response(
            502,
            {"error": "The tutor could not reach Groq right now. Check your key and try again."},
        )
