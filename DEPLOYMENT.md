# دليل الرفع على Render - Phase 12

⚠️ **قبل ما تبدأ**: أسعار Render تغيّرت بشكل جذري بتاريخ 23 أبريل 2026
(نظام جديد كليًا). المعلومات هون عن **الآلية التقنية** (كيف تربط disk،
كيف تظبط env vars) دقيقة ومستقرة، لكن **أي رقم سعر تشوفه هون قد يكون
غير دقيق** - تأكد من https://render.com/pricing مباشرة قبل ما تلتزم
بأي خطة.

## نظرة عامة على البنية

رح نرفع **خدمتين منفصلتين** على Render (كل واحدة Web Service لحالها،
Docker runtime):

1. **gemini-wa** (Python/FastAPI) - عامة الوصول عبر رابط Render، لكن
   محمية بـ `API_KEY` الداخلي
2. **whatsapp-service** (Node/Baileys) - بتتصل بـ gemini-wa عبر رابطها
   العام، وبتحتاج **قرص دائم (Persistent Disk)** لحفظ جلسة WhatsApp
   وقاعدة المعرفة

```
[متصفحك/GitHub] → Render يبني الصورتين من Dockerfile كل وحدة
                          ↓                    ↓
                   gemini-wa (رابط عام)   whatsapp-service (+ قرص دائم)
                          ↑____________________|
                       (تتواصل عبر HTTP بـ X-API-Key)
```

## الخطوة 0: تأكد إنه الكود مرفوع على GitHub

Render بيربط مباشرة بـ repo GitHub ويبني منه تلقائيًا عند كل push. تأكد
إنه المشروع (المجلدين `gemini-wa` و `whatsapp-service`) مرفوع على
`https://github.com/abw3laa/gemini-wa` (أو الـ repo تبعك)، وإنه ملفات
`.env` **غير موجودة** بالـ repo (تحقق زي ما عملنا سابقًا).

## الخطوة 1: رفع gemini-wa (Python API)

1. من Render Dashboard: **New → Web Service**
2. اربط الـ GitHub repo تبعك
3. **Root Directory**: `gemini-wa` (مهم - المشروع فيه مجلدين، Render لازم
   يعرف وين يبني بالضبط)
4. **Runtime**: Docker (لازم يكتشف `Dockerfile` تلقائيًا بما إنه موجود)
5. **Environment Variables** (من لوحة Render، مو من ملف .env):
   ```
   GEMINI_API_KEY=<مفتاحك من AI Studio>
   API_KEY=<نفس القيمة يلي عندك محليًا>
   GEMINI_MODEL=gemini-3.6-flash
   GEMINI_RPM_LIMIT=5
   RATE_LIMIT_MAX_WAIT_SECONDS=45
   ```
6. اضغط **Deploy**
7. بعد نجاح البناء، Render رح يديك رابط عام زي:
   `https://gemini-wa-xxxx.onrender.com`
   **احفظه** - رح تحتاجه بالخطوة الجاية

### هل يحتاج persistent disk؟ لأ
الـ Python API عديم الحالة (stateless) - كل شي بالذاكرة المؤقتة أو
يُعاد حسابه بكل طلب. ما في داعي لأي قرص دائم هون.

## الخطوة 2: رفع whatsapp-service (Node)

1. **New → Web Service** تاني
2. نفس الـ repo
3. **Root Directory**: `whatsapp-service`
4. **Runtime**: Docker
5. **Environment Variables**:
   ```
   WHATSAPP_LINK_METHOD=pairing
   WHATSAPP_PHONE_NUMBER=<رقمك بصيغة دولية بدون +>
   GEMINI_API_URL=<الرابط اللي حفظته من الخطوة 1>
   GEMINI_API_INTERNAL_KEY=<نفس قيمة API_KEY بالضبط>
   ADMIN_JIDS=<الـ JID تبعك من الاختبار المحلي>
   GROUPS_ENABLED=false
   MEMORY_MAX_MESSAGES=20
   ```
   💡 **استخدم `pairing` مو `qr` هون** - أسهل بكثير من محاولة تشوف QR
   جوا لوج سيرفر بعيد. الكود تبع Phase 3 (`console.log` بالكود) بيطبع
   كود الربط بالـ **Logs** تبع Render، وبتدخله من هاتفك عاديًا.

6. **⚠️ خطوة حرجة - أضف Persistent Disk** (قبل أول Deploy لو أمكن):
   - بصفحة إعداد الخدمة، لاقي قسم **Disks** أو **Advanced → Add Disk**
   - **Mount Path**: `/data`
   - **Size**: 1GB كافي جدًا (جلسة WhatsApp + ملف JSON صغير)
   - أضف كمان env vars:
     ```
     WHATSAPP_AUTH_DIR=/data/auth_info_baileys
     KNOWLEDGE_BASE_FILE=/data/knowledge.json
     ```
   بدون هالخطوة: **كل إعادة نشر (redeploy) = جلسة WhatsApp تضيع وقاعدة
   المعرفة تُمسح بالكامل**، لازم تعيد الربط من الصفر (Pairing Code جديد)
   وتفقد كل شي علّمته البوت. هاي أهم خطوة بكل هالمرحلة.

7. اضغط **Deploy**، راقب **Logs**، لما يطلع كود الربط أدخله من هاتفك
   (نفس خطوات Phase 3 بالضبط، بس اللوج هلق بمتصفح Render مو ترمينالك)

## الخطوة 3: تأكيد الخطة المناسبة (بخصوص النوم/Sleep)

زي ما حكينا بأول المشروع: خدمة تحتاج تبقى متصلة بشكل دائم (WebSocket
مفتوح مع WhatsApp) **ما تتحمل النوم/Sleep** - أي انقطاع يعني فقدان
الاتصال بـ WhatsApp واحتمال حتى إعادة ربط.

- **whatsapp-service**: يحتاج خطة **بدون نوم** إجباريًا (تأكد من صفحة
  Render الحالية أي خطة توفر هالميزة + تدعم Persistent Disk سوا -
  الاتنين مرتبطين ببعض عادة بخطط Render)
- **gemini-wa**: أقل حساسية (لو نام لثوانٍ، أول رد بعد فترة خمول رح
  ياخد وقت أطول شوي بس ما رح ينقطع اتصال دائم زي التاني) - ممكن تبدأ
  بخطة أوفر هون لو متوفرة، وترقّي لو لاحظت تأخير مزعج

## الاختبار النهائي

1. تأكد الاثنين "Live" بلوحة Render
2. من رقم تاني، أرسل رسالة خاصة للبوت
3. راقب **Logs** تبع whatsapp-service - المفروض تشوف نفس الرسائل يلي
   كنت تشوفها محليًا (`📩 من ...`, `✅ رد على ...`)
4. أعد نشر (**Manual Deploy**) خدمة whatsapp-service عمدًا، وتأكد بعد
   النشر إنه **ما طلب ربط جديد** (يعني الـ Persistent Disk شغال صح)

## بعد الرفع: الفرق عن التشغيل المحلي

- ما تحتاج تخلي الكمبيوتر مفتوح ولا PowerShell شغال - البوت شغال 24/7
  على سيرفر Render
- أي تعديل على الكود: `git push` لـ GitHub، Render بيعيد البناء والنشر
  تلقائيًا (لو فعّلت Auto-Deploy)
- المراقبة والصيانة تصير عبر لوحة Render (Logs, Metrics) بدل الترمينال المحلي
