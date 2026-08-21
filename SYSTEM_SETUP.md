# מערכת דאשבורד שיווק — מדריך הקמה 🚀

מערכת וובית מלאה: **React + Supabase (Auth + Postgres) + Docker**.
כוללת לוח תוכן (Content Calendar) עם תצוגה חודשית/יומית, ודאשבורד אנליטיקס לכל הערוצים.

---

## מבנה הפרויקט
```
social dash/
├─ app/                 # אפליקציית React (Vite)
│  ├─ src/pages/        # Login, CalendarPage, Dashboard
│  ├─ src/components/   # Layout
│  ├─ src/context/      # AuthContext (Supabase Auth)
│  ├─ Dockerfile + nginx.conf
├─ supabase/migrations/ # 0001_init.sql — סכימת בסיס הנתונים
├─ ingestion/           # סקריפטי משיכת נתונים → Supabase
│  └─ seed_from_datajs.mjs
├─ docker-compose.yml
└─ (קבצים ישנים: index.html, data.js, youtube_oauth.mjs — נשמרים כמקור נתונים)
```

---

## שלב 1 — יצירת פרויקט Supabase
1. היכנס ל-https://supabase.com → **New Project** (חינם).
2. שם: `social-dash`, בחר אזור קרוב, קבע סיסמת DB.
3. אחרי היצירה: **Project Settings → API** — העתק:
   - **Project URL**
   - **anon public key**
   - **service_role key** (סודי!)

## שלב 2 — הרצת הסכימה
ב-Supabase → **SQL Editor** → הדבק את התוכן של
[supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) → **Run**.
(יוצר טבלאות: profiles, channels, metrics_daily, posts, calendar_items + RLS.)

## שלב 3 — כיבוי הרשמה פתוחה (אדמין מוסיף משתמשים)
ב-Supabase → **Authentication → Providers → Email** → כבה **"Enable Sign-ups"**.
כך רק אתה (דרך הדשבורד של Supabase) יוצר משתמשים.

## שלב 4 — יצירת משתמש אדמין
1. **Authentication → Users → Add user** → הזן אימייל+סיסמה (Auto Confirm).
2. הפוך אותו לאדמין: **SQL Editor** →
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR@EMAIL.com');
   ```

## שלב 5 — ייבוא הנתונים הקיימים (כולל יוטיוב האמיתי)
```bash
cd ingestion
cp .env.example .env      # מלא SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
npm run seed
```

## שלב 6 — הרצת האפליקציה

### פיתוח (מקומי)
```bash
cd app
cp .env.example .env.local   # מלא VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:5173
```

### Docker (פרודקשן)
צור בשורש `.env` עם:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
ואז:
```bash
docker compose up --build -d   # http://localhost:8080
```

---

## הוספת משתמשים חדשים (אדמין)
Supabase → **Authentication → Users → Add user**. המשתמש יקבל תפקיד `member`
אוטומטית (יכול לערוך את לוח התוכן). לשדרוג לאדמין — ראה שלב 4.

## עדכון נתוני יוטיוב אמיתיים
כרגע נתוני יוטיוב נמשכים ל-`data.js` ואז מיובאים דרך `seed`. השלב הבא בתכנון:
חיבור ישיר של `youtube_oauth.mjs` שיכתוב ל-Supabase, והרצה מתוזמנת (cron / Supabase Edge Function).

---

## מה כבר עובד
- ✅ התחברות משתמשים (Supabase Auth) + הגנת נתיבים
- ✅ לוח תוכן: תצוגה חודשית, לחיצה על יום → הוספה/עריכה של אייטמים
  (כותרת, שעת עלייה, סוג, סטטוס עריכה: רעיון→בעריכה→סיים עריכה→מתוזמן→עלה, אחראי, הערות)
- ✅ דאשבורד אנליטיקס: כרטיסי סיכום, גרף מגמה, טבלת פוסטים מובילים, תגי "מחובר/דמו"
- ✅ Docker + RLS

## בתכנון (שלבים הבאים)
- מסך ניהול משתמשים בתוך האפליקציה (לאדמין)
- משיכת Meta (פייסבוק/אינסטגרם/מודעות) — ממתין לטוקן
- Google Ads API — הוצאת קידום לכל סרטון
- משיכות מתוזמנות אוטומטיות
