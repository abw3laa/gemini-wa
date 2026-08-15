/**
 * whatsapp-service - Phase 4
 *
 * يربط الرسائل الواردة من WhatsApp بـ Gemini API (مشروع gemini-wa بايثون)
 * ويرسل الرد فعليًا. القواعد: خاص فقط (بدون مجموعات افتراضيًا)، بدون رد
 * على رسائلنا، وتأخير طبيعي بسيط قبل كل رد.
 */

import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";

import { config, validateConfig } from "./config.js";
import { handleIncomingMessage } from "./messageHandler.js";
import * as botState from "./botState.js";
import { startWebServer } from "./webServer.js";
import { connectMongo, isMongoEnabled } from "./db.js";
import { useMongoAuthState } from "./mongoAuthState.js";

// وقت بدء تشغيل هذا السيرفر - أي رسالة "واصلة" بتاريخ أقدم من هذا (مع هامش
// بسيط للتساهل مع فروق التوقيت) هي غالبًا backlog قديم يعيد WhatsApp تسليمه
// عند إعادة الاتصال، وليست رسالة جديدة فعليًا. نتجاهلها لمنع الرد على
// أسئلة قديمة منسية وكأنها وصلت الآن.
const STARTUP_TIMESTAMP_SECONDS = Math.floor(Date.now() / 1000);
const BACKLOG_GRACE_SECONDS = 30;

const logger = pino({ level: "warn" });

// مرجع مشترك للـ socket الحالي - يتغيّر عند كل إعادة اتصال، لكن لوحة الويب
// تحتاج دائمًا أحدث نسخة منه لإرسال الرسائل اليدوية.
let currentSock = null;

// دالة مسح الجلسة (تُضبط حسب مصدر التخزين: Mongo أو ملفات)
let clearAuthState = null;

async function start() {
  validateConfig();

  // نتصل بـ Mongo أولًا (إن ضُبط MONGODB_URI) قبل تحميل أي حالة تعتمد عليه
  if (isMongoEnabled()) {
    await connectMongo();
  }

  const loaded = await botState.loadState();

  console.log("🔧 إعدادات الربط:");
  console.log(`   الطريقة: ${config.linkMethod === "qr" ? "QR Code" : "Pairing Code"}`);
  console.log(`   التخزين: ${isMongoEnabled() ? "MongoDB (جلسة دائمة)" : `ملفات محلية (${config.authDir})`}`);
  console.log(`   وضع البوت الحالي: ${loaded.mode === "away" ? "إيقاف (رسالة غياب فقط)" : "مُشغّل (رد ذكي)"}`);

  let state, saveCreds;
  if (isMongoEnabled()) {
    const mongoAuth = await useMongoAuthState(
      (await connectMongo()),
      process.env.WHATSAPP_SESSION_ID || "default"
    );
    state = mongoAuth.state;
    saveCreds = mongoAuth.saveCreds;
    clearAuthState = mongoAuth.clearState;
  } else {
    const fileAuth = await useMultiFileAuthState(config.authDir);
    state = fileAuth.state;
    saveCreds = fileAuth.saveCreds;
    clearAuthState = null;
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu("gemini-wa"),
    // مهم: نطلب QR نصي عبر connection.update بدل الاعتماد على printQRInTerminal
    // (الخيار القديم لم يعد مدعومًا في إصدارات Baileys الحديثة)
  });

  currentSock = sock; // حدّث المرجع المشترك حتى تستخدمه لوحة الويب

  // إذا كانت الطريقة المطلوبة pairing وما زلنا غير مسجّلين، نطلب الكود
  if (config.linkMethod === "pairing" && !sock.authState.creds.registered) {
    // ننتظر لحظة قصيرة حتى يجهز الـ socket قبل طلب الكود
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(config.phoneNumber);
        console.log("\n📱 كود الربط (Pairing Code):");
        console.log(`\n   ${code}\n`);
        console.log(
          "   من هاتفك: WhatsApp → الأجهزة المرتبطة → ربط جهاز → الربط برقم الهاتف بدلًا من ذلك"
        );
        console.log("   أدخل الكود أعلاه هناك.\n");
      } catch (err) {
        console.error("❌ فشل طلب كود الربط:", err.message);
        console.error(
          "   تأكد أن WHATSAPP_PHONE_NUMBER صحيح وبصيغة دولية بدون + (مثال: 963912345678)"
        );
      }
    }, 3000);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && config.linkMethod === "qr") {
      console.log("\n📷 امسح كود QR هذا من WhatsApp على هاتفك:");
      console.log("   (الأجهزة المرتبطة → ربط جهاز → مسح QR)\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        console.log(
          "\n🔴 تم تسجيل الخروج من الحساب (loggedOut)."
        );
        // نمسح الجلسة المحفوظة (Mongo أو ملفات) حتى تبدأ إعادة ربط نظيفة
        if (clearAuthState) {
          clearAuthState()
            .then(() => console.log("🧹 مُسحت جلسة Mongo. أعد النشر/التشغيل للحصول على QR جديد."))
            .catch((e) => console.error("⚠️ فشل مسح جلسة Mongo:", e.message));
        } else {
          console.log("   احذف مجلد الجلسة وأعد الربط من جديد.");
        }
      } else {
        console.log(`\n🟡 انقطع الاتصال (سبب: ${statusCode || "غير معروف"}). إعادة المحاولة...`);
        start();
      }
    } else if (connection === "open") {
      console.log("\n✅ تم الاتصال بنجاح! حساب WhatsApp مربوط.");
      console.log("   الجلسة محفوظة - لن تحتاج QR/Pairing Code في المرات القادمة.\n");
    }
  });

  // Phase 4: كل رسالة واردة مؤهلة (خاصة، نصية، مش منا) تُمرَّر لـ Gemini API
  // ويُرسل ردها فعليًا. المعالجة async لكل رسالة على حدة، بدون انتظار
  // واحدة قبل استقبال التانية (الحماية من overload موجودة بـ RateLimiter
  // على مستوى API نفسه - Phase 2).
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      // تجاهل backlog قديم (رسائل بتاريخ أقدم من بدء تشغيل هذا السيرفر)
      const msgTimestamp = Number(msg.messageTimestamp) || 0;
      if (msgTimestamp > 0 && msgTimestamp < STARTUP_TIMESTAMP_SECONDS - BACKLOG_GRACE_SECONDS) {
        console.log(
          `⏭️  تجاهلنا رسالة قديمة (backlog) من ${msg.key.remoteJid} بتاريخ ${new Date(msgTimestamp * 1000).toLocaleString("ar")}`
        );
        continue;
      }

      handleIncomingMessage(sock, msg).catch((err) => {
        console.error("❌ خطأ غير متوقع بمعالجة رسالة:", err);
      });
    }
  });
}

start().catch((err) => {
  console.error("❌ فشل بدء تشغيل خدمة WhatsApp:", err);
  process.exit(1);
});

// لوحة التحكم بالويب تُشغّل مرة واحدة فقط (خارج دورة إعادة الاتصال). تمرر
// دالة تعيد أحدث نسخة من الـ socket حتى تبقى صالحة بعد أي إعادة اتصال.
startWebServer(() => currentSock);
