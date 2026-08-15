# gemini-wa (طبقة Gemini API)

طبقة Python/FastAPI مستقلة تتصل بـ Gemini API الرسمي وتعرّض
`/v1/chat/completions` محمي بمفتاح داخلي. للتوثيق الشامل للمشروع
بالكامل (تثبيت، تشغيل، تدريب البوت)، راجع `README.md` بجذر المشروع.

## البنية

```
app/
├── gemini/
│   ├── base.py                 # الواجهة المجردة GeminiProvider
│   ├── gemini_api_provider.py  # التنفيذ الفعلي عبر API الرسمي (google-genai)
│   └── exceptions.py           # أخطاء موحّدة (rate limit, auth, timeout...)
├── api/
│   ├── app.py                  # تطبيق FastAPI الرئيسي
│   ├── routes.py                # /v1/chat/completions, /v1/usage, /health
│   ├── auth.py                  # التحقق من X-API-Key
│   ├── schemas.py                # نماذج الطلب/الرد
│   └── dependencies.py           # singletons (gemini client, rate limiter...)
├── config/
│   └── settings.py              # قراءة الإعدادات من .env فقط
└── core/
    ├── usage_tracker.py         # عدّاد طلبات بسيط
    └── rate_limiter.py          # ينتظر بذكاء بدل ما يفشل عند تجاوز RPM
```

## التشغيل السريع

```bash
python -m venv venv
venv\Scripts\Activate.ps1   # Windows / source venv/bin/activate على macOS-Linux
pip install -r requirements.txt
cp .env.example .env        # ثم عبّي GEMINI_API_KEY و API_KEY

uvicorn app.api.app:app --reload
```

اختبار يدوي (بدون مرور عبر الـ API - اتصال مباشر بـ Gemini):
```bash
python main.py "مرحبا"
```

اختبار عبر الـ API نفسه (السيرفر لازم يكون شغال بترمنال منفصل):
```bash
python test_api.py "مرحبا"
```

اختبارات الوحدة (لا تحتاج API key ولا شبكة):
```bash
pytest tests/
```

## نقاط API

| Endpoint | الوصف |
|---|---|
| `POST /v1/chat/completions` | نقطة الدخول الرئيسية - محمية بـ `X-API-Key` |
| `GET /v1/usage` | إحصائيات استهلاك الطلبات - محمية بـ `X-API-Key` |
| `GET /health` | فحص حياة السيرفر - بدون حماية (لمنصات الاستضافة) |
| `GET /docs` | توثيق تفاعلي تلقائي من FastAPI |

## متغيرات البيئة الأساسية

راجع `.env.example` للقائمة الكاملة مع الشرح. الأهم:

- `GEMINI_API_KEY` - من [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- `API_KEY` - مفتاح داخلي من اختراعك، يحمي الـ API من الاستخدام غير المصرح
- `GEMINI_MODEL` - افتراضيًا `gemini-3.6-flash` (حدّثه لو تقاعد)
- `GEMINI_RPM_LIMIT` - الحد الفعلي المسموح من Gemini بالدقيقة (راجع AI Studio)

## ملاحظات تصميم

- **التاريخ/الوقت الحقيقي** يُحقن تلقائيًا بكل طلب (system instruction) -
  النموذج ما عنده ساعة حقيقية، وبدون هذا ممكن يخمّن تاريخ قديم
- **RateLimiter** ينتظر بذكاء بدل ما يرفض فورًا عند تجاوز حد الدقيقة -
  هذا يحل مشكلة "توقف بعد عدة رسائل" الشائعة بالحدود المجانية الضيقة
- **الحد اليومي غير متتبَّع** حاليًا (فقط حد الدقيقة) - راجع `README.md`
  الرئيسي بجذر المشروع لقسم "قيود معروفة"
