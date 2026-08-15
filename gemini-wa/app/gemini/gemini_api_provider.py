"""
GeminiAPIProvider

التنفيذ الفعلي لـ GeminiProvider باستخدام مكتبة Google الرسمية (google-genai)
عبر مفتاح API رسمي من Google AI Studio.

لا يستخدم أي cookies أو جلسة متصفح - فقط اتصال API موثّق ومدعوم رسميًا.
"""

import logging
from datetime import datetime, timezone

from google import genai
from google.genai import errors as genai_errors

from app.config.settings import GeminiSettings
from app.gemini.base import GeminiProvider, ChatMessage, GenerateResult, ImagePayload
from app.gemini.exceptions import (
    GeminiError,
    GeminiRateLimitError,
    GeminiAuthError,
    GeminiTimeoutError,
    GeminiResponseError,
)

logger = logging.getLogger(__name__)


class GeminiAPIProvider(GeminiProvider):
    def __init__(self, settings: GeminiSettings):
        self._settings = settings
        self._client = genai.Client(api_key=settings.api_key)

    def generate(
        self,
        prompt: str,
        history: list[ChatMessage] | None = None,
        image: ImagePayload | None = None,
        extra_context: str | None = None,
    ) -> GenerateResult:
        contents = self._build_contents(prompt, history, image)

        try:
            response = self._client.models.generate_content(
                model=self._settings.model,
                contents=contents,
                config={
                    "max_output_tokens": self._settings.max_output_tokens,
                    "temperature": self._settings.temperature,
                    # نحقن التاريخ/الوقت الحقيقي دائمًا + سياق قاعدة المعرفة إن وجد
                    "system_instruction": self._build_system_instruction(extra_context),
                },
            )
        except genai_errors.ClientError as e:
            # أخطاء المصادقة وتجاوز الحدود تصل عادة كـ ClientError (4xx)
            status = getattr(e, "status_code", None) or getattr(e, "code", None)
            message = str(e)

            if status == 401 or status == 403 or "API key" in message:
                raise GeminiAuthError(f"مفتاح Gemini API غير صالح أو غير مصرح له: {message}") from e

            if status == 429 or "RESOURCE_EXHAUSTED" in message or "quota" in message.lower():
                raise GeminiRateLimitError(
                    f"تم تجاوز حد الطلبات المسموح (rate limit): {message}"
                ) from e

            raise GeminiError(f"خطأ من Gemini API: {message}") from e

        except genai_errors.ServerError as e:
            raise GeminiError(f"خطأ من طرف خوادم Gemini: {e}") from e

        except TimeoutError as e:
            raise GeminiTimeoutError(f"انتهت مهلة الاتصال بـ Gemini: {e}") from e

        return self._parse_response(response)

    def _build_system_instruction(self, extra_context: str | None = None) -> str:
        """
        يبني تعليمة نظام ثابتة تُرسل مع كل طلب، تحتوي التاريخ/الوقت الحقيقي
        + سياق إضافي من قاعدة المعرفة إن وُجد (Phase 10).

        بدون التاريخ، النموذج قد "يخمّن" تاريخًا قديمًا من بيانات تدريبه لو
        سُئل عن اليوم/التاريخ الحالي - هذا سلوك طبيعي لأي نموذج لغوي وليس
        خطأ، لكن حقن الوقت الحقيقي يحله بالكامل.
        """
        now = datetime.now(timezone.utc)
        instruction = (
            f"التاريخ والوقت الحالي (UTC): {now.strftime('%Y-%m-%d %H:%M')}. "
            f"إذا سُئلت عن التاريخ أو الوقت أو اليوم الحالي، اعتمد على هذه "
            f"المعلومة فقط، ولا تخمّن أو تعتمد على معلومات قديمة."
        )
        if extra_context:
            instruction += f"\n\n{extra_context}"
        return instruction

    def _build_contents(
        self,
        prompt: str,
        history: list[ChatMessage] | None,
        image: ImagePayload | None = None,
    ):
        """
        يبني قائمة contents بصيغة SDK جوجل من سياق المحادثة + الرسالة الجديدة.
        هذا يسمح لاحقًا (Phase 5) بتمرير سياق محادثة كامل بسهولة.

        Phase 7: لو فيه صورة مرفقة، تُضاف كـ part إضافي بآخر رسالة (user).
        """
        contents = []
        if history:
            for msg in history:
                # SDK جوجل يتوقع role: "user" أو "model"
                role = "model" if msg.role == "model" else "user"
                contents.append({"role": role, "parts": [{"text": msg.content}]})

        last_parts = [{"text": prompt or "صف هذه الصورة بالتفصيل."}]
        if image is not None:
            last_parts.append(
                {"inline_data": {"mime_type": image.mime_type, "data": image.base64_data}}
            )

        contents.append({"role": "user", "parts": last_parts})
        return contents

    def _parse_response(self, response) -> GenerateResult:
        text = getattr(response, "text", None)

        if not text:
            # قد يكون الرد فارغًا بسبب safety filters أو غيره
            finish_reason = None
            try:
                finish_reason = response.candidates[0].finish_reason
            except (AttributeError, IndexError):
                pass
            raise GeminiResponseError(
                f"رد فارغ من Gemini (finish_reason={finish_reason}). "
                f"قد يكون المحتوى محجوبًا بواسطة فلاتر الأمان."
            )

        usage = {}
        usage_meta = getattr(response, "usage_metadata", None)
        if usage_meta:
            usage = {
                "prompt_tokens": getattr(usage_meta, "prompt_token_count", None),
                "response_tokens": getattr(usage_meta, "candidates_token_count", None),
                "total_tokens": getattr(usage_meta, "total_token_count", None),
            }

        return GenerateResult(
            text=text,
            model=self._settings.model,
            finish_reason=None,
            usage=usage,
        )
