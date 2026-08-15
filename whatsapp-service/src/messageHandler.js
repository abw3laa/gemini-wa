/**
 * messageHandler.js
 *
 * مسؤولية هذا الملف: الفلترة الكاملة قبل تمرير أي رسالة للمعالجة الفعلية.
 *
 *   - تجاهل رسائلنا الخاصة (fromMe) لمنع أي loop
 *   - محادثات خاصة: تمر دائمًا
 *   - مجموعات (Phase 6): نفس قواعد groupsEnabled / allowedGroupJids / mention-prefix
 *   - أوامر إدارية (Phase 11): /help /status /train /knowledge /settings
 *     /groups - محصورة بـ config.adminJids فقط، خاص فقط
 *   - أوامر اختبار قديمة (!test-*, !kb-*): أُبقيت كـ اختصارات، لكن صارت
 *     محصورة بالإدارة أيضًا (كانت مفتوحة للجميع بـ Phase 8/10 - قُفلت الآن)
 *   - /reset: متاح للجميع (يمسح ذاكرة محادثته هو فقط - مو أمر إداري)
 *   - نصوص عادية: تُمرَّر لـ conversationQueue.enqueueMessage (Phase 5 - debounce)
 *   - صور (Phase 7): تُحمَّل عبر Baileys وتُمرَّر لـ conversationQueue.enqueueImage
 *   - أي وسائط أخرى (صوت، فيديو، PDF...): تُتجاهل بأدب الآن - خارج نطاق هذه المرحلة
 */

import pino from "pino";
import { downloadMediaMessage } from "@whiskeysockets/baileys";

import { config } from "./config.js";
import { enqueueMessage, enqueueImage } from "./conversationQueue.js";
import * as mediaService from "./mediaService.js";
import { resetMemory } from "./conversationMemory.js";
import * as knowledgeBase from "./knowledgeBase.js";
import * as adminCommands from "./adminCommands.js";
import * as botState from "./botState.js";

const downloadLogger = pino({ level: "warn" });

// حد أقصى بسيط لحجم الصورة بعد فك الترميز (بالبايت) - حماية بسيطة من صور ضخمة جدًا
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB

function extractText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    null
  );
}

function isGroupMessage(remoteJid) {
  return remoteJid?.endsWith("@g.us");
}

/**
 * يزيل جزء الجهاز من الـ JID (مثال: "123456:45@s.whatsapp.net" -> "123456@s.whatsapp.net")
 * ضروري لأن sock.user.id غالبًا فيه device suffix، بينما mentionedJid عادة بدونه.
 */
function normalizeJid(jid) {
  if (!jid) return jid;
  return jid.replace(/:\d+@/, "@");
}

function isBotMentioned(msg, sock) {
  const mentioned =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    msg.message?.imageMessage?.contextInfo?.mentionedJid ||
    [];
  const botJid = normalizeJid(sock.user?.id);
  return mentioned.some((jid) => normalizeJid(jid) === botJid);
}

function matchesPrefix(text) {
  const prefix = config.groupCommandPrefix.toLowerCase();
  return text.trim().toLowerCase().startsWith(prefix);
}

function stripPrefix(text) {
  return text.trim().slice(config.groupCommandPrefix.length).trim();
}

/**
 * أوامر !test-* (Phase 8) - صارت الآن محصورة بالإدارة (config.adminJids).
 * كانت مفتوحة لأي شخص بـ Phase 8 كخطوة مؤقتة، وهذا بالضبط ما قفلناه هون.
 *
 * الصيغة: !test-image <رابط> [تعليق اختياري]
 *         !test-document <رابط> <اسم-الملف>
 *         !test-audio <رابط>          (رسالة صوتية)
 *         !test-video <رابط> [تعليق اختياري]
 */
async function handleTestMediaCommand(sock, chatId, text) {
  const [command, ...rest] = text.trim().split(/\s+/);

  try {
    if (command === "!test-image") {
      const [url, ...captionParts] = rest;
      if (!url) return await sock.sendMessage(chatId, { text: "استخدم: !test-image <رابط> [تعليق]" });
      await mediaService.sendImage(sock, chatId, { url }, captionParts.join(" "));
      return true;
    }

    if (command === "!test-document") {
      const [url, fileName] = rest;
      if (!url || !fileName) {
        return await sock.sendMessage(chatId, { text: "استخدم: !test-document <رابط> <اسم-الملف>" });
      }
      await mediaService.sendDocument(sock, chatId, { url }, fileName);
      return true;
    }

    if (command === "!test-audio") {
      const [url] = rest;
      if (!url) return await sock.sendMessage(chatId, { text: "استخدم: !test-audio <رابط>" });
      await mediaService.sendAudio(sock, chatId, { url }, { voiceNote: true });
      return true;
    }

    if (command === "!test-video") {
      const [url, ...captionParts] = rest;
      if (!url) return await sock.sendMessage(chatId, { text: "استخدم: !test-video <رابط> [تعليق]" });
      await mediaService.sendVideo(sock, chatId, { url }, captionParts.join(" "));
      return true;
    }
  } catch (err) {
    console.error(`❌ فشل أمر اختبار الوسائط (${command}):`, err.message);
    await sock.sendMessage(chatId, { text: "فشل الإرسال، تأكد أن الرابط صحيح ويشير لملف مباشر." });
    return true; // اعتُبر معالَجًا حتى لو فشل، ما نمرره لـ Gemini
  }

  return false; // مش أمر اختبار وسائط
}

