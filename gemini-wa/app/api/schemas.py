"""
Schemas لـ /v1/chat/completions

الصيغة متوافقة مع النمط الشائع (OpenAI-style) الذي طلبته بالمواصفات،
حتى يسهل لاحقًا ربط أي Client (WhatsApp, Web, Telegram...) بنفس العقد.
"""

from pydantic import BaseModel, Field


class ChatMessageIn(BaseModel):
    role: str = Field(..., description="'user' أو 'assistant'")
    content: str = ""

    # Phase 7: صورة اختيارية مرفقة بهذه الرسالة (بصيغة base64)
    image_base64: str | None = Field(default=None, description="بيانات الصورة بصيغة base64")
    image_mime_type: str | None = Field(default=None, description="مثال: image/jpeg")


class ChatCompletionRequest(BaseModel):
    model: str = "gemini"
    messages: list[ChatMessageIn]

    # Phase 10: سياق إضافي من قاعدة المعرفة (نتائج بحث ذات صلة بالسؤال)
    # يُحقن كـ system instruction بدل ما يُحشر بمحادثة المستخدم مباشرة
    context: str | None = None


class ChatCompletionResponseMessage(BaseModel):
    role: str = "assistant"
    content: str


class ChatCompletionChoice(BaseModel):
    index: int = 0
    message: ChatCompletionResponseMessage
    finish_reason: str | None = None


class ChatCompletionResponse(BaseModel):
    model: str
    choices: list[ChatCompletionChoice]
    usage: dict = Field(default_factory=dict)


class UsageResponse(BaseModel):
    requests_last_minute: int
    requests_today: int
    total_requests_since_start: int
    rpm_limit: int


class HealthResponse(BaseModel):
    status: str = "ok"
