/**
 * mongoAuthState.js
 *
 * بديل useMultiFileAuthState الخاص بـ Baileys، لكنه يخزّن الجلسة في MongoDB
 * بدل ملفات على القرص. يسمح بجلسة دائمة على منصات بدون قرص دائم (مثل Render
 * بدون Persistent Disk المدفوع).
 *
 * المبدأ نفسه: نحفظ "creds" ومجموعة مفاتيح (keys) بأنواعها. Baileys يتعامل
 * مع أي مخزن يوفّر واجهة { creds, keys: { get, set } } + دالة saveCreds.
 *
 * نستخدم BufferJSON من Baileys للتسلسل الصحيح للـ Buffers (وإلا تتلف المفاتيح).
 */

import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";

const COLLECTION = "wa_auth";

/**
 * @param {import("mongodb").Db} db
 * @param {string} sessionId  معرّف الجلسة (لدعم أكثر من حساب بنفس القاعدة لو لزم)
 */
export async function useMongoAuthState(db, sessionId = "default") {
  const coll = db.collection(COLLECTION);
  await coll.createIndex({ sessionId: 1, key: 1 }, { unique: true }).catch(() => {});

  async function readData(key) {
    const doc = await coll.findOne({ sessionId, key });
    if (!doc || doc.value == null) return null;
    return JSON.parse(doc.value, BufferJSON.reviver);
  }

  async function writeData(key, value) {
    const serialized = JSON.stringify(value, BufferJSON.replacer);
    await coll.updateOne(
      { sessionId, key },
      { $set: { sessionId, key, value: serialized } },
      { upsert: true }
    );
  }

  async function removeData(key) {
    await coll.deleteOne({ sessionId, key });
  }

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const type in data) {
            for (const id in data[type]) {
              const value = data[type][id];
              const key = `${type}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData("creds", creds);
    },
    /** يمسح كل بيانات هذه الجلسة (مفيد عند loggedOut لإعادة ربط نظيفة) */
    clearState: async () => {
      await coll.deleteMany({ sessionId });
    },
  };
}
