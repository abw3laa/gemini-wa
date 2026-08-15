/**
 * webServer.js
 *
 * لوحة تحكم ويب بسيطة للبوت. تسمح لك بـ:
 *   - تشغيل/إيقاف البوت (وضع active / away)
 *   - تعديل نص رسالة الغياب التلقائية
 *   - إرسال رسالة يدوية لأي رقم من المتصفح
 *   - عرض قائمة الأرقام اللي استلمت رسالة الغياب + تصفيرها (حتى يرد من جديد)
 *
 * الأمان: اللوحة محمية بكلمة سر بسيطة (WEB_DASHBOARD_PASSWORD) عبر رأس
 * X-Dashboard-Password. إذا لم تُضبط كلمة السر، تعمل بدون حماية لكن مع
 * تحذير واضح في السجل (لأنها تعرّض القدرة على إرسال رسائل من رقمك).
 */

import express from "express";
import * as botState from "./botState.js";
import * as knowledgeBase from "./knowledgeBase.js";

const DASHBOARD_PASSWORD = process.env.WEB_DASHBOARD_PASSWORD || "";

/**
 * @param {import("@whiskeysockets/baileys").WASocket} getSock  دالة تعيد الـ socket الحالي (قد يتغيّر عند إعادة الاتصال)
 */
