/**
 * db.js
 *
 * اتصال MongoDB اختياري. لو ضُبط MONGODB_URI نستخدم Mongo لتخزين:
 *   - جلسة WhatsApp (بدل ملفات auth_info_baileys)
 *   - حالة البوت (الوضع + رسالة الغياب)
 *   - قاعدة المعرفة (التدريب)
 *
 * الفائدة: على منصات مثل Render بدون قرص دائم (Persistent Disk مدفوع)،
 * كل هذه البيانات تبقى محفوظة عبر إعادات النشر، فلا تعيد مسح QR كل مرة.
 *
 * لو MONGODB_URI غير مضبوط، ترجع الوحدات للتخزين المحلي بالملفات (السلوك القديم).
 */

import { MongoClient } from "mongodb";

let client = null;
let db = null;

export function isMongoEnabled() {
  return Boolean(process.env.MONGODB_URI);
}

export async function connectMongo() {
  if (!isMongoEnabled()) return null;
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "whatsapp_bot";

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15000,
  });
  await client.connect();
  db = client.db(dbName);
  console.log(`🍃 متصل بـ MongoDB (قاعدة: ${dbName})`);
  return db;
}

export function getDb() {
  return db;
}

export async function closeMongo() {
  if (client) await client.close();
  client = null;
  db = null;
}
