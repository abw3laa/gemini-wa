# دليل الرفع على Oracle Cloud (Always Free) - بديل لـ Render

⚠️ **ملاحظات قبل البدء:**
- Oracle خفّضوا الحد المجاني بتاريخ 15 يونيو 2026 من (4 أنوية/24GB) لـ
  **(2 أنوية/12GB)** - لسا سخي جدًا لبوتنا (يحتاج جزء بسيط من هالموارد)،
  بس اعرف إنه الشروط تتغيّر بدون إشعار واضح أحيانًا حسب Oracle.
- شائع تواجه خطأ **"Out of host capacity"** عند إنشاء instance مجاني -
  هذا معروف ومتكرر، الحل: جرب Availability Domain مختلف بنفس المنطقة،
  أو جرب بوقت/يوم تاني، أو غيّر الـ Region لو ممكن.
- Oracle بيطلب بطاقة ائتمان عند التسجيل حتى للـ Free Tier (للتحقق فقط،
  ما تُخصم إلا لو رفعت استخدامك فوق الحد المجاني عمدًا).

## الفرق الجوهري عن Render: VM واحد بدل خدمتين منفصلتين

على Oracle، بدل خدمتين على الإنترنت منفصلتين (زي Render)، رح ننشئ
**سيرفر واحد (VM) حقيقي**، ونشغّل عليه `docker-compose.yml` (نفس الملف
يلي بنيناه بـ Phase 12) اللي يشغّل الخدمتين مع بعض بشبكة داخلية.

**ميزة مهمة:** `gemini-wa` (Python API) **ما يحتاج يكون متاح على
الإنترنت العام إطلاقًا** - بيتواصل معه `whatsapp-service` داخليًا فقط
عبر شبكة Docker (`http://gemini-api:8000`)، فما في داعي نفتح أي port
عام إله. الشيء الوحيد المطلوب فتحه هو **SSH (للإدارة فقط)**.

```
[هاتفك/الإنترنت]          [VM على Oracle]
                    SSH →  ┌─────────────────────────┐
                           │  docker-compose:         │
                           │  ┌──────────┐ ┌────────┐ │
        WhatsApp ────────→│  │whatsapp- │→│gemini- │ │
        (اتصال صادر        │  │service   │ │api     │ │
         من الـ VM)         │  └──────────┘ └────────┘ │
                           │  (شبكة داخلية، بدون منفذ  │
                           │   عام لـ gemini-api)      │
                           └─────────────────────────┘
```

## الخطوة 1: إنشاء الحساب والـ VM

1. سجّل بـ https://www.oracle.com/cloud/free/ (بطاقة ائتمان مطلوبة للتحقق)
2. من الـ Console: **Compute → Instances → Create Instance**
3. **Image**: اختر **Ubuntu** (أحدث إصدار LTS متاح) - **مهم: تأكد إنه
   ARM-compatible** (يظهر عادة تلقائيًا لما تختار الـ Shape بالخطوة الجاية)
4. **Shape**: اضغط **Change Shape** → اختر **Ampere (ARM)** →
   **VM.Standard.A1.Flex** → اضبط **2 OCPU / 12 GB RAM** (الحد المجاني الحالي)
5. **SSH Keys**: أسهل طريقة لو مو مرتاح بإدارة مفاتيح SSH يدويًا -
   استخدم **Oracle Cloud Shell** (طرفية بالمتصفح مباشرة، مدمجة بلوحة
   Oracle، ما تحتاج أي إعداد على جهازك). أو لو تفضل من جهازك:
   ```powershell
   ssh-keygen -t ed25519
   ```
   (متوفر افتراضيًا بـ PowerShell الحديث) والصق المفتاح العام (`.pub`)
   بخانة SSH Keys.
6. اضغط **Create** وانتظر لحد ما تصير الحالة "Running"
7. احفظ الـ **Public IP Address** الظاهر بصفحة الـ instance

## الخطوة 2: فتح SSH فقط (بدون أي منفذ عام تاني)

بشكل افتراضي، صور Ubuntu على Oracle بتسمح بـ SSH (منفذ 22) تلقائيًا -
غالبًا ما تحتاج تعديل شي هون. لو احتجت تتحقق أو تعدّل:

- **مستوى Oracle (Security List/NSG)**: من صفحة الـ VNIC تبع الـ
  instance → Subnet → Security List - تأكد فيه Ingress Rule لمنفذ 22
- **مستوى نظام Ubuntu نفسه** (طبقة ثانية منفصلة، تنسى غالبًا): بعد
  الدخول عبر SSH لأول مرة، تأكد الجدار الناري ما يحجب شي إضافي (عادة
  الإعداد الافتراضي تمام لو بس محتاج SSH)

