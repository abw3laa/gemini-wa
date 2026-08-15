"""
Singletons مشتركة بين كل الطلبات (dependency injection عبر FastAPI).

كل هذه الكائنات تُنشأ مرة واحدة فقط عند أول استخدام، وتبقى نفس النسخة
طوال عمر السيرفر (مهم خصوصًا لـ RateLimiter و UsageTracker، لأنهم
لازم "يتذكروا" الحالة بين الطلبات).
"""

from functools import lru_cache

from app.config.settings import (
    load_gemini_settings,
    load_api_settings,
    GeminiSettings,
    ApiSettings,
)
from app.gemini.gemini_api_provider import GeminiAPIProvider
from app.core.rate_limiter import RateLimiter
from app.core.usage_tracker import UsageTracker


@lru_cache
def get_gemini_settings() -> GeminiSettings:
    return load_gemini_settings()


@lru_cache
def get_api_settings() -> ApiSettings:
    return load_api_settings()


@lru_cache
def get_gemini_client() -> GeminiAPIProvider:
    return GeminiAPIProvider(get_gemini_settings())


@lru_cache
def get_rate_limiter() -> RateLimiter:
    api_settings = get_api_settings()
    return RateLimiter(
        requests_per_minute=api_settings.gemini_rpm_limit,
        max_wait_seconds=api_settings.rate_limit_max_wait_seconds,
    )


@lru_cache
def get_usage_tracker() -> UsageTracker:
    return UsageTracker()
