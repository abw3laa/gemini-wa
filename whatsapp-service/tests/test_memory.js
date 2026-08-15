/**
 * اختبار يدوي لـ conversationMemory.js - بدون شبكة أو مكتبات خارجية.
 * تشغيل: node tests/test_memory.js
 */

import assert from "node:assert";
import * as memory from "../src/conversationMemory.js";

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

test("الذاكرة فاضية لمحادثة جديدة", () => {
  assert.deepStrictEqual(memory.getHistory("chat-a"), []);
});

test("appendUserMessage و appendAssistantMessage يضيفوا بالترتيب الصحيح", () => {
  memory.appendUserMessage("chat-b", "مرحبا");
  memory.appendAssistantMessage("chat-b", "أهلا فيك");
  assert.deepStrictEqual(memory.getHistory("chat-b"), [
    { role: "user", content: "مرحبا" },
    { role: "model", content: "أهلا فيك" },
  ]);
});

test("resetMemory يمسح محادثة محددة فقط، بدون التأثير على غيرها", () => {
  memory.appendUserMessage("chat-c", "رسالة");
  memory.appendUserMessage("chat-d", "رسالة تانية");
  memory.resetMemory("chat-c");
  assert.deepStrictEqual(memory.getHistory("chat-c"), []);
  assert.strictEqual(memory.getHistory("chat-d").length, 1);
});

test("getHistory يرجع نسخة (تعديلها ما يأثر على الذاكرة الداخلية)", () => {
  memory.appendUserMessage("chat-e", "رسالة");
  const history = memory.getHistory("chat-e");
  history.push({ role: "user", content: "إضافة خارجية" });
  assert.strictEqual(memory.getHistory("chat-e").length, 1);
});

console.log("\nانتهى الاختبار.");