**ما في داعي نفتح منفذ 8000 ولا أي منفذ تاني** - Baileys بيتصل بـ
WhatsApp بشكل صادر (outbound) بس.

## الخطوة 3: الاتصال وتثبيت Docker

اتصل عبر SSH (أو استخدم Cloud Shell مباشرة من المتصفح):
```bash
ssh -i /path/to/your/key ubuntu@<Public-IP>
```

ثبّت Docker + Compose:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# اخرج وأعد الاتصال حتى تفعّل صلاحية docker بدون sudo
exit
```
اتصل من جديد، وتأكد:
```bash
docker --version
docker compose version
```

💡 صور `python:3.12-slim` و`node:24-slim` (المستخدمة بـ Dockerfiles
تبعنا) تدعم ARM64 رسميًا - ما تحتاج أي تعديل على الكود أو الـ Dockerfiles
للعمل على معمارية Oracle الـ ARM.

## الخطوة 4: نقل المشروع للـ VM

أسهل طريقة (لو الكود مرفوع على GitHub):
```bash
git clone https://github.com/abw3laa/gemini-wa.git
cd gemini-wa
```

## الخطوة 5: إعداد ملفات .env

أنشئ `.env` بكل مجلد (`gemini-wa/.env` و `whatsapp-service/.env`) بنفس
القيم يلي عندك محليًا:

```bash
cp gemini-wa/.env.example gemini-wa/.env
nano gemini-wa/.env   # عبّي القيم الحقيقية

cp whatsapp-service/.env.example whatsapp-service/.env
nano whatsapp-service/.env   # عبّي القيم الحقيقية
```

⚠️ **لا تغيّر `GEMINI_API_URL`** بملف whatsapp-service/.env يدويًا - ملف
`docker-compose.yml` بيتكفل يعدّلها تلقائيًا لـ `http://gemini-api:8000`
(اسم الخدمة داخل شبكة Docker).

استخدم `WHATSAPP_LINK_METHOD=pairing` (أسهل بكثير من QR على سيرفر بعيد).

## الخطوة 6: التشغيل

```bash
docker compose up --build -d
```
(`-d` = detached، يبقى شغال بالخلفية حتى لو سكرت SSH)

راقب اللوج لحد ما يطلع كود الربط:
```bash
docker compose logs -f whatsapp
```
أدخل الكود من هاتفك (نفس خطوات Phase 3). اضغط `Ctrl+C` للخروج من
المراقبة (البوت يضل شغال بالخلفية).

## الخطوة 7: التأكد من الاستمرارية

**ميزة Oracle مقارنة بـ Render**: التخزين هون جزء من الـ VM نفسه - ما
في حاجة لإضافة "Persistent Disk" منفصل بأي إعداد إضافي. طالما الـ VM
موجود، جلسة WhatsApp وقاعدة المعرفة (المخزّنة بـ Docker volume) محفوظة
تلقائيًا.

للتأكد إنه البوت يرجع يشتغل تلقائيًا لو الـ VM أعاد التشغيل (صيانة من
Oracle مثلًا):
```bash
sudo systemctl enable docker
```
(`restart: unless-stopped` بملف compose يتكفل بإعادة تشغيل الحاويات
نفسها تلقائيًا بمجرد ما Docker يرجع يشتغل)

## الصيانة والتحديث

```bash
cd ~/gemini-wa
git pull
docker compose up --build -d   # يعيد البناء وينشر التحديثات
```

مراقبة:
```bash
docker compose logs -f            # كل الخدمتين
docker compose logs -f whatsapp   # وحدة بس
docker stats                      # استهلاك CPU/RAM اللحظي
```

إيقاف مؤقت:
```bash
docker compose down     # يوقف الحاويات، الـ volume (الجلسة) يضل محفوظ
docker compose up -d    # يرجعهم يشتغلوا بدون فقدان الجلسة
```

## مقارنة سريعة: أين تختلف الخطوات عن Render

| | Render | Oracle |
|---|---|---|
| نشر تلقائي عند git push | ✅ تلقائي | ❌ يدوي (`git pull` + `docker compose up --build -d`) |
| منفذ عام لـ gemini-api | مطلوب (خدمة منفصلة) | غير مطلوب (شبكة داخلية) |
| Persistent Disk | خطوة إضافية + تكلفة منفصلة | تلقائي (جزء من الـ VM) |
| النوم/Sleep | يعتمد على الخطة | لا يوجد إطلاقًا (VM حقيقي دائم) |
| إدارة الجدار الناري | Render يديرها | عليك (طبقتين: Oracle + Ubuntu) |
