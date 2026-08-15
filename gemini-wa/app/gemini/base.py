"""
الواجهة المجردة (Abstract Base) لأي مزود ذكاء اصطناعي.

المبدأ: باقي المشروع (API، WhatsApp) يتعامل فقط مع GeminiProvider،
وليس مع GeminiAPIProvider مباشرة. هذا يعني:

  - إذا تغيّر SDK جوجل مستقبلًا، نعدّل GeminiAPIProvider فقط.
  - إذا أردنا لاحقًا إضافة مزود بديل (احتياطي عند تعطل Gemini)،
    نضيف كلاس جديد يطبّق نفس الواجهة دون لمس بقية الكود.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ChatMessage:
    """رسالة واحدة في محادثة، بصيغة موحّدة بغض النظر عن مزود الذكاء الاصطناعي."""
    role: str  # "user" أو "model"
    content: str


@dataclass
class GenerateResult:
    """نتيجة موحّدة لأي طلب توليد نص."""
    text: str
    model: str
    finish_reason: str | None = None
    usage: dict = field(default_factory=dict)  # عدد التوكنز إن توفر


@dataclass
class ImagePayload:
    """صورة مرفقة برسالة - Phase 7. البيانات بصيغة base64 جاهزة للإرسال لـ Gemini مباشرة."""
    mime_type: str
    base64_data: str


class GeminiProvider(ABC):
    """الواجهة التي يجب أن يطبّقها أي مزود ذكاء اصطناعي."""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        history: list[ChatMessage] | None = None,
        image: ImagePayload | None = None,
        extra_context: str | None = None,
    ) -> GenerateResult:
        """
        يرسل prompt واحد (مع سياق محادثة اختياري وصورة اختيارية وسياق إضافي
        من قاعدة المعرفة - Phase 10) ويعيد رد كامل.

        هذه هي الدالة المطلوبة لاختبار Phase 1:
            client.generate("مرحبا")
        """
        raise NotImplementedError
