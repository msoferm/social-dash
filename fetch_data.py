# -*- coding: utf-8 -*-
"""
משיכת נתונים אמיתיים ישירות מה-APIs (בלי תוכנת צד שלישי) ועדכון data.js
  - Meta Graph API: פייסבוק (אורגני), אינסטגרם, פייסבוק אדס
  - YouTube Data API: סרטונים אחרונים + מנויים (סדרה יומית דורשת OAuth — ראו SETUP_API.md)

הרצה:  pip install requests   ואז   python fetch_data.py
ערוץ שאין לו טוקן ב-api_config.json — מדולג ונשאר עם הנתונים הקיימים (דמו).
"""
import json, sys, datetime, pathlib, time

try:
    import requests
except ImportError:
    sys.exit("חסרה ספריית requests — הריצו:  pip install requests")

BASE = pathlib.Path(__file__).parent
GRAPH = "https://graph.facebook.com/v23.0"
CFG = json.loads((BASE / "api_config.json").read_text(encoding="utf-8"))
DAYS = int(CFG.get("days_back", 90))
TOP_N = int(CFG.get("top_posts_per_platform", 8))
TODAY = datetime.date.today()
SINCE = TODAY - datetime.timedelta(days=DAYS)
ALL_DATES = [(SINCE + datetime.timedelta(days=i)).isoformat() for i in range(DAYS)]

refreshed = []   # channel keys that got real data


# ---------------------------------------------------------------- helpers
def gget(path, **params):
    """Meta Graph API GET with error surfacing."""
    params.setdefault("access_token", CFG["meta"]["access_token"])
    r = requests.get(f"{GRAPH}/{path}", params=params, timeout=40)
    j = r.json()
    if "error" in j:
        raise RuntimeError(j["error"].get("message", "Graph API error"))
    return j


def gget_all(path, **params):
    """Follow Graph pagination, return all data rows."""
    rows, url, prm = [], f"{GRAPH}/{path}", dict(params)
    prm.setdefault("access_token", CFG["meta"]["access_token"])
    while url:
        r = requests.get(url, params=prm, timeout=40).json()
        if "error" in r:
            raise RuntimeError(r["error"].get("message"))
        rows += r.get("data", [])
        url = r.get("paging", {}).get("next")
        prm = {}  # next url already contains params
    return rows


def empty_organic():
    return {d: {"date": d, "reach": 0, "likes": 0, "comments": 0,
                "shares": 0, "followers": 0} for d in ALL_DATES}


def chunks_30d():
    """IG insights allow max 30 days per call."""
    cur = SINCE
    while cur < TODAY:
        end = min(cur + datetime.timedelta(days=30), TODAY)
        yield cur, end
        cur = end


def day_of(end_time):
    """Graph period=day: value covers the 24h ENDING at end_time."""
    d = datetime.date.fromisoformat(end_time[:10]) - datetime.timedelta(days=1)
    return d.isoformat()


def forward_fill_followers(daily):
    last = 0
    for d in ALL_DATES:
        if daily[d]["followers"]:
            last = daily[d]["followers"]
        else:
            daily[d]["followers"] = last
    # back-fill leading zeros with first known value
    first = next((daily[d]["followers"] for d in ALL_DATES if daily[d]["followers"]), 0)
    for d in ALL_DATES:
        if daily[d]["followers"] == 0:
            daily[d]["followers"] = first
        else:
            break


# ---------------------------------------------------------------- Facebook page (organic)
def fetch_facebook():
    pid = CFG["meta"]["page_id"]
    daily = empty_organic()

    # daily reach
    try:
        j = gget(f"{pid}/insights", metric="page_impressions_unique",
                 period="day", since=SINCE.isoformat(), until=TODAY.isoformat())
        for v in j["data"][0]["values"]:
            d = day_of(v["end_time"])
            if d in daily:
                daily[d]["reach"] = v.get("value", 0) or 0
    except Exception as e:
        print("  ⚠ FB reach:", e)

    # followers (page fans)
    try:
        j = gget(f"{pid}/insights", metric="page_fans", period="day",
                 since=SINCE.isoformat(), until=TODAY.isoformat())
        for v in j["data"][0]["values"]:
            d = day_of(v["end_time"])
            if d in daily:
                daily[d]["followers"] = v.get("value", 0) or 0
    except Exception as e:
        print("  ⚠ FB followers:", e)
        try:  # fallback: current fan_count
            fc = gget(pid, fields="fan_count").get("fan_count", 0)
            for d in ALL_DATES:
                daily[d]["followers"] = fc
        except Exception:
            pass
    forward_fill_followers(daily)

    # posts → daily likes/comments/shares + top posts
    posts_out = []
    try:
        posts = gget_all(f"{pid}/published_posts", limit=100,
                         fields="message,created_time,shares,"
                                "reactions.summary(total_count),comments.summary(total_count)")
        for p in posts:
            d = p.get("created_time", "")[:10]
            if d < SINCE.isoformat():
                continue
            likes = p.get("reactions", {}).get("summary", {}).get("total_count", 0)
            comments = p.get("comments", {}).get("summary", {}).get("total_count", 0)
            shares = p.get("shares", {}).get("count", 0)
            if d in daily:
                daily[d]["likes"] += likes
                daily[d]["comments"] += comments
                daily[d]["shares"] += shares
            posts_out.append({"platform": "facebook", "id": p.get("id"),
                              "title": (p.get("message") or "(פוסט ללא טקסט)")[:90],
                              "date": d, "type": "organic", "reach": 0,
                              "likes": likes, "comments": comments, "shares": shares})
        # reach for top posts only (one API call each)
        posts_out.sort(key=lambda x: x["likes"] + x["comments"] + x["shares"], reverse=True)
        posts_out = posts_out[:TOP_N]
        for p in posts_out:
            try:
                ji = gget(f"{p.pop('id')}/insights", metric="post_impressions_unique")
                p["reach"] = ji["data"][0]["values"][0].get("value", 0)
            except Exception:
                p.pop("id", None)
    except Exception as e:
        print("  ⚠ FB posts:", e)

    return [daily[d] for d in ALL_DATES], posts_out


