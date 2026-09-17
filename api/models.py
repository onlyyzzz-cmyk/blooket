"""API route for listing available models (GET /api/models)."""
from common import AVAILABLE_MODELS, cors_headers, json_response


def handler(request):
    if request.method == "OPTIONS":
        return 204, cors_headers(), b""

    if request.method != "GET":
        return json_response(405, {"error": "Method not allowed."}, cors_headers())

    return json_response(200, {"models": AVAILABLE_MODELS}, cors_headers())
