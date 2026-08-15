/**
 * mediaService.js
 *
 * طبقة إرسال الوسائط عبر WhatsApp - Phase 8.
 *
 * مستقلة تمامًا عن Gemini (لا تعرف شيئًا عنه) - أي جزء من المشروع لاحقًا
 * (Knowledge Base بـ Phase 10، Admin Commands بـ Phase 11) يقدر يستخدمها
 * لإرسال صورة/ملف/صوت بدون أي علاقة بمصدر المحتوى.
 *
 * كل دالة تقبل "source" بصيغتين:
 *   - { url: "https://..." }   → Baileys يحمّله تلقائيًا
 *   - { buffer: Buffer }        → بيانات جاهزة بالذاكرة (مثلاً ملف محلي مقروء مسبقًا)
 */

export async function sendImage(sock, jid, source, caption = "") {
  return sock.sendMessage(jid, {
    image: source.url ? { url: source.url } : source.buffer,
    caption,
  });
}

export async function sendDocument(sock, jid, source, fileName, caption = "") {
  return sock.sendMessage(jid, {
    document: source.url ? { url: source.url } : source.buffer,
    fileName,
    mimetype: source.mimeType || "application/octet-stream",
    caption,
  });
}

/**
 * @param {boolean} voiceNote - true لإرسالها كرسالة صوتية (PTT)، false لملف صوتي عادي
 */
export async function sendAudio(sock, jid, source, { voiceNote = false, mimeType = "audio/mpeg" } = {}) {
  return sock.sendMessage(jid, {
    audio: source.url ? { url: source.url } : source.buffer,
    mimetype: mimeType,
    ptt: voiceNote,
  });
}

export async function sendVideo(sock, jid, source, caption = "") {
  return sock.sendMessage(jid, {
    video: source.url ? { url: source.url } : source.buffer,
    caption,
  });
}
