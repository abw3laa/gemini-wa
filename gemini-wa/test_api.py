"""
اختبار Phase 2 اليدوي.

قبل التشغيل، لازم يكون السيرفر شغال بترمنال منفصل:
    uvicorn app.api.app:app --reload

ثم بترمنال ثاني:
    python test_api.py
    python test_api.py "اكتب لي جملة عن الطقس"
"""

import sys
import os

import requests
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("API_URL", "http://127.0.0.1:8000")
API_KEY = os.getenv("API_KEY")


def main():
    if not API_KEY:
        print("❌ متغير API_KEY غير موجود بـ .env")
        sys.exit(1)

    prompt = sys.argv[1] if len(sys.argv) > 1 else "مرحبا، شو اسمك؟"
    print(f"📤 إرسال إلى {API_URL}/v1/chat/completions: {prompt}")

    response = requests.post(
        f"{API_URL}/v1/chat/completions",
        headers={"X-API-Key": API_KEY},
        json={
            "model": "gemini",
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=60,
    )

    if response.status_code != 200:
        print(f"❌ فشل ({response.status_code}): {response.text}")
        sys.exit(1)

    data = response.json()
    reply = data["choices"][0]["message"]["content"]
    print(f"\n📥 الرد ({data['model']}):\n{reply}")

    if data.get("usage"):
        print(f"\n📊 استهلاك التوكنز: {data['usage']}")

    # تحقق من إحصائيات الاستخدام
    usage_response = requests.get(
        f"{API_URL}/v1/usage", headers={"X-API-Key": API_KEY}, timeout=10
    )
    if usage_response.status_code == 200:
        u = usage_response.json()
        print(
            f"📈 عدد الطلبات: {u['requests_last_minute']}/{u['rpm_limit']} بآخر دقيقة | "
            f"{u['requests_today']} اليوم"
        )


if __name__ == "__main__":
    main()
