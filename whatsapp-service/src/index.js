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

// وقت بدء تشغيل هذا السيرفر - أي رسالة "واصلة" بتاريخ أقدم من هذا (مع هامش
// بسيط للتساهل مع فروق التوقيت) هي غالبًا backlog قديم يعيد WhatsApp تسليمه
// عند إعادة الاتصال، وليست رسالة جديدة فعليًا. نتجاهلها لمنع الرد على
// أسئلة قديمة منسية وكأنها وصلت الآن.
const STARTUP_TIMESTAMP_SECONDS = Math.floor(Date.now() / 1000);
const BACKLOG_GRACE_SECONDS = 30;

const logger = pino({ level: "warn" });

async function start() {
  validateConfig();

  console.log("🔧 إعدادات الربط:");
  console.log(`   الطريقة: ${config.linkMethod === "qr" ? "QR Code" : "Pairing Code"}`);
  console.log(`   مجلد الجلسة: ${config.authDir}`);

  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu("gemini-wa"),
    // مهم: نطلب QR نصي عبر connection.update بدل الاعتماد على printQRInTerminal
    // (الخيار القديم لم يعد مدعومًا في إصدارات Baileys الحديثة)
  });

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
          "\n🔴 تم تسجيل الخروج من الحساب (loggedOut). احذف مجلد الجلسة وأعد الربط من جديد."
        );
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
