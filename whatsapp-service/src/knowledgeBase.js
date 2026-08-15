/**
 * knowledgeBase.js
 *
 * قاعدة معرفة بسيطة مع تخزين دائم - Phase 10.
 *
 * مبدأ مهم من المواصفات الأصلية: "ابنِ طبقة قاعدة البيانات/التخزين قبل
 * الميزات اللي بتعتمد عليها" - لهيك هذه الطبقة تُخزّن فعليًا بملف (JSON)
 * يبقى موجود بعد إعادة تشغيل السيرفر، بعكس ذاكرة المحادثة (Phase 9) اللي
 * تُصفّر عمدًا. هذا أساس صلب لـ Phase 11 (أوامر /train الإدارية) بدل ما
 * نضطر نعيد بناء التخزين لاحقًا.
 *
 * البحث (retrieval) هنا بسيط: مطابقة كلمات مفتاحية، مش embeddings/vector
 * search حقيقي. هذا كافٍ تمامًا لقاعدة معرفة شخصية بعشرات/مئات المدخلات؛
 * لو كبرت قاعدة المعرفة كتير مستقبلًا، ممكن نرقّيها لبحث بـ embeddings.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { config } from "./config.js";

// قفل بسيط لمنع تعارض الكتابة لو وصل طلبين بنفس اللحظة (Node واحد-thread
// لكن الـ async I/O ممكن يتشابك بدون هذا)
let writeLock = Promise.resolve();

function withLock(fn) {
  const result = writeLock.then(fn, fn);
  writeLock = result.catch(() => {});
  return result;
}

async function ensureFile() {
  try {
    await fs.access(config.knowledgeBaseFile);
  } catch {
    await fs.mkdir(path.dirname(config.knowledgeBaseFile), { recursive: true });
    await fs.writeFile(config.knowledgeBaseFile, "[]", "utf8");
  }
}

async function readAll() {
  await ensureFile();
  const raw = await fs.readFile(config.knowledgeBaseFile, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("⚠️  ملف قاعدة المعرفة تالف أو فاضي - بدأنا بقائمة جديدة");
    return [];
  }
}

async function writeAll(entries) {
  await fs.writeFile(config.knowledgeBaseFile, JSON.stringify(entries, null, 2), "utf8");
}

export async function addEntry(question, answer) {
  return withLock(async () => {
    const entries = await readAll();
    const entry = {
      id: crypto.randomUUID(),
      question: question.trim(),
      answer: answer.trim(),
      createdAt: new Date().toISOString(),
    };
    entries.push(entry);
    await writeAll(entries);
    return entry;
  });
}

export async function removeEntry(id) {
  return withLock(async () => {
    const entries = await readAll();
    const filtered = entries.filter((e) => e.id !== id);
    const removed = filtered.length !== entries.length;
    if (removed) await writeAll(filtered);
    return removed;
  });
}

export async function listEntries() {
  return readAll();
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[\s،.,؟?!"'()]+/)
    .filter((w) => w.length > 1);
}

/**
 * بحث بسيط بالكلمات المفتاحية - يرجع أفضل N مدخلات متطابقة مع السؤال.
 * مدخل بدون أي كلمة مشتركة مع السؤال لا يُرجَع إطلاقًا (score = 0 يُستبعد).
 */
export async function search(query, maxResults = config.knowledgeBaseMaxResults) {
  const entries = await readAll();
  if (entries.length === 0) return [];

  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];

  const scored = entries.map((entry) => {
    const entryTokens = tokenize(`${entry.question} ${entry.answer}`);
    let score = 0;
    for (const token of entryTokens) {
      if (queryTokens.has(token)) score++;
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.entry);
}

/** يبني نص سياق جاهز للإرفاق مع الطلب لـ Gemini، أو null لو ما في نتائج. */
export function buildContext(matchedEntries) {
  if (matchedEntries.length === 0) return null;

  const lines = matchedEntries.map(
    (e) => `- سؤال مشابه: ${e.question}\n  الجواب المعتمد: ${e.answer}`
  );

  return (
    "معلومات من قاعدة معرفة صاحب البوت قد تفيد بالإجابة على السؤال الحالي " +
    "(استخدمها إذا كانت مرتبطة، تجاهلها إذا لم تكن):\n" +
    lines.join("\n")
  );
}
