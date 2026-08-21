# -*- coding: utf-8 -*-
"""
מחולל נתוני דמו לדאשבורד — יוצר/מעדכן את data.js
הרצה: python generate_demo_data.py
כשיהיו נתונים אמיתיים (Supermetrics), קובץ data.js פשוט יוחלף באותו מבנה.
"""
import json, random, datetime

DAYS = 90
today = datetime.date.today()
random.seed(42)

def dates():
    return [(today - datetime.timedelta(days=i)).isoformat() for i in range(DAYS - 1, -1, -1)]

def trend(base, vol, growth=1.0):
    out, v = [], base
    for _ in range(DAYS):
        v = max(0, v * random.uniform(1 - vol, 1 + vol) * growth)
        out.append(v)
    return out

def paid_channel(spend_base, cpc, cpm_factor):
    sp = trend(spend_base, 0.25, 1.002)
    days = []
    for d, s in zip(dates(), sp):
        # weekends lower
        wd = datetime.date.fromisoformat(d).weekday()
        s *= 0.55 if wd in (4, 5) else 1.0
        imp = s / cpm_factor * 1000
        clicks = s / cpc
        days.append({"date": d, "spend": round(s, 2),
                     "impressions": int(imp), "clicks": int(clicks),
                     "conversions": int(clicks * random.uniform(0.02, 0.06))})
    return days

def organic_channel(reach_base, eng_rate, followers_start, follow_growth):
    rc = trend(reach_base, 0.35, 1.003)
    days, followers = [], followers_start
    for d, r in zip(dates(), rc):
        eng = r * eng_rate
        likes = eng * random.uniform(0.6, 0.75)
        comments = eng * random.uniform(0.08, 0.18)
        shares = eng * random.uniform(0.05, 0.15)
        followers += random.randint(*follow_growth)
        days.append({"date": d, "reach": int(r), "likes": int(likes),
                     "comments": int(comments), "shares": int(shares),
                     "followers": followers})
    return days

data = {
    "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
    "isDemo": True,
    "channels": {
        "googleAds":   {"isDemo": True, "daily": paid_channel(320, 2.8, 38)},
        "facebookAds": {"isDemo": True, "daily": paid_channel(260, 1.9, 22)},
        "facebook":    {"isDemo": True, "daily": organic_channel(4200, 0.045, 12400, (2, 18))},
        "instagram":   {"isDemo": True, "daily": organic_channel(6800, 0.07, 8900, (5, 35))},
        "tiktok":      {"isDemo": True, "daily": organic_channel(15000, 0.09, 4300, (10, 80))},
        "youtube":     {"isDemo": True, "daily": organic_channel(2600, 0.035, 2100, (0, 12))},
        "twitter":     {"isDemo": True, "daily": organic_channel(1900, 0.025, 1500, (0, 8))},
    },
    "posts": []
}

# demo posts
titles = [
    ("instagram", "ריל: מאחורי הקלעים של הפרויקט החדש"),
    ("tiktok", "טרנד: 3 טיפים לקמפיין ממומן מנצח"),
    ("facebook", "פוסט: סיכום חודש — תוצאות הלקוחות שלנו"),
    ("youtube", "סרטון: מדריך Google Ads למתחילים 2026"),
    ("instagram", "קרוסלה: לפני/אחרי — עיצוב דף נחיתה"),
    ("tiktok", "ואלוג: יום בחיי מנהל קמפיינים"),
    ("facebook", "שאלת השבוע: כמה תקציב צריך באמת?"),
    ("twitter", "שרשור: 7 טעויות נפוצות בפייסבוק אדס"),
    ("instagram", "סטורי מודבק: המלצת לקוח — מכביס"),
    ("youtube", "שורטס: הגדרת קהלים ב-2 דקות"),
    ("tiktok", "לייב חתוך: שאלות ותשובות על טיקטוק אדס"),
    ("facebook", "פוסט ממומן: וובינר חינם — הרשמה"),
    ("twitter", "ציוץ: תחזית מגמות דיגיטל לרבעון הבא"),
    ("instagram", "ריל ממומן: קמפיין חגיגת השקה"),
]
for i, (platform, title) in enumerate(titles):
    d = today - datetime.timedelta(days=random.randint(1, 28))
    reach = int(random.uniform(1500, 48000))
    eng = reach * random.uniform(0.03, 0.12)
    is_paid = "ממומן" in title
    data["posts"].append({
        "platform": platform, "title": title, "date": d.isoformat(),
        "type": "paid" if is_paid else "organic",
        "reach": reach,
        "likes": int(eng * 0.68), "comments": int(eng * 0.14), "shares": int(eng * 0.18)
    })

with open("data.js", "w", encoding="utf-8") as f:
    f.write("// נוצר אוטומטית — אל תערכו ידנית. להרצה מחדש: python generate_demo_data.py\n")
    f.write("window.DASH_DATA = ")
    json.dump(data, f, ensure_ascii=False)
    f.write(";\n")

print("data.js written:", sum(len(c["daily"]) for c in data["channels"].values()), "rows,", len(data["posts"]), "posts")
