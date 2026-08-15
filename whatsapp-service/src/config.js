/**
 * إعدادات خدمة WhatsApp.
 * كل شيء يُقرأ من متغيرات البيئة فقط.
 */

import "dotenv/config";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `متغير البيئة '${name}' غير موجود. تأكد من إعداده في ملف .env (راجع .env.example).`
    );
  }
  return value;
}

export const config = {
  // "qr" أو "pairing"
  linkMethod: (process.env.WHATSAPP_LINK_METHOD || "qr").toLowerCase(),

  // مطلوب فقط إذا linkMethod = "pairing". بصيغة دولية بدون + وبدون مسافات
  // مثال: رقم سوري 0912345678 يصير 963912345678
  phoneNumber: process.env.WHATSAPP_PHONE_NUMBER || null,

  // مجلد حفظ جلسة WhatsApp (لا يُرفع على GitHub - محمي بـ .gitignore)
  authDir: process.env.WHATSAPP_AUTH_DIR || "./auth_info_baileys",

  // إعدادات الاتصال بـ API الخاص فينا (Phase 2)
  apiUrl: process.env.GEMINI_API_URL || "http://127.0.0.1:8000",
  get apiKey() {
    return requireEnv("GEMINI_API_INTERNAL_KEY");
  },

  // تأخير عشوائي بسيط قبل الرد (بالميلي ثانية) - حتى ما يبدو الرد آلي 100%
  // (نفس الاحتياط اللي اتفقنا عليه لتقليل خطر رصد أنظمة مكافحة الإساءة عند WhatsApp)
  replyMinDelayMs: parseInt(process.env.REPLY_MIN_DELAY_MS || "1200", 10),
  replyMaxDelayMs: parseInt(process.env.REPLY_MAX_DELAY_MS || "3500", 10),

  // Phase 5: فترة انتظار الهدوء قبل تجميع الرسائل المتتالية بطلب واحد
  // (القيمة الافتراضية بمنتصف المدى المقترح بالمواصفات: 1-3 ثوانٍ)
  debounceMs: parseInt(process.env.DEBOUNCE_MS || "2000", 10),

  // ============================================
  // Phase 6: فلترة المجموعات المتقدمة
  // ============================================

  // تفعيل الرد على المجموعات (افتراضيًا معطّل بالكامل - خاص فقط)
  groupsEnabled:
    (process.env.GROUPS_ENABLED ?? process.env.RESPOND_TO_GROUPS ?? "false")
      .toLowerCase() === "true",

  // قائمة الـ JIDs المسموحة (مفصولة بفواصل). فاضية = كل المجموعات مسموحة
  // (طالما groupsEnabled=true)، لكن يبقى شرط mention/prefix ساري دائمًا.
  allowedGroupJids: (process.env.ALLOWED_GROUP_JIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // "mention" (يجب أن يُذكر البوت بـ @)، "prefix" (يجب أن تبدأ الرسالة ببادئة معينة)،
  // أو "both" (يكفي أي منهما)
  groupTriggerMode: (process.env.GROUP_TRIGGER_MODE || "mention").toLowerCase(),

  // البادئة المستخدمة عند GROUP_TRIGGER_MODE=prefix أو both
  groupCommandPrefix: process.env.GROUP_COMMAND_PREFIX || "!ai",

  // ============================================
  // Phase 9: ذاكرة المحادثة
  // ============================================
  // أقصى عدد رسائل (مستخدم + بوت مع بعض) تُحفظ لكل محادثة. الأقدم يُحذف
  // تلقائيًا. رقم صغير عمدًا الآن - ذاكرة بسيطة، مو معقدة (زي ما اتفقنا).
  memoryMaxMessages: parseInt(process.env.MEMORY_MAX_MESSAGES || "20", 10),

  // ============================================
  // Phase 10: قاعدة المعرفة (Knowledge Base)
  // ============================================
  // ملف JSON محلي لتخزين قاعدة المعرفة - يبقى موجود حتى بعد إعادة تشغيل
  // السيرفر (بعكس ذاكرة المحادثة اللي تُصفّر عمدًا). لا حاجة لقاعدة بيانات
  // حقيقية بهذا الحجم من البيانات (عشرات/مئات المدخلات لبوت شخصي).
  knowledgeBaseFile: process.env.KNOWLEDGE_BASE_FILE || "./data/knowledge.json",

  // أقصى عدد مدخلات من قاعدة المعرفة تُرفق كسياق بكل طلب لـ Gemini
  knowledgeBaseMaxResults: parseInt(process.env.KNOWLEDGE_BASE_MAX_RESULTS || "3", 10),

  // ============================================
  // Phase 11: Admin Commands
  // ============================================
  // قائمة JIDs المالك/المدراء المصرح لهم بأوامر الإدارة (!test-*, !kb-*,
  // /train, /status...). مفصولة بفواصل. القيمة بالضبط زي ما تظهر بالـ
  // terminal لما ترسل رسالة (مثال: "9639xxxxxxxxx@s.whatsapp.net" أو
  // صيغة "@lid" الأحدث - راجع الـ README لشرح كيف تعرف الـ JID تبعك).
  adminJids: (process.env.ADMIN_JIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function validateConfig() {
  if (!["qr", "pairing"].includes(config.linkMethod)) {
    throw new Error(
      `WHATSAPP_LINK_METHOD يجب أن يكون 'qr' أو 'pairing'، وليس '${config.linkMethod}'`
    );
  }
  if (config.linkMethod === "pairing" && !config.phoneNumber) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER مطلوب عند استخدام WHATSAPP_LINK_METHOD=pairing"
    );
  }
  if (!["mention", "prefix", "both"].includes(config.groupTriggerMode)) {
    throw new Error(
      `GROUP_TRIGGER_MODE يجب أن يكون 'mention' أو 'prefix' أو 'both'، وليس '${config.groupTriggerMode}'`
    );
  }
}
