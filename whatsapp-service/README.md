# whatsapp-service (طبقة WhatsApp)

خدمة Node.js/Baileys تربط حساب WhatsApp الشخصي وتدير كل منطق البوت
(فلترة، تجميع رسائل، ذاكرة، قاعدة معرفة، أوامر إدارية). للتوثيق الشامل
للمشروع بالكامل (تثبيت، تشغيل، **تدريب البوت**)، راجع `README.md` بجذر
المشروع - القسم الأهم "وين أعلّم البوت كيف يرد؟" موجود هناك.

## البنية

```
src/
├── index.js               # نقطة الدخول - اتصال Baileys، QR/Pairing، تجاهل backlog
├── config.js               # كل الإعدادات من .env
├── messageHandler.js        # الفلترة الكاملة (مجموعات، أوامر، صور، نص)
├── conversationQueue.js      # Debounce + Conversation Lock + استدعاء Gemini
├── conversationMemory.js      # ذاكرة محادثة مؤقتة لكل رقم
├── knowledgeBase.js            # قاعدة معرفة دائمة (JSON) + بحث بالكلمات المفتاحية
├── adminCommands.js             # /help /status /train /knowledge /settings /groups
├── mediaService.js               # إرسال وسائط (صور/مستندات/صوت/فيديو)
└── geminiClient.js                # HTTP client لطبقة gemini-wa (Python)
```

## التشغيل السريع

```bash
npm install
cp .env.example .env
```

عبّي بـ `.env` **على الأقل**:
```
GEMINI_API_INTERNAL_KEY=<نفس API_KEY من مشروع gemini-wa بالضبط>
WHATSAPP_LINK_METHOD=qr
```

```bash
npm start
```

امسح QR من هاتفك، ثم حدد نفسك كمدير (`ADMIN_JIDS`) حسب الشرح بـ
`README.md` الرئيسي - **بدونها ولا أمر إداري رح يشتغل**.

## تدفق معالجة رسالة واردة (بالترتيب)

1. تجاهل لو `fromMe` (منع loop)
2. فلترة المجموعات (`groupsEnabled`, `allowedGroupJids`)
3. لو صورة → تحميل عبر Baileys → Gemini Vision
4. لو بانتظار إدخال `/train` → معالجة كمدخل تدريب
5. أوامر إدارية (`/help`, `/status`, `/train`...) - محصورة بـ `ADMIN_JIDS`
6. أوامر قديمة (`!test-*`, `!kb-*`) - نفس الحصر
7. تفعيل المجموعة (mention/prefix) لو الرسالة من مجموعة
8. `/reset` (متاح للجميع)
9. تجميع نصي (debounce) → قاعدة معرفة (RAG) → ذاكرة → Gemini → رد

## اختبارات الوحدة

```bash
node tests/test_memory.js
```
(بدون شبكة أو API key)

## متغيرات البيئة الأساسية

راجع `.env.example` للقائمة الكاملة. الأهم:

- `GEMINI_API_INTERNAL_KEY` - يطابق `API_KEY` بمشروع `gemini-wa`
- `ADMIN_JIDS` - JID رقمك (كيفية معرفته موضّحة بـ `.env.example` والـ README الرئيسي)
- `WHATSAPP_LINK_METHOD` - `qr` أو `pairing`
- `GROUPS_ENABLED` - افتراضيًا `false` (خاص فقط)
- `DEBOUNCE_MS`, `MEMORY_MAX_MESSAGES` - قابلين للتعديل حسب الحاجة

## ملاحظات تصميم

- **Debounce**: رسائل متتالية بفارق أقل من `DEBOUNCE_MS` تُجمع بطلب Gemini
  واحد بدل استهلاك حصة RPM على كل رسالة لحالها
- **Conversation Lock**: لا يعالج طلبين متوازيين لنفس المحادثة
- **تجاهل Backlog**: أي رسالة أقدم من لحظة تشغيل السيرفر (+30 ثانية هامش)
  تُتجاهل - يمنع الرد على رسائل قديمة معاد تسليمها بعد إعادة الاتصال
- **قاعدة المعرفة**: بحث بالكلمات المفتاحية (مو embeddings)، تخزين دائم
  بملف `data/knowledge.json`
- **الذاكرة**: بالذاكرة المؤقتة فقط، تُصفّر عند إعادة تشغيل السيرفر (مقصود)
