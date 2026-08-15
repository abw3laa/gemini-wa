"""
مصادقة API الداخلي.

كل Client (بما فيه WhatsApp Adapter لاحقًا بـ Phase 3-4) لازم يرسل
API key داخلي خاص فينا (مختلف تمامًا عن GEMINI_API_KEY) بترويسة:

    X-API-Key: <القيمة>

هذا يمنع أي شخص يعرف رابط السيرفر من استخدام Gemini على حسابك مجانًا.
"""

import hmac

from fastapi import Header, HTTPException, Depends

from app.config.settings import ApiSettings
from app.api.dependencies import get_api_settings


def verify_api_key(
    x_api_key: str | None = Header(default=None),
    settings: ApiSettings = Depends(get_api_settings),
) -> None:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="مفقود: ترويسة X-API-Key")

    # مقارنة بزمن ثابت لتجنّب timing attacks
    if not hmac.compare_digest(x_api_key, settings.internal_api_key):
        raise HTTPException(status_code=401, detail="X-API-Key غير صحيح")
