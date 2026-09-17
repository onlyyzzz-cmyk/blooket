"""Shared helpers for AI Tutor API routes."""
import json
import os
import urllib.request
import urllib.error

REQUESTY_API_URL = "https://router.requesty.ai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-4o"

AVAILABLE_MODELS = [
    {"id": "openai/gpt-4o", "name": "GPT-4o", "provider": "OpenAI", "tier": "balanced"},
    {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI", "tier": "fast"},
    {"id": "anthropic/claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "provider": "Anthropic", "tier": "balanced"},
    {"id": "anthropic/claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "provider": "Anthropic", "tier": "fast"},
    {"id": "google/gemini-2.5-flash-preview", "name": "Gemini 2.5 Flash", "provider": "Google", "tier": "fast"},
    {"id": "google/gemini-2.5-pro-preview-05-06", "name": "Gemini 2.5 Pro", "provider": "Google", "tier": "powerful"},
    {"id": "deepseek/deepseek-chat", "name": "DeepSeek V3", "provider": "DeepSeek", "tier": "balanced"},
    {"id": "deepseek/deepseek-reasoner", "name": "DeepSeek R1", "provider": "DeepSeek", "tier": "powerful"},
    {"id": "meta-llama/llama-4-maverick-17b-128e-instruct", "name": "Llama 4 Maverick", "provider": "Meta", "tier": "balanced"},
]

TUTOR_PROMPT = (
    "You are AI Tutor, a highly knowledgeable tutor capable of helping students from elementary school (PK) through AP/IB/honors/college-level coursework. "
    "You are an expert in Math (including counting, arithmetic, algebra, geometry, calculus, statistics), English/Language Arts, Science, History, and General topics.\n\n"
    "You understand PK-12 education standards and college-preparatory material. "
    "For younger students (elementary/middle school), use simple language, friendly tone, and encouraging words. "
    "For high school students, use appropriate academic vocabulary. "
    "For AP/IB/honors/college students, use rigorous terminology and thorough proofs.\n\n"
    "Rules:\n"
    "1. Adapt to difficulty. If the question is basic arithmetic or simple, keep it brief and friendly. If it is AP/honors/college-level, give a thorough, rigorous explanation with proper terminology.\n"
    "2. Always start with the ANSWER — clear and direct.\n"
    "3. Show your work step by step. For math: show each calculation clearly. For counting: list items, use arrays or groups, show patterns. For science: explain the concept. For English: analyze the text. For history: give context and significance.\n"
    "4. Use plain text formatting only. Fractions as 3/4, exponents as x^2, roots as sqrt(9), multiplication as x * y, division as 12 / 9 = 4/3.\n"
    "5. For counting problems: break the problem into visual groups, use systematic listing, show combinatorics formulas when appropriate (nCr, nPr, permutations, combinations), and explain the counting principle clearly.\n"
    "6. For complex problems (AP Calc, AP Physics, AP Chem, AP Bio, AP Stats, honors-level), show full worked solutions with all intermediate steps. Include formulas, theorems, or concepts used.\n"
    "7. For English/History: Use evidence-based reasoning, cite relevant facts, and structure essays with thesis + support.\n"
    "8. Always end with a Practice section — one similar problem at the same difficulty level for the student to try.\n"
    "9. NEVER use LaTeX, dollar signs, backslash commands, or special math notation. Write everything as clean readable plain text with basic markdown.\n"
    "10. Round decimals to a reasonable precision (usually 2-4 decimal places) and also show the exact fraction or simplified form when applicable.\n"
    "11. For division questions, show both the fraction form and the decimal form. Example: 12 / 9 = 4/3 = 1.333... (repeating).\n"
    "12. Keep answers concise but complete. No filler, no apologies, no excessive preamble. Get straight to the answer and explanation.\n\n"
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


def requesty_key():
    return os.environ.get("REQUESTY_API_KEY")


def call_ai(messages, model=None):
    """Call Requesty AI gateway (OpenAI-compatible). Returns (answer, error_response)."""
    api_key = requesty_key()
    if not api_key:
        return None, json_response(
            503,
            {"error": "AI is not configured yet. Set REQUESTY_API_KEY in your environment."},
        )

    chosen_model = model or DEFAULT_MODEL

    payload = json.dumps(
        {
            "model": chosen_model,
            "messages": messages,
            "temperature": 0.35,
            "max_tokens": 2000,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        REQUESTY_API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "X-Title": "AITutor",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=90) as response:
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
            {"error": f"The tutor could not reach the AI provider right now. ({exc.code}: {detail})"},
        )
    except (urllib.error.URLError, TimeoutError, OSError):
        return None, json_response(
            502,
            {"error": "The tutor could not reach the AI provider right now. Check your key and try again."},
        )
