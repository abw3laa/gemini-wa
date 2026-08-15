/**
 * botState.js
 *
 * حالة تشغيل البوت القابلة للتحكم من صفحة الويب (webServer.js) ومن الأوامر.
 *
 * وضعان:
 *   - "away"   : البوت مشغول/غايب. يرسل رسالة الغياب الثابتة مرة واحدة فقط
 *                لكل رقم، ولا يستخدم Gemini إطلاقًا.
 *   - "active" : الوضع الطبيعي - يرد بالذكاء الاصطناعي (Gemini) عبر الطابور.
 *
 * الإعدادات (الوضع + نص رسالة الغياب) تُحفظ بملف JSON حتى تبقى بعد إعادة
 * تشغيل السيرفر ويقدر يعدّلها المستخدم من صفحة الويب. أما قائمة الأرقام
 * اللي استلمت رسالة الغياب فتبقى بالذاكرة فقط (تُصفَّر عند إعادة التشغيل،
 * أو يدويًا من صفحة الويب) - وهذا بالضبط سلوك "مرة واحدة لكل رقم".
 */

import fs from "fs";
import path from "path";
import { getDb, isMongoEnabled } from "./db.js";

const DEFAULT_AWAY_MESSAGE =
  "أهلا وسهلا ابو علاء حاليا مشغول وما عنده تتريك بس يفضى رح يرد عليك باقرب وقت اترك رسالتك";

const STATE_FILE = process.env.BOT_STATE_FILE || "./data/bot-state.json";
const MONGO_DOC_ID = "bot-state";

/** @type {{mode: "away"|"active", awayMessage: string}} */
let state = {
  mode: "away", // نبدأ بوضع الغياب افتراضيًا (البوت "مطفّي" - رسالة واحدة فقط)
  awayMessage: DEFAULT_AWAY_MESSAGE,
};

/** الأرقام (JIDs) اللي أرسلنا لها رسالة الغياب مسبقًا - بالذاكرة فقط */
const notifiedSenders = new Set();

function useMongo() {
  return isMongoEnabled() && getDb();
}

function ensureDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function persist() {
  if (useMongo()) {
    try {
      await getDb()
        .collection("bot_state")
        .updateOne(
          { _id: MONGO_DOC_ID },
          { $set: { mode: state.mode, awayMessage: state.awayMessage } },
          { upsert: true }
        );
    } catch (err) {
      console.error("⚠️ فشل حفظ حالة البوت في Mongo:", err.message);
    }
    return;
  }
  try {
    ensureDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("⚠️ فشل حفظ حالة البوت:", err.message);
  }
}

/** يُستدعى مرة عند بدء التشغيل - يحمّل الحالة المحفوظة إن وُجدت */
export async function loadState() {
  if (useMongo()) {
    try {
      const doc = await getDb().collection("bot_state").findOne({ _id: MONGO_DOC_ID });
      if (doc) {
        if (doc.mode === "away" || doc.mode === "active") state.mode = doc.mode;
        if (typeof doc.awayMessage === "string" && doc.awayMessage.trim()) {
          state.awayMessage = doc.awayMessage;
        }
      } else {
        await persist(); // ننشئ الوثيقة بالقيم الافتراضية أول مرة
      }
    } catch (err) {
      console.error("⚠️ فشل تحميل حالة البوت من Mongo، سنستخدم الافتراضي:", err.message);
    }
    return getState();
  }

  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (saved.mode === "away" || saved.mode === "active") state.mode = saved.mode;
      if (typeof saved.awayMessage === "string" && saved.awayMessage.trim()) {
        state.awayMessage = saved.awayMessage;
      }
    } else {
      await persist(); // ننشئ الملف بالقيم الافتراضية أول مرة
    }
  } catch (err) {
    console.error("⚠️ فشل تحميل حالة البوت، سنستخدم الافتراضي:", err.message);
  }
  return getState();
}

export function getState() {
  return {
    mode: state.mode,
    awayMessage: state.awayMessage,
    notifiedCount: notifiedSenders.size,
    notifiedSenders: [...notifiedSenders],
  };
}

export function isAwayMode() {
  return state.mode === "away";
}

export async function setMode(mode) {
  if (mode !== "away" && mode !== "active") {
    throw new Error(`وضع غير صالح: ${mode} (المسموح: away أو active)`);
  }
  state.mode = mode;
  await persist();
  return getState();
}

export function getAwayMessage() {
  return state.awayMessage;
}

export async function setAwayMessage(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("نص رسالة الغياب لا يمكن أن يكون فارغًا");
  state.awayMessage = trimmed;
  await persist();
  return getState();
}

/** هل سبق وأرسلنا رسالة الغياب لهذا الرقم؟ */
export function hasBeenNotified(jid) {
  return notifiedSenders.has(jid);
}

export function markNotified(jid) {
  notifiedSenders.add(jid);
}

/** يصفّر قائمة الأرقام - بعدها يرد البوت برسالة الغياب من جديد لكل رقم */
export function resetNotified() {
  const count = notifiedSenders.size;
  notifiedSenders.clear();
  return count;
}
