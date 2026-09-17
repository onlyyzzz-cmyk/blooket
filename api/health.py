"""API route for GET /api/health."""
from common import cors_headers, json_response, requesty_key


def handler(request):
    if request.method == "OPTIONS":
        return 204, cors_headers(), b""
    return json_response(
        200, {"ok": True, "configured": bool(requesty_key())}, cors_headers()
    )
