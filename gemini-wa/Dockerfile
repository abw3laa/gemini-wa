# Phase 12: صورة Docker لـ gemini-wa (طبقة Gemini API)
FROM python:3.12-slim

WORKDIR /app

# نثبّت المكتبات أولًا لوحدها حتى Docker يستفيد من الـ cache
# (لو غيّرت الكود بدون تغيير requirements.txt، ما يعيد تثبيت المكتبات)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# بدون --reload (خاص بالتطوير فقط) - بالإنتاج نشغّل uvicorn مباشرة
CMD ["uvicorn", "app.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
