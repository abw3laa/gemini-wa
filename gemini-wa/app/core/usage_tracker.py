"""
UsageTracker - عدّاد بسيط جدًا لعدد الطلبات المُرسلة إلى Gemini.

الهدف: معرفة استهلاكك الفعلي (كم طلب باليوم/بالدقيقة) بأرقام حقيقية،
بدل التخمين، قبل اتخاذ قرار الانتقال لـ billing.

هذا تخزين في الذاكرة فقط (يُصفّر عند إعادة تشغيل السيرفر).
في Phase لاحقة (قاعدة بيانات) يمكن جعله دائمًا لو احتجنا.
"""

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass
class UsageSnapshot:
    requests_last_minute: int
    requests_today: int
    total_requests_since_start: int


class UsageTracker:
    def __init__(self):
        self._timestamps: deque[datetime] = deque()
        self._total: int = 0

    def record_request(self) -> None:
        self._timestamps.append(datetime.now(timezone.utc))
        self._total += 1
        self._cleanup()

    def snapshot(self) -> UsageSnapshot:
        self._cleanup()
        now = datetime.now(timezone.utc)
        one_minute_ago = now - timedelta(minutes=1)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        last_minute = sum(1 for t in self._timestamps if t >= one_minute_ago)
        today = sum(1 for t in self._timestamps if t >= start_of_day)

        return UsageSnapshot(
            requests_last_minute=last_minute,
            requests_today=today,
            total_requests_since_start=self._total,
        )

    def _cleanup(self) -> None:
        """يحذف السجلات الأقدم من 24 ساعة لتوفير الذاكرة."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()