export function startWebServer(getSock) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // حماية بسيطة بكلمة سر لكل مسارات الـ API (ما عدا الصفحة نفسها والـ health)
  app.use((req, res, next) => {
    if (req.path === "/" || req.path === "/health") return next();
    if (!DASHBOARD_PASSWORD) return next(); // بدون حماية (تحذير مطبوع عند الإقلاع)
    const provided = req.get("X-Dashboard-Password") || req.query.password;
    if (provided === DASHBOARD_PASSWORD) return next();
    return res.status(401).json({ ok: false, error: "كلمة سر غير صحيحة" });
  });

  app.get("/health", (req, res) => res.json({ ok: true }));

  // الحالة الحالية
  app.get("/api/state", (req, res) => {
    res.json({ ok: true, state: botState.getState() });
  });

  // تغيير الوضع: { mode: "away" | "active" }
  app.post("/api/mode", (req, res) => {
    try {
      const state = botState.setMode(req.body.mode);
      console.log(`🔀 تغيّر وضع البوت إلى: ${state.mode}`);
      res.json({ ok: true, state });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // تعديل رسالة الغياب: { message: "..." }
  app.post("/api/away-message", (req, res) => {
    try {
      const state = botState.setAwayMessage(req.body.message);
      console.log("✏️ تم تعديل رسالة الغياب.");
      res.json({ ok: true, state });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // تصفير قائمة المُبلَّغين (يرد البوت برسالة الغياب من جديد لكل رقم)
  app.post("/api/reset-notified", (req, res) => {
    const count = botState.resetNotified();
    console.log(`♻️ تم تصفير قائمة المُبلَّغين (${count} رقم).`);
    res.json({ ok: true, cleared: count, state: botState.getState() });
  });

  // إرسال رسالة يدوية: { to: "رقم أو JID", message: "..." }
  app.post("/api/send", async (req, res) => {    const sock = getSock();
    if (!sock) return res.status(503).json({ ok: false, error: "البوت غير متصل حاليًا" });

    let { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ ok: false, error: "الحقول to و message مطلوبة" });
    }

    // لو أدخل المستخدم رقمًا فقط (بدون @) نحوّله لصيغة JID
    to = String(to).trim();
    if (!to.includes("@")) {
      const digits = to.replace(/[^0-9]/g, "");
      if (!digits) return res.status(400).json({ ok: false, error: "رقم غير صالح" });
      to = `${digits}@s.whatsapp.net`;
    }

    try {
      await sock.sendMessage(to, { text: message });
      console.log(`📤 رسالة يدوية من اللوحة إلى ${to}`);
      res.json({ ok: true, to });
    } catch (err) {
      console.error("❌ فشل إرسال رسالة يدوية:", err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ===== تدريب البوت (قاعدة المعرفة) =====

  // عرض كل مدخلات قاعدة المعرفة
  app.get("/api/knowledge", async (req, res) => {
    try {
      const entries = await knowledgeBase.listEntries();
      res.json({ ok: true, entries });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // إضافة مدخل: { question: "...", answer: "..." }
  app.post("/api/knowledge", async (req, res) => {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ ok: false, error: "الحقول question و answer مطلوبة" });
    }
    try {
      const entry = await knowledgeBase.addEntry(question, answer);
      console.log(`📚 أُضيف مدخل تدريب جديد من اللوحة (${entry.id})`);
      res.json({ ok: true, entry });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // حذف مدخل بالـ id
  app.delete("/api/knowledge/:id", async (req, res) => {
    try {
      const removed = await knowledgeBase.removeEntry(req.params.id);
      res.json({ ok: removed, removed });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // صفحة التحكم (HTML مضمّن - لا حاجة لملفات ستاتيك منفصلة)
  app.get("/", (req, res) => {
    res.type("html").send(DASHBOARD_HTML);
  });

  const port = parseInt(process.env.PORT || process.env.WEB_PORT || "3000", 10);
  app.listen(port, () => {
    console.log(`\n🌐 لوحة تحكم البوت شغّالة على: http://localhost:${port}`);
    if (!DASHBOARD_PASSWORD) {
      console.log(
        "   ⚠️ تحذير: WEB_DASHBOARD_PASSWORD غير مضبوطة - اللوحة مفتوحة بدون كلمة سر."
      );
    }
  });

  return app;
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>لوحة تحكم البوت</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; }
  .container { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 22px; text-align: center; }
  .card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
  .card h2 { font-size: 16px; margin: 0 0 12px; color: #94a3b8; }
  label { display: block; font-size: 13px; margin-bottom: 6px; color: #94a3b8; }
  input, textarea { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-family: inherit; font-size: 14px; }
  textarea { min-height: 80px; resize: vertical; }
  button { cursor: pointer; border: none; border-radius: 8px; padding: 10px 16px; font-size: 14px; font-weight: 600; color: #fff; margin-top: 10px; }
  .btn-primary { background: #3b82f6; }
  .btn-green { background: #16a34a; }
  .btn-red { background: #dc2626; }
  .btn-gray { background: #475569; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; }
  .status-away { background: #7c2d12; color: #fdba74; }
  .status-active { background: #14532d; color: #86efac; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .row button { flex: 1; }
  .muted { font-size: 12px; color: #64748b; margin-top: 8px; }
  #toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #16a34a; color: #fff; padding: 10px 20px; border-radius: 8px; opacity: 0; transition: opacity .3s; pointer-events: none; }
  #toast.show { opacity: 1; }
  #toast.err { background: #dc2626; }
  .senders { max-height: 160px; overflow-y: auto; font-size: 12px; background: #0f172a; border-radius: 8px; padding: 8px; margin-top: 8px; }
  .senders div { padding: 2px 0; border-bottom: 1px solid #1e293b; }
</style>
</head>
<body>
<div class="container">
  <h1>🤖 لوحة تحكم بوت واتساب</h1>

  <div class="card">
    <h2>الحالة</h2>
    <p>الوضع الحالي: <span id="modeBadge" class="status-badge">...</span></p>
    <p class="muted">عدد الأرقام اللي استلمت رسالة الغياب: <span id="notifiedCount">0</span></p>
    <div class="row">
      <button class="btn-green" onclick="setMode('active')">تشغيل البوت (رد ذكي)</button>
      <button class="btn-red" onclick="setMode('away')">إيقاف (رسالة غياب فقط)</button>
    </div>
  </div>

  <div class="card">
    <h2>رسالة الغياب التلقائية</h2>
    <textarea id="awayMessage"></textarea>
    <button class="btn-primary" onclick="saveAwayMessage()">حفظ الرسالة</button>
  </div>

  <div class="card">
    <h2>إرسال رسالة يدوية</h2>
    <label>الرقم (بصيغة دولية بدون +، مثال 9639xxxxxxxx)</label>
    <input id="sendTo" placeholder="9639xxxxxxxx">
    <label style="margin-top:10px">الرسالة</label>
    <textarea id="sendMessage"></textarea>
    <button class="btn-primary" onclick="sendManual()">إرسال</button>
  </div>

  <div class="card">
    <h2>الأرقام اللي استلمت رسالة الغياب</h2>
    <div class="senders" id="sendersList"></div>
    <button class="btn-gray" onclick="resetNotified()">تصفير القائمة (يرد من جديد)</button>
  </div>

  <div class="card">
    <h2>🎓 تدريب البوت (قاعدة المعرفة)</h2>
    <p class="muted">المعلومات هنا يستخدمها البوت عند الرد بالذكاء الاصطناعي (وضع التشغيل).</p>
    <label>السؤال / الموضوع</label>
    <input id="kbQuestion" placeholder="مثال: شو أسعار الموقع؟">
    <label style="margin-top:10px">الجواب</label>
    <textarea id="kbAnswer" placeholder="مثال: يبدأ من 50$"></textarea>
    <button class="btn-primary" onclick="addKnowledge()">إضافة معلومة</button>
    <div class="senders" id="kbList" style="max-height:220px;margin-top:12px"></div>
  </div>
  <div class="card">
    <h2>كلمة السر</h2>
    <label>مطلوبة فقط إذا ضبطت WEB_DASHBOARD_PASSWORD</label>
    <input id="password" type="password" placeholder="اتركها فارغة إذا ما في كلمة سر">
    <p class="muted">تُحفظ محليًا بالمتصفح فقط.</p>
  </div>
</div>

<div id="toast"></div>

<script>
  function getPassword() {
    const p = document.getElementById('password').value;
    if (p) localStorage.setItem('dashPass', p);
    return p || localStorage.getItem('dashPass') || '';
  }
  window.addEventListener('load', () => {
    const saved = localStorage.getItem('dashPass');
    if (saved) document.getElementById('password').value = saved;
    refresh();
    loadKnowledge();
  });

  function headers() {
    return { 'Content-Type': 'application/json', 'X-Dashboard-Password': getPassword() };
  }

  function toast(msg, isErr) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = isErr ? 'show err' : 'show';
    setTimeout(() => { t.className = t.className.replace('show', '').trim(); }, 2500);
  }

  async function refresh() {
    try {
      const r = await fetch('/api/state', { headers: headers() });
      const data = await r.json();
      if (!data.ok) return toast(data.error || 'خطأ', true);
      const s = data.state;
      const badge = document.getElementById('modeBadge');
      badge.textContent = s.mode === 'away' ? 'إيقاف (رسالة غياب)' : 'مُشغّل (رد ذكي)';
      badge.className = 'status-badge ' + (s.mode === 'away' ? 'status-away' : 'status-active');
      document.getElementById('awayMessage').value = s.awayMessage;
      document.getElementById('notifiedCount').textContent = s.notifiedCount;
      const list = document.getElementById('sendersList');
      list.innerHTML = s.notifiedSenders.length
        ? s.notifiedSenders.map(j => '<div>' + j + '</div>').join('')
        : '<div style="color:#64748b">لا يوجد بعد</div>';
    } catch (e) { toast('فشل الاتصال بالسيرفر', true); }
  }

  async function setMode(mode) {
    const r = await fetch('/api/mode', { method: 'POST', headers: headers(), body: JSON.stringify({ mode }) });
    const data = await r.json();
    if (data.ok) { toast(mode === 'away' ? 'تم الإيقاف' : 'تم التشغيل'); refresh(); }
    else toast(data.error || 'خطأ', true);
  }

  async function saveAwayMessage() {
    const message = document.getElementById('awayMessage').value;
    const r = await fetch('/api/away-message', { method: 'POST', headers: headers(), body: JSON.stringify({ message }) });
    const data = await r.json();
    if (data.ok) { toast('تم حفظ الرسالة'); refresh(); }
    else toast(data.error || 'خطأ', true);
  }

  async function sendManual() {
    const to = document.getElementById('sendTo').value;
    const message = document.getElementById('sendMessage').value;
    const r = await fetch('/api/send', { method: 'POST', headers: headers(), body: JSON.stringify({ to, message }) });
    const data = await r.json();
    if (data.ok) { toast('تم الإرسال إلى ' + data.to); document.getElementById('sendMessage').value = ''; }
    else toast(data.error || 'فشل الإرسال', true);
  }

  async function resetNotified() {
    const r = await fetch('/api/reset-notified', { method: 'POST', headers: headers() });
    const data = await r.json();
    if (data.ok) { toast('تم التصفير (' + data.cleared + ')'); refresh(); }
    else toast(data.error || 'خطأ', true);
  }

  async function loadKnowledge() {
    try {
      const r = await fetch('/api/knowledge', { headers: headers() });
      const data = await r.json();
      if (!data.ok) return;
      const list = document.getElementById('kbList');
      list.innerHTML = data.entries.length
        ? data.entries.map(e =>
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
            '<span><b>' + escapeHtml(e.question) + '</b> → ' + escapeHtml(e.answer) + '</span>' +
            '<button class="btn-red" style="margin:0;padding:4px 10px;font-size:12px" onclick="removeKnowledge(\\'' + e.id + '\\')">حذف</button>' +
            '</div>'
          ).join('')
        : '<div style="color:#64748b">لا توجد معلومات بعد</div>';
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  async function addKnowledge() {
    const question = document.getElementById('kbQuestion').value;
    const answer = document.getElementById('kbAnswer').value;
    if (!question || !answer) return toast('املأ السؤال والجواب', true);
    const r = await fetch('/api/knowledge', { method: 'POST', headers: headers(), body: JSON.stringify({ question, answer }) });
    const data = await r.json();
    if (data.ok) {
      toast('تمت إضافة المعلومة');
      document.getElementById('kbQuestion').value = '';
      document.getElementById('kbAnswer').value = '';
      loadKnowledge();
    } else toast(data.error || 'خطأ', true);
  }

  async function removeKnowledge(id) {
    const r = await fetch('/api/knowledge/' + id, { method: 'DELETE', headers: headers() });
    const data = await r.json();
    if (data.ok) { toast('تم الحذف'); loadKnowledge(); }
    else toast('لم يتم الحذف', true);
  }

  setInterval(refresh, 10000);
</script>
</body>
</html>`;