# ---------------------------------------------------------------- Instagram (organic)
def fetch_instagram():
    ig = CFG["meta"]["instagram_id"]
    daily = empty_organic()

    # daily reach + follower_count (chunks of 30 days)
    for s, e in chunks_30d():
        for metric, key in (("reach", "reach"), ("follower_count", "followers")):
            try:
                j = gget(f"{ig}/insights", metric=metric, period="day",
                         since=s.isoformat(), until=e.isoformat())
                for v in j["data"][0]["values"]:
                    d = day_of(v["end_time"])
                    if d in daily:
                        daily[d][key] = v.get("value", 0) or 0
            except Exception as ex:
                if metric == "reach":
                    print(f"  ⚠ IG {metric} {s}–{e}:", ex)
    try:  # current total followers as baseline
        fc = gget(ig, fields="followers_count").get("followers_count", 0)
        if fc and not any(daily[d]["followers"] for d in ALL_DATES):
            for d in ALL_DATES:
                daily[d]["followers"] = fc
    except Exception:
        pass
    forward_fill_followers(daily)

    # media → daily likes/comments + top posts
    posts_out = []
    try:
        media = gget_all(f"{ig}/media", limit=100,
                         fields="caption,timestamp,like_count,comments_count,media_product_type")
        for m in media:
            d = m.get("timestamp", "")[:10]
            if d < SINCE.isoformat() or d not in daily:
                continue
            likes, comments = m.get("like_count", 0) or 0, m.get("comments_count", 0) or 0
            daily[d]["likes"] += likes
            daily[d]["comments"] += comments
            posts_out.append({"platform": "instagram", "id": m.get("id"),
                              "title": (m.get("caption") or "(ללא כיתוב)")[:90],
                              "date": d, "type": "organic", "reach": 0,
                              "likes": likes, "comments": comments, "shares": 0})
        posts_out.sort(key=lambda x: x["likes"] + x["comments"], reverse=True)
        posts_out = posts_out[:TOP_N]
        for p in posts_out:  # reach + shares per top media
            try:
                ji = gget(f"{p['id']}/insights", metric="reach,shares")
                for row in ji.get("data", []):
                    val = row["values"][0].get("value", 0)
                    if row["name"] == "reach":
                        p["reach"] = val
                    elif row["name"] == "shares":
                        p["shares"] = val
            except Exception:
                pass
            p.pop("id", None)
    except Exception as e:
        print("  ⚠ IG media:", e)

    return [daily[d] for d in ALL_DATES], posts_out


# ---------------------------------------------------------------- Facebook Ads (paid)
def fetch_fb_ads():
    acct = CFG["meta"]["ad_account_id"]
    if not acct.startswith("act_"):
        acct = "act_" + acct
    daily = {d: {"date": d, "spend": 0.0, "impressions": 0, "clicks": 0,
                 "conversions": 0} for d in ALL_DATES}
    rows = gget_all(f"{acct}/insights", time_increment=1, level="account", limit=500,
                    time_range=json.dumps({"since": SINCE.isoformat(),
                                           "until": TODAY.isoformat()}),
                    fields="spend,impressions,clicks,actions")
    conv_types = ("lead", "purchase", "offsite_conversion")
    for r in rows:
        d = r.get("date_start")
        if d not in daily:
            continue
        daily[d]["spend"] += float(r.get("spend", 0) or 0)
        daily[d]["impressions"] += int(r.get("impressions", 0) or 0)
        daily[d]["clicks"] += int(r.get("clicks", 0) or 0)
        for a in r.get("actions", []) or []:
            if any(a.get("action_type", "").startswith(t) for t in conv_types):
                daily[d]["conversions"] += int(float(a.get("value", 0) or 0))
    for d in ALL_DATES:
        daily[d]["spend"] = round(daily[d]["spend"], 2)
    return [daily[d] for d in ALL_DATES]


