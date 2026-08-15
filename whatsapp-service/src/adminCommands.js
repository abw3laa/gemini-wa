/**
 * adminCommands.js
 *
 * أوامر الإدارة - Phase 11.
 *
 * كل الأوامر هنا محصورة بـ config.adminJids فقط (رقمك/أرقامك أنت).
 * هذا يقفل أخيرًا الثغرة المؤقتة اللي كانت موجودة من Phase 8 و10
 * (!test-*, !kb-*) - كانت مفتوحة لأي شخص يراسل البوت خاص.
 */

import { config } from "./config.js";
import * as knowledgeBase from "./knowledgeBase.js";
import * as memory from "./conversationMemory.js";

/** المحادثات اللي بانتظار إدخال "سؤال | جواب" بعد أمر /train بدون معطيات */
const pendingTrain = new Set();

export function isAdmin(chatId) {
  return config.adminJids.includes(chatId);
}

export function isAwaitingTrainInput(chatId) {
  return pendingTrain.has(chatId);
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h} ساعة و${m} دقيقة`;
}

const HELP_TEXT = `📋 أوامر الإدارة المتاحة:

/help - عرض هذه القائمة
/status - حالة البوت وإحصائيات سريعة
/train - إضافة معلومة لقاعدة المعرفة (تفاعلي)
/train <سؤال> | <جواب> - إضافة مباشرة
/knowledge - عرض كل قاعدة المعرفة
/knowledge remove <id> - حذف مدخل
/settings - عرض الإعدادات الحالية
/groups - عرض المجموعات المفعّلة
/cancel - إلغاء عملية /train الحالية

ملاحظة: /reset متاح للجميع (يمسح ذاكرة محادثته هو فقط)، مو أمر إداري.`;

async function handleStatus(sock, chatId) {
  const kbCount = (await knowledgeBase.listEntries()).length;
  const activeChats = memory.activeConversationsCount();

  const text = `📊 حالة البوت:

⏱️ مدة التشغيل: ${formatUptime(process.uptime())}
💬 محادثات نشطة بالذاكرة: ${activeChats}
📚 مدخلات قاعدة المعرفة: ${kbCount}
👥 المجموعات: ${config.groupsEnabled ? "مفعّلة" : "معطّلة"}
🔑 وضع التفعيل بالمجموعات: ${config.groupTriggerMode}
⏳ Debounce: ${config.debounceMs}ms
🧠 حد الذاكرة: ${config.memoryMaxMessages} رسالة/محادثة`;

  await sock.sendMessage(chatId, { text });
}

async function handleTrainDirect(sock, chatId, rest) {
  const [question, answer] = rest.split("|").map((s) => s?.trim());
  if (!question || !answer) {
    await sock.sendMessage(chatId, {
      text: 'صيغة غير صحيحة. استخدم: /train السؤال | الجواب\nأو أرسل "/train" لوحدها وبمشيك خطوة بخطوة.',
    });
    return;
  }
  const entry = await knowledgeBase.addEntry(question, answer);
  await sock.sendMessage(chatId, {
    text: `تم الحفظ ✅\nسؤال: ${entry.question}\nجواب: ${entry.answer}`,
  });
}

async function handleTrainStart(sock, chatId) {
  pendingTrain.add(chatId);
  await sock.sendMessage(chatId, {
    text: 'تفضل، أرسل المعلومة بصيغة:\nالسؤال أو الموضوع | الجواب المطلوب\n\nمثال: شو سعر الموقع؟ | يبدأ من 50$\n\n(أو "/cancel" للإلغاء)',
  });
}

/** يُستدعى من messageHandler لما تكون المحادثة بانتظار إدخال تدريب (بعد /train لوحدها) */
export async function handlePendingTrainInput(sock, chatId, text) {
  if (text.trim().toLowerCase() === "/cancel") {
    pendingTrain.delete(chatId);
    await sock.sendMessage(chatId, { text: "تم الإلغاء." });
    return;
  }

  const [question, answer] = text.split("|").map((s) => s?.trim());
  if (!question || !answer) {
    await sock.sendMessage(chatId, {
      text: 'الصيغة لازم تكون: السؤال | الجواب (بفاصل |). جرب مرة ثانية، أو "/cancel" للإلغاء.',
    });
    return; // يبقى بانتظار محاولة صحيحة
  }

  pendingTrain.delete(chatId);
  const entry = await knowledgeBase.addEntry(question, answer);
  await sock.sendMessage(chatId, {
    text: `تم الحفظ ✅\nسؤال: ${entry.question}\nجواب: ${entry.answer}`,
  });
}

async function handleKnowledgeCommand(sock, chatId, rest) {
  if (rest.startsWith("remove ")) {
    const id = rest.slice("remove ".length).trim();
    const entries = await knowledgeBase.listEntries();
    const fullId = entries.find((e) => e.id.startsWith(id))?.id;
    const removed = fullId ? await knowledgeBase.removeEntry(fullId) : false;
    await sock.sendMessage(chatId, { text: removed ? "تم الحذف ✅" : "ما لقيت مدخل بهاد الـ id." });
    return;
  }

  const entries = await knowledgeBase.listEntries();
  if (entries.length === 0) {
    await sock.sendMessage(chatId, { text: "قاعدة المعرفة فاضية حاليًا. استخدم /train لإضافة معلومات." });
    return;
  }
  const list = entries
    .map((e, i) => `${i + 1}. [${e.id.slice(0, 8)}] ${e.question} → ${e.answer}`)
    .join("\n");
  await sock.sendMessage(chatId, { text: `قاعدة المعرفة (${entries.length} مدخل):\n${list}` });
}

async function handleSettings(sock, chatId) {
  const text = `⚙️ الإعدادات الحالية (للتعديل: عدّل .env وأعد تشغيل السيرفر):

