# ⚽ GoalPredict Backend — كأس العالم 2026

## 🚀 تشغيل المشروع

### 1. تثبيت المكتبات
```bash
npm install
```

### 2. إعداد ملف `.env`
الملف موجود بالفعل. أضف بيانات Firebase:
```
API_FOOTBALL_KEY=e49f2ec9c04717690a892a446c6782b2
API_FOOTBALL_URL=https://v3.football.api-sports.io
PORT=3000
FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
FIREBASE_PRIVATE_KEY="YOUR_PRIVATE_KEY"
FIREBASE_CLIENT_EMAIL=YOUR_CLIENT_EMAIL
```

### 3. إعداد Firebase
1. اذهب إلى https://console.firebase.google.com
2. أنشئ مشروعاً جديداً → اسمه **goalpredict**
3. Project Settings → Service Accounts → Generate New Private Key
4. افتح الملف الذي نزّلته وانسخ:
   - `project_id` → FIREBASE_PROJECT_ID
   - `private_key` → FIREBASE_PRIVATE_KEY
   - `client_email` → FIREBASE_CLIENT_EMAIL
5. فعّل Firestore: Build → Firestore Database → Create Database
6. فعّل Cloud Messaging: Build → Cloud Messaging

### 4. تشغيل السيرفر
```bash
# تشغيل عادي
npm start

# تشغيل مع إعادة التشغيل التلقائي (للتطوير)
npm run dev
```

---

## 📡 API Endpoints

| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/fixtures/today` | مباريات اليوم |
| GET | `/api/fixtures/live` | المباريات الحية الآن |
| GET | `/api/fixtures/all` | كل مباريات كأس العالم |
| GET | `/api/standings` | ترتيب المجموعات |
| POST | `/api/auth/register` | تسجيل مستخدم جديد |
| POST | `/api/auth/login` | تسجيل دخول |
| POST | `/api/predictions` | حفظ توقع |
| GET | `/api/predictions/:userId` | توقعات مستخدم |
| POST | `/api/predictions/evaluate` | تقييم نتائج مباراة |
| GET | `/api/leaderboard` | لوحة المتصدرين |

---

## ⚙️ نظام النقاط

| الإنجاز | النقاط |
|---------|--------|
| توقع الفائز صحيح (فوز/تعادل/خسارة) | +3 نقاط |
| توقع النتيجة الدقيقة (مثال: 2-1) | +5 نقاط إضافية |

---

## 🔔 الإشعارات التلقائية

- **قبل 30 دقيقة من كل مباراة** → إشعار لكل المستخدمين
- **بعد انتهاء المباراة** → إشعار شخصي بنتيجة التوقع ونقاطك
- **بعد تحديث الترتيب** → إشعار بمرتبتك الجديدة

---

## 🌐 النشر على الإنترنت (مجاني)

### Render.com (الأسهل)
1. ارفع المشروع على GitHub
2. اذهب إلى https://render.com
3. New → Web Service → اختر الـ repo
4. أضف متغيرات البيئة من .env
5. سيعطيك رابطاً مثل: `https://goalpredict.onrender.com`

### Railway.app (بديل)
1. اذهب إلى https://railway.app
2. New Project → Deploy from GitHub
3. أضف Variables من .env

---

## 🏗️ هيكل المشروع

```
goalpredict-backend/
├── server.js      ← السيرفر الرئيسي + كل الـ Routes
├── firebase.js    ← Firebase + الإشعارات
├── .env           ← مفاتيح API (لا ترفعه على GitHub!)
├── package.json
└── README.md
```

---

## ⚠️ ملاحظة مهمة
لا ترفع ملف `.env` على GitHub. أضف هذا في `.gitignore`:
```
.env
node_modules/
```