/**
 * أوامر !kb-* (Phase 10) - صارت الآن محصورة بالإدارة أيضًا. أُبقيت كـ
 * اختصارات مباشرة موازية لـ /train و/knowledge (Phase 11) لسهولة الاستخدام.
 *
 * الصيغة: !kb-add <سؤال> | <جواب>
 *         !kb-list
 *         !kb-remove <id>
 */
async function handleKnowledgeBaseCommand(sock, chatId, text) {
  const trimmed = text.trim();

  if (trimmed.startsWith("!kb-add")) {
    const rest = trimmed.slice("!kb-add".length).trim();
    const [question, answer] = rest.split("|").map((s) => s?.trim());

    if (!question || !answer) {
      await sock.sendMessage(chatId, {
        text: "استخدم: !kb-add السؤال | الجواب\nمثال: !kb-add شو سعر الموقع؟ | يبدأ من 50$",
      });
      return true;
    }

    const entry = await knowledgeBase.addEntry(question, answer);
    await sock.sendMessage(chatId, {
      text: `تم الحفظ ✅\nسؤال: ${entry.question}\nجواب: ${entry.answer}`,
    });
    console.log(`📚 أُضيف مدخل قاعدة معرفة جديد (${entry.id})`);
    return true;
  }

  if (trimmed === "!kb-list") {
    const entries = await knowledgeBase.listEntries();
    if (entries.length === 0) {
      await sock.sendMessage(chatId, { text: "قاعدة المعرفة فاضية حاليًا." });
      return true;
    }
    const list = entries
      .map((e, i) => `${i + 1}. [${e.id.slice(0, 8)}] ${e.question} → ${e.answer}`)
      .join("\n");
    await sock.sendMessage(chatId, { text: `قاعدة المعرفة (${entries.length} مدخل):\n${list}` });
    return true;
  }

  if (trimmed.startsWith("!kb-remove")) {
    const id = trimmed.slice("!kb-remove".length).trim();
    if (!id) {
      await sock.sendMessage(chatId, { text: "استخدم: !kb-remove <id> (استخدم !kb-list لمعرفة الـ id)" });
      return true;
    }
    const entries = await knowledgeBase.listEntries();
    const fullId = entries.find((e) => e.id.startsWith(id))?.id;
    const removed = fullId ? await knowledgeBase.removeEntry(fullId) : false;
    await sock.sendMessage(chatId, {
      text: removed ? "تم الحذف ✅" : "ما لقيت مدخل بهاد الـ id.",
    });
    return true;
  }

  return false;
}

/** يتحقق من شروط تفعيل الرد داخل مجموعة (mention/prefix/both). يعيد النص المعالَج (بعد حذف البادئة إن وجدت) أو null إذا لم يتحقق الشرط. */
function checkGroupTrigger(msg, sock, text) {
  const mentioned = isBotMentioned(msg, sock);
  const prefixed = text ? matchesPrefix(text) : false;

  const triggered =
    config.groupTriggerMode === "mention"
      ? mentioned
      : config.groupTriggerMode === "prefix"
      ? prefixed
      : mentioned || prefixed; // "both"

  if (!triggered) return null;
  return prefixed ? stripPrefix(text) : text;
}

