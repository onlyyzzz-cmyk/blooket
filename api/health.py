"""API route for GET /api/health."""
from common import cors_headers, groq_key, json_response


def handler(request):
    if request.method == "OPTIONS":
        return 204, cors_headers(), b""
    return json_response(
        200, {"ok": True, "configured": bool(groq_key())}, cors_headers()
    )
