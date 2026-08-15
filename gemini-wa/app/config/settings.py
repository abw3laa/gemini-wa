"""
Central configuration module.

كل الإعدادات تُقرأ من متغيرات البيئة (.env) فقط.
لا يوجد أي secret أو API key مكتوب مباشرة في الكود.
"""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

# تحميل ملف .env إن وجد (محليًا فقط - في الإنتاج تُستخدم Secrets الحقيقية للاستضافة)
load_dotenv()


class ConfigError(Exception):
    """يُرفع عند غياب إعداد مطلوب."""
    pass


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ConfigError(
            f"متغير البيئة '{name}' غير موجود. "
            f"تأكد من إعداده في ملف .env (راجع .env.example)."
        )
    return value


@dataclass(frozen=True)
class GeminiSettings:
    api_key: str
    model: str
    max_output_tokens: int
    temperature: float
    request_timeout_seconds: int


def load_gemini_settings() -> GeminiSettings:
    return GeminiSettings(
        api_key=_require("GEMINI_API_KEY"),
        # Flash هو الافتراضي لأنه الأنسب للـ free tier (حدود أعلى بكثير من Pro)
        # gemini-3.6-flash هو أحدث إصدار GA مستقر بتاريخ أغسطس 2026
        model=os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
        max_output_tokens=int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "1024")),
        temperature=float(os.getenv("GEMINI_TEMPERATURE", "0.7")),
        request_timeout_seconds=int(os.getenv("GEMINI_TIMEOUT_SECONDS", "30")),
    )


@dataclass(frozen=True)
class ApiSettings:
    internal_api_key: str
    # حد الطلبات بالدقيقة المسموح به فعليًا من Gemini على حسابك (شفناها بالصورة: 5 RPM)
    # اجعلها قابلة للتعديل لأن Google تغيّرها بمرور الوقت وقد تختلف حسب الموديل
    gemini_rpm_limit: int
    # أقصى وقت ينتظره الطلب بالـ queue قبل ما نرجع للمستخدم خطأ "busy" بدل ما يعلق للأبد
    rate_limit_max_wait_seconds: int


def load_api_settings() -> ApiSettings:
    return ApiSettings(
        internal_api_key=_require("API_KEY"),
        gemini_rpm_limit=int(os.getenv("GEMINI_RPM_LIMIT", "5")),
        rate_limit_max_wait_seconds=int(os.getenv("RATE_LIMIT_MAX_WAIT_SECONDS", "45")),
    )
