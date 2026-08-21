# מדריך חיבור ישיר ל-APIs (בלי תוכנת צד שלישי) 🔌

ממלאים את הערכים ב-**api_config.json** ומריצים `python fetch_data.py`.
שדה שנשאר ריק — הערוץ פשוט מדולג ונשאר בדמו.

---

## 1️⃣ Meta — פייסבוק + אינסטגרם + פייסבוק אדס (טוקן אחד לכולם, חינם)

### יצירת אפליקציה
1. היכנסו ל-https://developers.facebook.com → **My Apps** → **Create App**.
2. סוג: **Business** (או "Other" → Business). שם חופשי, למשל "Dashboard".

### הפקת טוקן
3. פתחו את **Graph API Explorer**: https://developers.facebook.com/tools/explorer
4. בחרו את האפליקציה שיצרתם, ולחצו **Add Permissions** והוסיפו:
   `pages_show_list`, `pages_read_engagement`, `read_insights`,
   `instagram_basic`, `instagram_manage_insights`, `ads_read`
5. לחצו **Generate Access Token** ואשרו את החיבור לעמודים/חשבונות שלכם.
6. הטוקן שנוצר תקף לשעה. כדי להאריך ל-**60 יום**: פתחו את
   https://developers.facebook.com/tools/debug/accesstoken , הדביקו את הטוקן,
   ולחצו **Extend Access Token** למטה. העתיקו את הטוקן המוארך → `meta.access_token`.

### איתור המזהים
7. **page_id**: ב-Graph Explorer הריצו `me/accounts` — תקבלו רשימת עמודים עם `id`.
8. **instagram_id**: הריצו `{page_id}?fields=instagram_business_account` —
   ה-`id` שחוזר הוא של חשבון האינסטגרם העסקי (חייב להיות מקושר לעמוד).
9. **ad_account_id**: ב-Ads Manager → Settings, או הריצו `me/adaccounts`.
   הפורמט: `act_123456789`.

> 🔁 הטוקן פג כל 60 יום — חוזרים על שלבים 5–6 ומעדכנים את הקובץ.
> (אפשר גם להגדיר System User ב-Business Manager לטוקן ללא תפוגה — מתקדם.)

---

## 2️⃣ YouTube (חינם, 5 דקות)

1. https://console.cloud.google.com → צרו פרויקט (או בחרו קיים).
2. **APIs & Services → Library** → חפשו **YouTube Data API v3** → **Enable**.
3. **APIs & Services → Credentials → Create Credentials → API key** → העתיקו → `youtube.api_key`.
4. **channel_id**: ביוטיוב סטודיו → Settings → Channel → Advanced settings,
   או בכתובת הערוץ (`youtube.com/channel/UC...`). מתחיל ב-`UC`.

> ⚠️ מפתח API נותן: סרטונים אחרונים + צפיות/לייקים/תגובות + מספר מנויים (אמיתי).
> סדרה יומית של צפיות דורשת YouTube **Analytics** API עם OAuth — שלב מתקדם, אפשר להוסיף בהמשך.

---

## 3️⃣ מה עם טיקטוק ו-X?

| פלטפורמה | מצב |
|---|---|
| **TikTok** | דורש הגשת אפליקציה לאישור ב-https://developers.tiktok.com (Display API). אפשר להוסיף אחרי שמקבלים אישור. |
| **X (טוויטר)** | קריאת נתונים ב-API מתחילה בכ-$200/חודש — לרוב לא משתלם. נשאר דמו. |
| **Google Ads** | API חינמי אך דורש Developer Token באישור גוגל: https://developers.google.com/google-ads/api/docs/get-started/dev-token — אם תרצו, נוסיף אחרי שיאושר. |

---

## הרצה

```
pip install requests
python fetch_data.py
```

הסקריפט מעדכן את `data.js` בלבד. ערוצים שחוברו יקבלו תג ירוק "● מחובר" בדאשבורד.
המשימה היומית (07:00) מריצה את הסקריפט אוטומטית אם מולאו טוקנים.

## אבטחה 🔒
הטוקנים נשמרים רק ב-`api_config.json` על המחשב שלכם. אל תשתפו את הקובץ ואל תעלו אותו לאינטרנט.
