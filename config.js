// ============================================================
//  קובץ הגדרות הדאשבורד — ערכו כאן פרמטרים בחופשיות
//  כל שינוי נטען אוטומטית ברענון הדף (F5)
// ============================================================
window.DASH_CONFIG = {

  // כותרת הדאשבורד
  title: "דאשבורד שיווק דיגיטלי",
  subtitle: "כל הערוצים במקום אחד",

  // מטבע להצגת הוצאות פרסום
  currency: "₪",

  // טווח ברירת מחדל בימים (7 / 30 / 90)
  defaultRange: 30,

  // יעד הוצאה יומי (₪) — קו מקווקו בגרף ההוצאות. 0 = ללא קו
  dailySpendTarget: 0,

  // ערוצים: ניתן לכבות ערוץ (enabled:false), לשנות שם או צבע
  channels: {
    googleAds:   { enabled: true, name: "Google Ads",     color: "#4285F4", kind: "paid"    },
    facebookAds: { enabled: true, name: "Facebook Ads",   color: "#1877F2", kind: "paid"    },
    facebook:    { enabled: true, name: "פייסבוק (אורגני)", color: "#3b5998", kind: "organic" },
    instagram:   { enabled: true, name: "אינסטגרם",        color: "#E1306C", kind: "organic" },
    tiktok:      { enabled: true, name: "טיקטוק",          color: "#00f2ea", kind: "organic" },
    youtube:     { enabled: true, name: "יוטיוב",          color: "#FF0000", kind: "organic" },
    twitter:     { enabled: true, name: "X (טוויטר)",      color: "#e7e9ea", kind: "organic" }
  },

  // כמה פוסטים להציג בטבלת "פוסטים מובילים"
  topPostsCount: 10,

  // הצגת תג "דמו" על ערוצים שעדיין לא מחוברים לנתונים אמיתיים
  showDemoBadge: true
};
