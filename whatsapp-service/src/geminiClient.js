/**
 * geminiClient.js
 *
 * يتصل بـ API الخاص فينا (مشروع gemini-wa بايثون، Phase 2) وليس بـ Gemini
 * مباشرة. هذا يحافظ على الفصل: whatsapp-service لا يعرف شيئًا عن Gemini
 * نفسه، فقط عن نقطة الدخول الموحّدة /v1/chat/completions.
 */

import { config } from "./config.js";

export class GeminiApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * يرسل prompt (نص + صورة اختيارية + سياق محادثة اختياري + سياق قاعدة
 * معرفة اختياري) ويعيد نص الرد.
 * يرمي GeminiApiError بحالة الفشل (بما فيها rate limit من طبقة API - كود 429).
 *
 * @param {string} prompt - النص (caption الصورة أو رسالة المستخدم)
 * @param {{mimeType: string, base64Data: string}|null} image - صورة اختيارية (Phase 7)
 * @param {Array<{role: "user"|"model", content: string}>} history - سياق محادثة سابق (Phase 9)
 * @param {string|null} context - سياق من قاعدة المعرفة (Phase 10)
 */
export async function chatCompletion(prompt, image = null, history = [], context = null) {
  const lastMessage = { role: "user", content: prompt };
  if (image) {
    lastMessage.image_base64 = image.base64Data;
    lastMessage.image_mime_type = image.mimeType;
  }

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    lastMessage,
  ];

  const body = { model: "gemini", messages };
  if (context) body.context = context;

  const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      // تجاهل - الرد مش JSON
    }
    throw new GeminiApiError(detail, response.status);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
