/**
 * conversationQueue.js
 *
 * يحل مشكلتين أساسيتين ذكرهما المستخدم بالمواصفات الأصلية:
 *
 * 1. Debounce: لو المستخدم أرسل عدة رسائل بسرعة ("مرحبا" / "كيفك" / "سؤال")
 *    ننتظر فترة هدوء قصيرة (DEBOUNCE_MS) ثم نجمعهم بطلب واحد لـ Gemini،
 *    بدل ما نستهلك من حصة الـ RPM المحدودة (5/دقيقة) على كل رسالة لحالها.
 *
 * 2. Conversation Lock: لو وصلت رسالة جديدة من نفس الشخص أثناء ما البوت
 *    لسا عم يعالج/يرد على الدفعة السابقة، ننتظرها لحد ما تخلص المعالجة
 *    الحالية بدل ما نرسل طلبين متوازيين لنفس المحادثة (فوضى بالترتيب
 *    وهدر إضافي من حصة الـ RPM).
 *
 * كل محادثة (chatId) إلها حالة مستقلة تمامًا عن باقي المحادثات.
 */

import { config } from "./config.js";
import { chatCompletion, GeminiApiError } from "./geminiClient.js";
import * as memory from "./conversationMemory.js";
import * as knowledgeBase from "./knowledgeBase.js";

/** @type {Map<string, {buffer: string[], timer: NodeJS.Timeout|null, processing: boolean}>} */
const conversations = new Map();

function getState(chatId) {
  if (!conversations.has(chatId)) {
    conversations.set(chatId, { buffer: [], timer: null, processing: false });
  }
  return conversations.get(chatId);
}

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * يُستدعى من messageHandler لكل رسالة نصية مؤهلة.
 * لا يرسل شيء فورًا - فقط يضيف للـ buffer ويعيد ضبط مؤقّت الـ debounce.
 */
export function enqueueMessage(sock, chatId, text) {
  const state = getState(chatId);
  state.buffer.push(text);

  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => flush(chatId, sock), config.debounceMs);
}

/**
 * Phase 7: يعالج صورة واردة فورًا (بدون debounce - الصور نادرًا ما توصل
 * بسرعة متتالية زي رسائل النص)، لكن يحترم نفس قفل المحادثة (Conversation
 * Lock) لتجنب تعارضه مع دفعة نصية شغالة حاليًا لنفس المحادثة.
 */
export async function enqueueImage(sock, chatId, caption, image) {
  const state = getState(chatId);

  // ننتظر بأدب لحد ما تخلص أي معالجة نصية شغالة حاليًا لنفس المحادثة
  while (state.processing) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  state.processing = true;
  console.log(`🖼️  معالجة صورة من ${chatId}${caption ? ` (تعليق: "${caption}")` : ""}`);

  try {
    await sock.sendPresenceUpdate("composing", chatId);

    const history = memory.getHistory(chatId);

    const kbMatches = caption ? await knowledgeBase.search(caption) : [];
    const kbContext = knowledgeBase.buildContext(kbMatches);

    const reply = await chatCompletion(caption, image, history, kbContext);

    // نحفظ بالذاكرة كـ "[صورة] caption" بدل الصورة نفسها - الذاكرة نصية
    // خفيفة، مش مخزن وسائط (يبقى محتوى الصورة نفسه غير محفوظ بعد الرد)
    memory.appendUserMessage(chatId, caption ? `[صورة] ${caption}` : "[صورة]");
    memory.appendAssistantMessage(chatId, reply);

    await randomDelay(config.replyMinDelayMs, config.replyMaxDelayMs);

    await sock.sendPresenceUpdate("paused", chatId);
    await sock.sendMessage(chatId, { text: reply });

    console.log(`✅ رد على صورة من ${chatId}`);
  } catch (err) {
    await sock.sendPresenceUpdate("paused", chatId).catch(() => {});

    if (err instanceof GeminiApiError && err.statusCode === 429) {
      console.warn(`⏳ Rate limit عند الرد على صورة من ${chatId}: ${err.message}`);
      await sock.sendMessage(chatId, {
        text: "في ازدحام مؤقت حاليًا 🙏 جرب ترسل الصورة مرة ثانية بعد شوي.",
      });
    } else {
      console.error(`❌ خطأ أثناء الرد على صورة من ${chatId}:`, err.message);
      await sock.sendMessage(chatId, {
        text: "صار خطأ أثناء معالجة الصورة، جرب مرة ثانية بعد شوي 🙏",
      });
    }
  } finally {
    state.processing = false;
    if (state.buffer.length > 0) {
      state.timer = setTimeout(() => flush(chatId, sock), config.debounceMs);
    }
  }
}

async function flush(chatId, sock) {
  const state = getState(chatId);
  state.timer = null;

  // لو لسا في معالجة شغالة لهاي المحادثة، ما نعمل شي الآن -
  // الـ finally تبع تلك المعالجة رح تعيد جدولة flush جديدة لو صار في رسائل جديدة
  if (state.processing || state.buffer.length === 0) return;

  state.processing = true;
  const messages = state.buffer.splice(0); // ياخد كل الرسائل المتراكمة ويفضّي البفر
  const combinedText = messages.join("\n");

  console.log(
    `📦 معالجة دفعة من ${messages.length} رسالة/رسائل من ${chatId}: "${combinedText}"`
  );

  try {
    await sock.sendPresenceUpdate("composing", chatId);

    const history = memory.getHistory(chatId);

    // Phase 10: نبحث بقاعدة المعرفة عن معلومات ذات صلة بالسؤال قبل إرساله
    const kbMatches = await knowledgeBase.search(combinedText);
    const kbContext = knowledgeBase.buildContext(kbMatches);
    if (kbMatches.length > 0) {
      console.log(`📚 وجدنا ${kbMatches.length} مدخل/مدخلات مطابقة بقاعدة المعرفة`);
    }

    const reply = await chatCompletion(combinedText, null, history, kbContext);

    memory.appendUserMessage(chatId, combinedText);
    memory.appendAssistantMessage(chatId, reply);

    await randomDelay(config.replyMinDelayMs, config.replyMaxDelayMs);

    await sock.sendPresenceUpdate("paused", chatId);
    await sock.sendMessage(chatId, { text: reply });

    console.log(`✅ رد على ${chatId}`);
  } catch (err) {
    await sock.sendPresenceUpdate("paused", chatId).catch(() => {});

    if (err instanceof GeminiApiError && err.statusCode === 429) {
      console.warn(`⏳ Rate limit عند الرد على ${chatId}: ${err.message}`);
      await sock.sendMessage(chatId, {
        text: "في ازدحام مؤقت حاليًا 🙏 جرب ترسل رسالتك مرة ثانية بعد شوي.",
      });
    } else {
      console.error(`❌ خطأ أثناء الرد على ${chatId}:`, err.message);
      await sock.sendMessage(chatId, {
        text: "صار خطأ غير متوقع، جرب مرة ثانية بعد شوي 🙏",
      });
    }
  } finally {
    state.processing = false;

    // إذا وصلت رسائل جديدة من نفس الشخص أثناء المعالجة، نجدول دفعة جديدة
    if (state.buffer.length > 0) {
      state.timer = setTimeout(() => flush(chatId, sock), config.debounceMs);
    }
  }
}
