"""
RateLimiter

يحترم حد الطلبات بالدقيقة (RPM) المسموح به فعليًا من Gemini على حسابك
(شفناها بالصورة: 5 طلبات/دقيقة على gemini-3.6-flash بالـ free tier).

بدل ما نرسل الطلب مباشرة ونخلي Gemini يرفضه بـ 429، الـ RateLimiter:
  1. يتحقق: هل يوجد مكان ضمن آخر 60 ثانية؟
  2. إذا لا، ينتظر (queue) لحد ما يفتح مكان - هذا بالضبط سبب مشكلة
     "توقف بعد 5 رسائل" التي واجهتها سابقًا: كنا نرسل فورًا بدل الانتظار.
  3. إذا الانتظار طال أكثر من الحد المسموح (rate_limit_max_wait_seconds)،
     يرفض بخطأ واضح بدل ما يعلّق الطلب للأبد.

هذا thread-safe لأن FastAPI (بالوضع المتزامن/sync) يشغّل كل طلب بـ thread منفصل.
"""

import threading
import time
from collections import deque


class RateLimitTimeoutError(Exception):
    """الطابور مزدحم جدًا؛ الطلب انتظر أكثر من الحد المسموح."""
    def __init__(self, waited_seconds: float):
        self.waited_seconds = waited_seconds
        super().__init__(
            f"النظام مشغول حاليًا (انتظر الطلب {waited_seconds:.1f} ثانية بدون توفر مكان). "
            f"حاول مرة أخرى بعد قليل."
        )


class RateLimiter:
    def __init__(self, requests_per_minute: int, max_wait_seconds: int):
        self._limit = requests_per_minute
        self._max_wait = max_wait_seconds
        self._timestamps: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        """
        يحجز مكانًا. يحظر (blocks) الـ thread الحالي إذا لزم الانتظار.
        يرفع RateLimitTimeoutError إذا تجاوز الانتظار الحد الأقصى المسموح.
        """
        started_at = time.monotonic()

        while True:
            with self._lock:
                now = time.monotonic()
                self._evict_old(now)

                if len(self._timestamps) < self._limit:
                    self._timestamps.append(now)
                    return

                # أقرب وقت يتحرر فيه مكان = وقت أقدم طلب + 60 ثانية
                wait_needed = (self._timestamps[0] + 60.0) - now

            waited_so_far = time.monotonic() - started_at
            if waited_so_far + wait_needed > self._max_wait:
                raise RateLimitTimeoutError(waited_so_far)

            # ننتظر خارج الـ lock حتى ما نمنع threads تانية من التحقق
            time.sleep(min(wait_needed, 1.0))

    def _evict_old(self, now: float) -> None:
        cutoff = now - 60.0
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()
