"""
اختبارات RateLimiter - لا تحتاج اتصال إنترنت.
تشغيل: pytest tests/
"""

import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest

from app.core.rate_limiter import RateLimiter, RateLimitTimeoutError


def test_allows_requests_within_limit():
    limiter = RateLimiter(requests_per_minute=5, max_wait_seconds=10)
    # 5 طلبات ضمن الحد يجب أن تمر فورًا بدون انتظار
    start = time.monotonic()
    for _ in range(5):
        limiter.acquire()
    elapsed = time.monotonic() - start
    assert elapsed < 1.0


def test_rejects_when_wait_exceeds_max():
    # حد طلب واحد بالدقيقة، وأقصى انتظار مسموح به هو نصف ثانية فقط
    limiter = RateLimiter(requests_per_minute=1, max_wait_seconds=0.5)
    limiter.acquire()  # يستهلك المكان الوحيد

    with pytest.raises(RateLimitTimeoutError):
        limiter.acquire()  # لازم ينتظر ~60 ثانية، أكبر بكثير من 0.5 المسموحة