async function handleImageMessage(sock, msg, chatId, isGroup) {
  const imageMsg = msg.message.imageMessage;
  let caption = imageMsg.caption || "";

  if (isGroup) {
    const processedCaption = checkGroupTrigger(msg, sock, caption);
    if (processedCaption === null) return; // لم يُطلب البوت صراحة
    caption = processedCaption;
  }

  let buffer;
  try {
    buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      { logger: downloadLogger, reuploadRequest: sock.updateMediaMessage }
    );
  } catch (err) {
    console.error(`❌ فشل تحميل صورة من ${chatId}:`, err.message);
    await sock.sendMessage(chatId, {
      text: "ما قدرت أحمّل الصورة، جرب ترسلها مرة ثانية 🙏",
    });
    return;
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    console.log(`⏭️  صورة كبيرة جدًا من ${chatId} (${buffer.length} بايت) - تجاهلناها`);
    await sock.sendMessage(chatId, { text: "الصورة كبيرة جدًا 🙏 جرب صورة أصغر." });
    return;
  }

  const mimeType = imageMsg.mimetype || "image/jpeg";
  const base64Data = buffer.toString("base64");

  console.log(`📩 من ${chatId}${isGroup ? " (مجموعة)" : ""}: [صورة]${caption ? ` "${caption}"` : ""}`);
  await enqueueImage(sock, chatId, caption, { mimeType, base64Data });
}

export async function handleIncomingMessage(sock, msg) {
  if (msg.key.fromMe) return; // منع أي loop

  const chatId = msg.key.remoteJid;
  const isGroup = isGroupMessage(chatId);

  if (isGroup) {
    if (!config.groupsEnabled) return; // المجموعات معطّلة بالكامل افتراضيًا

    if (
      config.allowedGroupJids.length > 0 &&
      !config.allowedGroupJids.includes(chatId)
    ) {
      return; // مجموعة غير مُصرّح لها
    }
  }

  // وضع الغياب (Away): البوت "مطفّي" - لا Gemini إطلاقًا. يرسل رسالة الغياب
  // الثابتة مرة واحدة فقط لكل رقم (المسيطر عليها من صفحة الويب). المدراء
  // يتجاوزون هذا الوضع حتى يبقوا قادرين على التحكم عبر أوامر WhatsApp أيضًا.
  if (botState.isAwayMode() && !(!isGroup && adminCommands.isAdmin(chatId))) {
    if (!botState.hasBeenNotified(chatId)) {
      botState.markNotified(chatId);
      await sock.sendMessage(chatId, { text: botState.getAwayMessage() });
      console.log(`💤 وضع الغياب: أرسلنا رسالة الغياب (مرة واحدة) إلى ${chatId}`);
    } else {
      console.log(`💤 وضع الغياب: ${chatId} سبق واستلم رسالة الغياب - تجاهلنا`);
    }
    return;
  }

  // Phase 7: صورة
  if (msg.message?.imageMessage) {
    await handleImageMessage(sock, msg, chatId, isGroup);
    return;
  }

  // نص عادي
  let text = extractText(msg);
  if (!text) {
    console.log(`⏭️  رسالة غير نصية من ${chatId} - تجاهلناها (خارج النطاق الحالي)`);
    return;
  }

  // Phase 11: لو هاي المحادثة بانتظار إدخال "سؤال | جواب" بعد /train لوحدها
  if (!isGroup && adminCommands.isAwaitingTrainInput(chatId)) {
    await adminCommands.handlePendingTrainInput(sock, chatId, text);
    return;
  }

  // Phase 11: أوامر الإدارة الرسمية (/help /status /train /knowledge /settings /groups /cancel)
  if (!isGroup) {
    const handled = await adminCommands.handleCommand(sock, chatId, text);
    if (handled) return;
  }

  // Phase 8/10 (اختصارات قديمة، صارت محصورة بالإدارة): !test-*, !kb-*
  if (!isGroup && text.trim().startsWith("!test-")) {
    if (!adminCommands.isAdmin(chatId)) {
      await sock.sendMessage(chatId, { text: "هذا الأمر متاح للإدارة فقط 🔒" });
      return;
    }
    const handled = await handleTestMediaCommand(sock, chatId, text);
    if (handled) return;
  }

  if (!isGroup && text.trim().startsWith("!kb-")) {
    if (!adminCommands.isAdmin(chatId)) {
      await sock.sendMessage(chatId, { text: "هذا الأمر متاح للإدارة فقط 🔒" });
      return;
    }
    const handled = await handleKnowledgeBaseCommand(sock, chatId, text);
    if (handled) return;
  }

  if (isGroup) {
    const processedText = checkGroupTrigger(msg, sock, text);
    if (processedText === null) return;
    text = processedText;
  }

  // /reset متاح للجميع (يمسح ذاكرة محادثته هو فقط - مو أمر إداري)
  if (text.trim().toLowerCase() === "/reset") {
    resetMemory(chatId);
    await sock.sendMessage(chatId, { text: "تم مسح ذاكرة المحادثة ✅ نبدأ من جديد." });
    console.log(`🧹 تم مسح ذاكرة ${chatId}`);
    return;
  }

  console.log(`📩 من ${chatId}${isGroup ? " (مجموعة)" : ""}: ${text}`);
  enqueueMessage(sock, chatId, text);
}
