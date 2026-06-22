# PROJECT_MAP — صوتك (VoiceAI)

> آخر تحديث: يونيو 2026  
> النطاق: Full-stack (Frontend SPA + Express Backend)  
> اللغة: العربية (RTL)

---

## TECH_STACK

| الطبقة | التقنية | السبب |
|--------|---------|-------|
| **التعرف على الصوت** | Web Speech API (`SpeechRecognition`) | مدمج في المتصفح |
| **قاعدة البيانات** | IndexedDB (wrapper: `db.js`) | تخزين غير محدود، ACID، فهارس |
| **مصادقة Pi** | Pi SDK (`sdk.minepi.com/pi-sdk.js`) | `Pi.init()` → `Pi.authenticate()` |
| **مصادقة (wrapper)** | `pi-auth.js` | Promise-based auto-auth + manual button |
| **التصميم** | CSS3 + Google Fonts (Tajawal) | خط عربي أنيق |
| **الاستضافة** | GitHub Pages / أي static host | Frontend |
| **Backend** | Express (Node.js) | `/api/auth/verify` — توثيق التوكن |

> **قرار معماري**: رفض أي مكتبات خارجية غير ضرورية (React, Vue, jQuery, Bootstrap).  
> Pi SDK يُستخدم فقط لإتمام التسجيل — Pi Browser مطلوب.

---

## SYSTEM_FLOW

```
┌─────────────────────────────────────────────────┐
│                  المستخدم                         │
│         (يفتح التطبيق — Pi Browser)               │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│         0. المصادقة (Pi Network)                 │
│   • Pi.init({ version:'2.0', sandbox:true })     │
│   • await (Promise)                             │
│   • Pi.authenticate(['username'], callback)     │
│   • → { user, accessToken }                     │
│   • POST /api/auth/verify { accessToken }       │
│     → GET https://api.minepi.com/v2/me          │
│       Authorization: Bearer <accessToken>       │
│     ← { sessionToken, user }                    │
│   • تخزين session في localStorage               │
│   • فشل ← يظهر زر "تسجيل الدخول بPi" يدوي      │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│         1. التسجيل (SpeechRecognition)           │
│   • recordBtn click → recordingLock guard        │
│   • recognition.start() → onresult → transcript  │
│   • onerror → ترجمة الأخطاء للمستخدم             │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│         2. المعالجة المحلية                       │
│   • addSession(text)                            │
│   • حفظ النص + lastWord + lastSentence          │
│   • تحديث state في الذاكرة + IndexedDB           │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│         3. التطور التدريجي                        │
│   • calcLevel() → L1..L5                        │
│   • getResponse() → depth حسب daysActive        │
└──────────────────┬──────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────┐
│         4. تحديث الواجهة (UI Evolution)           │
│   • level classes → app + signature              │
│   • memory card → display بعد 10 جلسات           │
│   • auth-bar → guest/user state                  │
└─────────────────────────────────────────────────┘
```

---

## ARCHITECTURE

```
┌───────────────────────────────────────────────────────────┐
│                        index.html                          │
│   Pi SDK CDN + auth-bar (guest/user) + voice UI           │
├───────────────────────────────────────────────────────────┤
│                        style.css                           │
│   (auth-bar, btn-auth, dark neon, 5 levels, log states)   │
├───────────────────────────────────────────────────────────┤
│                        db.js                               │
│   IndexedDB layer (Promise wrapper, schema, migration)    │
├───────────────────────────────────────────────────────────┤
│                        pi-auth.js                          │
│   PiService: Pi.init → Pi.authenticate → POST /api/verify │
│   auto-auth on load + manual signIn/signOut + session mgmt│
├───────────────────────────────────────────────────────────┤
│                        script.js                           │
│   Logger + State + Evolution + STT + UI + init chain      │
│   init: DB.open → migrate → load → PiAuth → initApp       │
├───────────────────────────────────────────────────────────┤
│                     server/server.js                       │
│   POST /api/auth/verify  →  validate via GET /v2/me       │
│   GET /api/auth/session  →  session lookup                │
│   POST /api/auth/signout →  destroy session               │
│   serves static frontend files                             │
└───────────────────────────────────────────────────────────┘
```

---

## DATABASE SCHEMA (IndexedDB)

### Object Store: `meta`

| المفتاح | النوع | الشرح |
|---------|------|-------|
| `key` | string (`'app'`) | المفتاح الأساسي (ثابت) |
| `level` | number (1-5) | المستوى الحالي |
| `totalSessions` | number | إجمالي الجلسات |
| `totalWords` | number | إجمالي الكلمات |
| `firstDate` | string (ISO) | تاريخ أول استخدام |
| `lastDate` | string (ISO) | تاريخ آخر استخدام |
| `daysActive` | number | عدد الأيام النشطة |

### Object Store: `sessions`

| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | number (autoIncrement) | المفتاح الأساسي |
| `date` | string (`YYYY-MM-DD`) | تاريخ الجلسة |
| `text` | string | النص المسجل |
| `wordCount` | number | عدد الكلمات |
| `lastWord` | string | آخر كلمة |
| `lastSentence` | string | آخر جملة |
| `timestamp` | number (Date.now()) | طابع زمني دقيق |

```
Indexes: 'date', 'timestamp', 'wordCount'
```

---

## PI AUTH FLOW

```
المتصفح (Pi Browser)              الخادم (server.js)              Pi API
      │                                  │                           │
      │  Pi.init({version:'2.0'})        │                           │
      │─────────────────────────────────→│  (SDK يحقن window.Pi)    │
      │                                  │                           │
      │  Pi.authenticate(['username'])   │                           │
      │─────────────────────────────────→│                           │
      │  ← { user, accessToken }         │                           │
      │                                  │                           │
      │  POST /api/auth/verify           │                           │
      │  { accessToken }                 │                           │
      │─────────────────────────────────→│                           │
      │                                  │  GET /v2/me               │
      │                                  │  Authorization: Bearer..  │
      │                                  │──────────────────────────→│
      │                                  │  ← { id, username }       │
      │                                  │                           │
      │  ← { sessionToken, user }        │                           │
      │                                  │                           │
```

---

## FILES STRUCTURE

```
voiceai/
├── index.html      ← Pi SDK + auth-bar + voice UI
├── style.css       ← auth-bar styles + dark theme + levels
├── db.js           ← IndexedDB (Promise wrapper, migration)
├── pi-auth.js      ← Pi Network auth (auto-auth, signIn, signOut)
├── script.js       ← المنطق (Logger, State, Evolution, STT, UI)
├── tests.js        ← 56 اختبار وحدة
├── PROJECT_MAP.md  ← هذه الخريطة
└── server/
    ├── package.json    ← Express
    ├── server.js       ← /api/auth/verify + /api/auth/session
    └── node_modules/   ← (installed)
```

---

## LEVEL SYSTEM

| المستوى | الشرط | تأثير UI | التوقيع |
|---------|-------|----------|---------|
| 1 | افتراضي | أساسي | أبيض، خافت |
| 2 | 3 جلسات أو 2 أيام أو 20 كلمة | خلفية أعمق | زهري خافت |
| 3 | 7 جلسات أو 5 أيام أو 80 كلمة | ظل وردي + خلفية أغمق | وردي لامع |
| 4 | 15 جلسة أو 10 أيام أو 200 كلمة | ظل قوي + خلفية بنفسجية | أرجواني متوهج |
| 5 | 30 جلسة أو 21 يومًا أو 500 كلمة | border + gradient + توهج | توهج مزدوج |

---

## ORPHANS & PENDING

| البند | الحالة | ملاحظات |
|-------|--------|---------|
| Pi SDK في index.html | ✅ مكتمل | `<script src="https://sdk.minepi.com/pi-sdk.js">` |
| pi-auth.js: auto-auth | ✅ مكتمل | `attemptAutoAuth()` في سلسلة init |
| pi-auth.js: manual signIn | ✅ مكتمل | زر "تسجيل الدخول بPi" + معالج click |
| pi-auth.js: signOut | ✅ مكتمل | زر "تسجيل الخروج" |
| pi-auth.js: session persistence | ✅ مكتمل | localStorage + إعادة تحميل تلقائي |
| pi-auth.js: Pi.init كـ Promise | ✅ مكتمل | `await window.Pi.init({...})` قبل authenticate |
| server.js: POST /api/auth/verify | ✅ مكتمل | يتصل بـ GET /v2/me بـ Bearer token |
| server.js: GET /api/auth/session | ✅ مكتمل | التحقق من session |
| server.js: POST /api/auth/signout | ✅ مكتمل | حذف session |
| auth UI states | ✅ مكتمل | guest ↔ user مع username |
| CSS auth styles | ✅ مكتمل | .auth-bar, .btn-auth, .auth-username |
| fallback: لا Pi Browser | ✅ مكتمل | زر يبقى ظاهر، يعالج الخطأ بهدوء |
| IndexedDB: CRUD | ✅ مكتمل | جميع العمليات مع try/catch |
| SpeechRecognition | ✅ مكتمل | مع ترجمة أخطاء |
| 56 اختبار وحدة | ✅ مكتمل | جميعها ناجحة |

---

## PRINCIPLES

1. **Simplicity First** — أقل كود يحقق المطلوب
2. **Zero Unnecessary Dependencies** — لا React، لا jQuery
3. **Progressive Enhancement** — الميزات تظهر مع الوقت
4. **Self-Contained** — يعمل من `node server/server.js`
5. **No Silent Failures** — كل `catch` يعالج أو يسجل
6. **Graceful Degradation** — IndexedDB → localStorage → مستخدم يعلم