طريقة الربط: ${config.linkMethod}
المجموعات: ${config.groupsEnabled ? "مفعّلة" : "معطّلة"}
مجموعات مسموحة محددة: ${config.allowedGroupJids.length || "الكل (بدون تحديد)"}
وضع تفعيل المجموعات: ${config.groupTriggerMode}
بادئة الأوامر بالمجموعات: ${config.groupCommandPrefix}
Debounce: ${config.debounceMs}ms
حد الذاكرة: ${config.memoryMaxMessages} رسالة/محادثة
نتائج قاعدة المعرفة بكل طلب: ${config.knowledgeBaseMaxResults}
عدد المدراء: ${config.adminJids.length}`;

  await sock.sendMessage(chatId, { text });
}

async function handleGroups(sock, chatId) {
  const text = `👥 إعدادات المجموعات:

الحالة: ${config.groupsEnabled ? "مفعّلة" : "معطّلة"}
وضع التفعيل: ${config.groupTriggerMode}
${config.groupTriggerMode !== "mention" ? `البادئة: ${config.groupCommandPrefix}\n` : ""}المجموعات المحددة: ${
    config.allowedGroupJids.length > 0 ? config.allowedGroupJids.join("\n") : "كل المجموعات مسموحة (بدون تحديد)"
  }`;

  await sock.sendMessage(chatId, { text });
}

/**
 * نقطة الدخول الرئيسية - يُستدعى لأي رسالة خاصة تبدأ بأمر إداري (/help,
 * /status, /train, /knowledge, /settings, /groups). يتحقق من الصلاحية
 * أولًا؛ لو مش مدير، يرفض بأدب بدل ما يمرر الرسالة لـ Gemini كأنها سؤال عادي.
 *
 * يرجع true لو تعرّف على الأمر (سواء نُفّذ أو رُفض) - false لو مش أمر إداري إطلاقًا.
 */
export async function handleCommand(sock, chatId, text) {
  const trimmed = text.trim();
  const [command] = trimmed.split(/\s+/);
  const rest = trimmed.slice(command.length).trim();

  const adminCommands = ["/help", "/status", "/train", "/knowledge", "/settings", "/groups", "/cancel"];
  if (!adminCommands.includes(command.toLowerCase())) return false;

  if (!isAdmin(chatId)) {
    await sock.sendMessage(chatId, { text: "هذا الأمر متاح للإدارة فقط 🔒" });
    return true;
  }

  switch (command.toLowerCase()) {
    case "/help":
      await sock.sendMessage(chatId, { text: HELP_TEXT });
      return true;

    case "/status":
      await handleStatus(sock, chatId);
      return true;

    case "/train":
      if (rest) {
        await handleTrainDirect(sock, chatId, rest);
      } else {
        await handleTrainStart(sock, chatId);
      }
      return true;

    case "/knowledge":
      await handleKnowledgeCommand(sock, chatId, rest);
      return true;

    case "/settings":
      await handleSettings(sock, chatId);
      return true;

    case "/groups":
      await handleGroups(sock, chatId);
      return true;

    case "/cancel":
      pendingTrain.delete(chatId);
      await sock.sendMessage(chatId, { text: "ما في شي جاري حاليًا للإلغاء." });
      return true;
  }

  return false;
}
