"""
تطبيق FastAPI الرئيسي لـ Phase 2.
"""

from fastapi import FastAPI

from app.api.routes import router

app = FastAPI(
    title="gemini-wa API",
    description="API داخلي يربط بين Gemini والواجهات الأمامية (WhatsApp لاحقًا)",
    version="0.2.0",
)

app.include_router(router)