# ---------------------------------------------------------------- YouTube (Data API)
def fetch_youtube_posts():
    """סרטונים אחרונים כ'פוסטים' (אמיתי). סדרה יומית דורשת OAuth — נשארת דמו."""
    key, ch = CFG["youtube"]["api_key"], CFG["youtube"]["channel_id"]
    YT = "https://www.googleapis.com/youtube/v3"

    j = requests.get(f"{YT}/channels", params={"part": "contentDetails,statistics",
                                               "id": ch, "key": key}, timeout=30).json()
    if "error" in j:
        raise RuntimeError(j["error"].get("message"))
    if not j.get("items"):
        raise RuntimeError("ערוץ לא נמצא — בדקו את channel_id")
    uploads = j["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    subs = int(j["items"][0]["statistics"].get("subscriberCount", 0))

    j2 = requests.get(f"{YT}/playlistItems", params={"part": "snippet", "playlistId": uploads,
                                                     "maxResults": 25, "key": key}, timeout=30).json()
    vids = [(it["snippet"]["resourceId"]["videoId"], it["snippet"]["title"],
             it["snippet"]["publishedAt"][:10]) for it in j2.get("items", [])]
    if not vids:
        return [], subs
    j3 = requests.get(f"{YT}/videos", params={"part": "statistics",
                                              "id": ",".join(v[0] for v in vids),
                                              "key": key}, timeout=30).json()
    stats = {it["id"]: it.get("statistics", {}) for it in j3.get("items", [])}
    posts = []
    for vid, title, d in vids:
        if d < SINCE.isoformat():
            continue
        s = stats.get(vid, {})
        posts.append({"platform": "youtube", "title": title[:90], "date": d,
                      "type": "organic", "reach": int(s.get("viewCount", 0)),
                      "likes": int(s.get("likeCount", 0)),
                      "comments": int(s.get("commentCount", 0)), "shares": 0})
    posts.sort(key=lambda x: x["reach"], reverse=True)
    return posts[:TOP_N], subs


# ---------------------------------------------------------------- main
def main():
    data_path = BASE / "data.js"
    raw = data_path.read_text(encoding="utf-8")
    data = json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))
    new_posts_platforms = set()

    if CFG["meta"]["access_token"]:
        if CFG["meta"]["page_id"]:
            print("פייסבוק (אורגני)...")
            try:
                daily, posts = fetch_facebook()
                data["channels"]["facebook"] = {"isDemo": False, "daily": daily}
                data["posts"] = [p for p in data["posts"] if p["platform"] != "facebook"] + posts
                new_posts_platforms.add("facebook")
                refreshed.append("פייסבוק")
            except Exception as e:
                print("  ✗ נכשל:", e)
        if CFG["meta"]["instagram_id"]:
            print("אינסטגרם...")
            try:
                daily, posts = fetch_instagram()
                data["channels"]["instagram"] = {"isDemo": False, "daily": daily}
                data["posts"] = [p for p in data["posts"] if p["platform"] != "instagram"] + posts
                refreshed.append("אינסטגרם")
            except Exception as e:
                print("  ✗ נכשל:", e)
        if CFG["meta"]["ad_account_id"]:
            print("פייסבוק אדס...")
            try:
                data["channels"]["facebookAds"] = {"isDemo": False, "daily": fetch_fb_ads()}
                refreshed.append("פייסבוק אדס")
            except Exception as e:
                print("  ✗ נכשל:", e)
    else:
        print("Meta: אין access_token — מדלג (פייסבוק/אינסטגרם/פייסבוק אדס נשארים דמו)")

    if CFG["youtube"]["api_key"] and CFG["youtube"]["channel_id"]:
        print("יוטיוב...")
        try:
            posts, subs = fetch_youtube_posts()
            data["posts"] = [p for p in data["posts"] if p["platform"] != "youtube"] + posts
            # עדכון מנויים אמיתי על הסדרה הקיימת (הסדרה היומית עצמה דורשת OAuth)
            for row in data["channels"]["youtube"]["daily"]:
                row["followers"] = subs
            refreshed.append("יוטיוב (סרטונים + מנויים)")
        except Exception as e:
            print("  ✗ נכשל:", e)
    else:
        print("YouTube: אין api_key/channel_id — מדלג")

    data["generatedAt"] = datetime.datetime.now().isoformat(timespec="seconds")
    data["isDemo"] = any(ch.get("isDemo", True) for ch in data["channels"].values())

    out = ("// נוצר אוטומטית ע\"י fetch_data.py — אל תערכו ידנית\n"
           "window.DASH_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n")
    data_path.write_text(out, encoding="utf-8")
    print("\n✓ data.js עודכן.", ("ערוצים שרועננו: " + ", ".join(refreshed)) if refreshed
          else "לא רוענן אף ערוץ — בדקו את api_config.json")


if __name__ == "__main__":
    main()
