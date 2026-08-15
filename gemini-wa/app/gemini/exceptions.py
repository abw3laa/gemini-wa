"""
استثناءات موحّدة لطبقة Gemini.

الهدف: عزل باقي المشروع (API, WhatsApp) عن تفاصيل مكتبة Google.
أي طبقة أعلى تتعامل فقط مع هذه الاستثناءات، بغض النظر عن مزود الذكاء
الاصطناعي المستخدم فعليًا خلف الكواليس.
"""


class GeminiError(Exception):
    """الخطأ الأساسي لكل أخطاء طبقة Gemini."""
    pass


class GeminiRateLimitError(GeminiError):
    """
    تم تجاوز حد الطلبات (RPM/RPD/TPM).
    الطبقات الأعلى يجب أن تتعامل مع هذا بشكل مختلف عن الأخطاء العامة
    (مثلاً: انتظار، أو إعلام المستخدم بدل إعادة المحاولة الفورية).
    """
    def __init__(self, message: str, retry_after_seconds: int | None = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class GeminiAuthError(GeminiError):
    """مفتاح API غير صالح أو مفقود."""
    pass


class GeminiTimeoutError(GeminiError):
    """انتهت مهلة الطلب."""
    pass


class GeminiResponseError(GeminiError):
    """رد غير متوقع أو فارغ من Gemini (مثلاً: تم حظر الرد بسبب safety filters)."""
    pass
