"""
Routes الرئيسية لـ API الخاص فينا.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import verify_api_key
from app.api.dependencies import (
    get_gemini_client,
    get_rate_limiter,
    get_usage_tracker,
    get_api_settings,
)
from app.api.schemas import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionChoice,
    ChatCompletionResponseMessage,
    UsageResponse,
    HealthResponse,
)
from app.config.settings import ApiSettings
from app.core.rate_limiter import RateLimiter, RateLimitTimeoutError
from app.core.usage_tracker import UsageTracker
from app.gemini.base import ChatMessage
from app.gemini.base import ImagePayload
from app.gemini.gemini_api_provider import GeminiAPIProvider
from app.gemini.exceptions import (
    GeminiError,
    GeminiRateLimitError,
    GeminiAuthError,
    GeminiTimeoutError,
    GeminiResponseError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """بدون مصادقة عمدًا - يُستخدم من منصة الاستضافة (مثل Render) للتحقق أن السيرفر حي."""
    return HealthResponse()


@router.post(
    "/v1/chat/completions",
    response_model=ChatCompletionResponse,
    dependencies=[Depends(verify_api_key)],
)
def chat_completions(
    payload: ChatCompletionRequest,
    gemini_client: GeminiAPIProvider = Depends(get_gemini_client),
    rate_limiter: RateLimiter = Depends(get_rate_limiter),
    usage_tracker: UsageTracker = Depends(get_usage_tracker),
) -> ChatCompletionResponse:
    if not payload.messages:
        raise HTTPException(status_code=400, detail="حقل messages فارغ")

    # آخر رسالة user هي الـ prompt، والباقي سياق محادثة (history)
    *history_raw, last_message = payload.messages
    if last_message.role != "user":
        raise HTTPException(
            status_code=400, detail="آخر رسالة بالمحادثة يجب أن تكون بدور 'user'"
        )

    history = [ChatMessage(role=m.role, content=m.content) for m in history_raw]

    image = None
    if last_message.image_base64 and last_message.image_mime_type:
        image = ImagePayload(
            mime_type=last_message.image_mime_type,
            base64_data=last_message.image_base64,
        )

    try:
        rate_limiter.acquire()
    except RateLimitTimeoutError as e:
        raise HTTPException(status_code=429, detail=str(e))

    usage_tracker.record_request()

    try:
        result = gemini_client.generate(
            last_message.content, history=history, image=image, extra_context=payload.context
        )
    except GeminiRateLimitError as e:
        # نادرًا ما تصل لهون بفضل RateLimiter، بس لو صار (مثلاً طلب من مصدر خارجي بالتوازي)
        raise HTTPException(status_code=429, detail=str(e))
    except GeminiAuthError:
        logger.error("GEMINI_API_KEY غير صالح - راجع إعدادات السيرفر")
        raise HTTPException(status_code=500, detail="خطأ إعدادات داخلي بالسيرفر")
    except GeminiTimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except GeminiResponseError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except GeminiError as e:
        logger.exception("خطأ غير متوقع من Gemini")
        raise HTTPException(status_code=502, detail=str(e))

    return ChatCompletionResponse(
        model=result.model,
        choices=[
            ChatCompletionChoice(
                message=ChatCompletionResponseMessage(content=result.text)
            )
        ],
        usage=result.usage,
    )


@router.get(
    "/v1/usage",
    response_model=UsageResponse,
    dependencies=[Depends(verify_api_key)],
)
def usage(
    usage_tracker: UsageTracker = Depends(get_usage_tracker),
    api_settings: ApiSettings = Depends(get_api_settings),
) -> UsageResponse:
    """لمراقبة استهلاكك الفعلي - مفيد لمعرفة هل تحتاج ترقية billing أم لا."""
    snapshot = usage_tracker.snapshot()
    return UsageResponse(
        requests_last_minute=snapshot.requests_last_minute,
        requests_today=snapshot.requests_today,
        total_requests_since_start=snapshot.total_requests_since_start,
        rpm_limit=api_settings.gemini_rpm_limit,
    )
