/**
 * conversationMemory.js
 *
 * ذاكرة محادثة بسيطة لكل chatId (رقم خاص أو مجموعة) - Phase 9.
 *
 * مبدأ التصميم (زي ما اتفقنا بالمواصفات): نبدأ بسيط - جلسة بالذاكرة فقط
 * (تُصفّر عند إعادة تشغيل السيرفر)، بدون قاعدة بيانات، وبحد أقصى لعدد
 * الرسائل المحفوظة حتى ما تكبر بلا نهاية. قاعدة بيانات حقيقية أو تلخيص
 * تلقائي (summarization) يُضافوا لاحقًا لو احتجنا فعليًا.
 */

import { config } from "./config.js";

/** @type {Map<string, Array<{role: "user"|"model", content: string}>>} */
const memories = new Map();

function getOrCreate(chatId) {
  if (!memories.has(chatId)) memories.set(chatId, []);
  return memories.get(chatId);
}

function trim(history) {
  const max = config.memoryMaxMessages;
  if (history.length > max) {
    history.splice(0, history.length - max);
  }
}

/** يُعاد كنسخة (لا مرجع مباشر) حتى لا يعدّل المستدعي الذاكرة الداخلية بالخطأ. */
export function getHistory(chatId) {
  return [...getOrCreate(chatId)];
}

export function appendUserMessage(chatId, text) {
  const history = getOrCreate(chatId);
  history.push({ role: "user", content: text });
  trim(history);
}

export function appendAssistantMessage(chatId, text) {
  const history = getOrCreate(chatId);
  history.push({ role: "model", content: text });
  trim(history);
}

/** يُستخدم من أمر /reset - يمسح كل سياق المحادثة لهذا الرقم فقط. */
export function resetMemory(chatId) {
  memories.delete(chatId);
}

/** Phase 11: عدد المحادثات النشطة حاليًا بالذاكرة - يُستخدم بأمر /status */
export function activeConversationsCount() {
  return memories.size;
}
