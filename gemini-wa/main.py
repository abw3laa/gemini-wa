"""
اختبار Phase 1 اليدوي.

الهدف الوحيد: التأكد أن GeminiAPIProvider يشتغل فعليًا ويرجع ردًا حقيقيًا
من Gemini، قبل الانتقال إلى Phase 2.

تشغيل:
    python main.py
    python main.py "اكتب لي جملة عن الطقس"
"""

import sys
import logging

from app.config.settings import load_gemini_settings, ConfigError
from app.gemini.gemini_api_provider import GeminiAPIProvider
from app.gemini.exceptions import GeminiError
from app.core.usage_tracker import UsageTracker

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def main():
    try:
        settings = load_gemini_settings()
    except ConfigError as e:
        print(f"❌ خطأ في الإعدادات: {e}")
        sys.exit(1)

    client = GeminiAPIProvider(settings)
    tracker = UsageTracker()

    prompt = sys.argv[1] if len(sys.argv) > 1 else "مرحبا، كيف حالك؟"
    print(f"📤 إرسال: {prompt}")

    try:
        tracker.record_request()
        result = client.generate(prompt)
    except GeminiError as e:
        print(f"❌ فشل الطلب: {e}")
        sys.exit(1)

    print(f"\n📥 الرد ({result.model}):")
    print(result.text)

    if result.usage:
        print(f"\n📊 استهلاك التوكنز: {result.usage}")

    usage = tracker.snapshot()
    print(
        f"📈 عدد الطلبات: {usage.requests_last_minute} بآخر دقيقة | "
        f"{usage.requests_today} اليوم"
    )


if __name__ == "__main__":
    main()
