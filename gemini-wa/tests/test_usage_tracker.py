"""
اختبارات UsageTracker - لا تحتاج اتصال إنترنت أو API key.
تشغيل: pytest tests/
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.usage_tracker import UsageTracker


def test_starts_at_zero():
    tracker = UsageTracker()
    snapshot = tracker.snapshot()
    assert snapshot.requests_last_minute == 0
    assert snapshot.requests_today == 0
    assert snapshot.total_requests_since_start == 0


def test_records_requests():
    tracker = UsageTracker()
    for _ in range(3):
        tracker.record_request()

    snapshot = tracker.snapshot()
    assert snapshot.requests_last_minute == 3
    assert snapshot.requests_today == 3
    assert snapshot.total_requests_since_start == 3
