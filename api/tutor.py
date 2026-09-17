"""API routes for tutor requests (POST /api/tutor)."""
from common import (
    TUTOR_PROMPT,
    call_groq,
    cors_headers,
    json_response,
    read_json_body,
)


def handler(request):
    if request.method == "OPTIONS":
        return 204, cors_headers(), b""

    if request.method != "POST":
        return json_response(405, {"error": "Method not allowed."}, cors_headers())

    data, error = read_json_body(request)
    if error:
        return error

    prompt = str(data.get("prompt") or "").strip()
    image = data.get("image")
    history = data.get("history")
    subject = str(data.get("subject") or "").strip()
    model = str(data.get("model") or "").strip() or None

    if not prompt and not image:
        return json_response(
            400, {"error": "Add a question or upload a homework image first."}, cors_headers()
        )

    system_text = TUTOR_PROMPT.format(
        request=prompt or "Please read and explain the attached homework image."
    )
    if subject:
        system_text += f" The student is focusing on {subject}."

    content = [{"type": "text", "text": system_text}]
    if isinstance(image, str) and image.startswith("data:image/"):
        content.append({"type": "image_url", "image_url": {"url": image}})

    messages = []
    if isinstance(history, list):
        for turn in history[-6:]:
            if (
                isinstance(turn, dict)
                and isinstance(turn.get("role"), str)
                and isinstance(turn.get("content"), str)
                and turn["role"] in ("user", "assistant")
            ):
                messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": content})

    answer, error = call_groq(messages, model=model)
    if error:
        return error
    return json_response(200, {"answer": answer}, cors_headers())
