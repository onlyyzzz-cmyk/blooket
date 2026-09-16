"""Shared helpers for AI Tutor API routes."""
import json
import os
import urllib.request
import urllib.error

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "qwen/qwen3.8-27b"

TUTOR_PROMPT = (
    "You are AI Tutor, a friendly homework helper. Rules:\n"
    "1. Give the ANSWER first, clearly and simply.\n"
    "2. Then show HOW to solve it step by step, using plain text. "
    "Write fractions like 1/2, exponents like x^2, square roots like sqrt(9), multiplication like x * y.\n"
    "3. Use numbered steps. Keep it short and clear.\n"
    "4. If the problem is simple, just give the answer and a one-line explanation.\n"
    "5. At the end, add a Practice section with one similar problem.\n"
    "6. Do NOT use LaTeX, dollar signs, double-dollar math blocks, backslash commands, "
    "or any special math formatting. Keep everything as readable plain text with basic markdown.\n\n"
    "Student request: {request}"
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
            "max_tokens": 800,
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
