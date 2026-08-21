// משיכת כל הסרטונים מיוטיוב → זיהוי שורטים → פילוח אורגני/ממומן → Supabase (yt_videos)
// דורש: api_config.json (api_key, channel_id, oauth) + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(readFileSync(join(BASE, "api_config.json"), "utf-8"));
const YT = CFG.youtube;
const KEY = YT.api_key, CH = YT.channel_id;
const DATA_API = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const today = new Date().toISOString().slice(0, 10);

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("חסר SUPABASE_URL/SERVICE_ROLE"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function getJSON(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j;
}

// ISO8601 → שניות
function durationToSec(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || [];
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

// זיהוי שורט: כתובת /shorts/ מחזירה 200; סרטון רגיל מפנה (3xx). נפילה חזרה: משך ≤ 60ש'
async function isShort(id, durationSec) {
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, {
      method: "GET", redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (r.status === 200) return true;
    if (r.status >= 300 && r.status < 400) return false;
  } catch { /* ignore */ }
  return durationSec > 0 && durationSec <= 60;
}

async function accessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YT.oauth_client_id, client_secret: YT.oauth_client_secret,
      refresh_token: YT.oauth_refresh_token, grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error_description || j.error);
  return j.access_token;
}

// פילוח אורגני/ממומן לסרטון בודד
async function trafficSplit(token, videoId, startDate) {
  const u = new URL(ANALYTICS);
  Object.entries({
    ids: `channel==${CH}`, startDate, endDate: today,
    metrics: "views", dimensions: "insightTrafficSourceType", filters: `video==${videoId}`,
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  let j = await (await fetch(u, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (j.error) { // נפילה חזרה ל-MINE
    u.searchParams.set("ids", "channel==MINE");
    j = await (await fetch(u, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  let paid = 0, organic = 0;
  for (const [src, views] of j.rows || []) {
    if (src === "ADVERTISING") paid += views; else organic += views;
  }
  return { paid, organic };
}

async function main() {
  // 1) כל מזהי הסרטונים מרשימת ההעלאות
  const chJ = await getJSON(`${DATA_API}/channels`, { part: "contentDetails", id: CH, key: KEY });
  const uploads = chJ.items[0].contentDetails.relatedPlaylists.uploads;
  const ids = [];
  let pageToken = "";
  do {
    const p = await getJSON(`${DATA_API}/playlistItems`, {
      part: "contentDetails", playlistId: uploads, maxResults: 50, key: KEY,
      ...(pageToken ? { pageToken } : {}),
    });
    ids.push(...p.items.map((it) => it.contentDetails.videoId));
    pageToken = p.nextPageToken || "";
  } while (pageToken);
  console.log(`נמצאו ${ids.length} סרטונים`);

  // 2) פרטים + סטטיסטיקות (באצ'ים של 50)
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const v = await getJSON(`${DATA_API}/videos`, {
      part: "snippet,contentDetails,statistics", id: batch.join(","), key: KEY,
    });
    for (const it of v.items) {
      const dur = durationToSec(it.contentDetails.duration);
      videos.push({
        video_id: it.id,
        title: it.snippet.title,
        published_at: it.snippet.publishedAt.slice(0, 10),
        duration_seconds: dur,
        views: +(it.statistics.viewCount || 0),
        likes: +(it.statistics.likeCount || 0),
        comments: +(it.statistics.commentCount || 0),
      });
    }
  }

  // 3) זיהוי שורטים
  for (const v of videos) v.is_short = await isShort(v.video_id, v.duration_seconds);
  const shorts = videos.filter((v) => v.is_short);
  console.log(`מתוכם שורטים: ${shorts.length}`);

  // 4) פילוח אורגני/ממומן — לשורטים בלבד
  try {
    const token = await accessToken();
    for (const v of shorts) {
      const { paid, organic } = await trafficSplit(token, v.video_id, v.published_at);
      v.paid_views = paid;
      v.organic_views = organic;
    }
    console.log("✓ פילוח אורגני/ממומן הושלם");
  } catch (e) {
    console.log("⚠ דילוג על פילוח (Analytics):", e.message);
  }

  // 5) שמירה
  for (let i = 0; i < videos.length; i += 500) {
    const r = await db.from("yt_videos").upsert(
      videos.slice(i, i + 500).map((v) => ({ ...v, updated_at: new Date().toISOString() })),
      { onConflict: "video_id" }
    );
    if (r.error) throw r.error;
  }
  const totalPaid = shorts.reduce((s, v) => s + (v.paid_views || 0), 0);
  const totalOrg = shorts.reduce((s, v) => s + (v.organic_views || 0), 0);
  console.log(`\n✅ נשמרו ${videos.length} סרטונים (${shorts.length} שורטים).`);
  console.log(`   שורטים — צפיות אורגניות: ${totalOrg.toLocaleString()} | ממומנות: ${totalPaid.toLocaleString()}`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
