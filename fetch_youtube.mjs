// משיכת נתוני יוטיוב אמיתיים ועדכון data.js (מקבילה ל-fetch_data.py, ללא Python)
// הרצה:  node fetch_youtube.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(readFileSync(join(BASE, "api_config.json"), "utf-8"));
const DAYS = Number(CFG.days_back ?? 90);
const TOP_N = Number(CFG.top_posts_per_platform ?? 8);
const YT = "https://www.googleapis.com/youtube/v3";

const today = new Date();
const since = new Date(today.getTime() - DAYS * 86400000);
const sinceStr = since.toISOString().slice(0, 10);

async function getJSON(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { signal: AbortSignal.timeout(40000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "YouTube API error");
  return j;
}

async function fetchYouTube() {
  const { api_key: key, channel_id: ch } = CFG.youtube;
  const j = await getJSON(`${YT}/channels`, { part: "contentDetails,statistics", id: ch, key });
  if (!j.items?.length) throw new Error("ערוץ לא נמצא — בדקו את channel_id");
  const uploads = j.items[0].contentDetails.relatedPlaylists.uploads;
  const subs = parseInt(j.items[0].statistics.subscriberCount || "0", 10);

  const j2 = await getJSON(`${YT}/playlistItems`, { part: "snippet", playlistId: uploads, maxResults: 25, key });
  const vids = (j2.items || []).map((it) => [
    it.snippet.resourceId.videoId,
    it.snippet.title,
    it.snippet.publishedAt.slice(0, 10),
  ]);
  if (!vids.length) return { posts: [], subs };

  const j3 = await getJSON(`${YT}/videos`, { part: "statistics", id: vids.map((v) => v[0]).join(","), key });
  const stats = Object.fromEntries((j3.items || []).map((it) => [it.id, it.statistics || {}]));

  let posts = [];
  for (const [vid, title, d] of vids) {
    if (d < sinceStr) continue;
    const s = stats[vid] || {};
    posts.push({
      platform: "youtube",
      title: title.slice(0, 90),
      date: d,
      type: "organic",
      reach: parseInt(s.viewCount || "0", 10),
      likes: parseInt(s.likeCount || "0", 10),
      comments: parseInt(s.commentCount || "0", 10),
      shares: 0,
    });
  }
  posts.sort((a, b) => b.reach - a.reach);
  return { posts: posts.slice(0, TOP_N), subs };
}

async function main() {
  const dataPath = join(BASE, "data.js");
  const raw = readFileSync(dataPath, "utf-8");
  const data = JSON.parse(raw.slice(raw.indexOf("=") + 1).trim().replace(/;\s*$/, ""));
  const refreshed = [];

  if (CFG.youtube.api_key && CFG.youtube.channel_id) {
    console.log("יוטיוב...");
    try {
      const { posts, subs } = await fetchYouTube();
      data.posts = data.posts.filter((p) => p.platform !== "youtube").concat(posts);
      for (const row of data.channels.youtube.daily) row.followers = subs;
      refreshed.push(`יוטיוב (${posts.length} סרטונים, ${subs.toLocaleString()} מנויים)`);
    } catch (e) {
      console.log("  ✗ נכשל:", e.message);
    }
  } else {
    console.log("YouTube: אין api_key/channel_id — מדלג");
  }

  data.generatedAt = new Date().toISOString().slice(0, 19);
  data.isDemo = Object.values(data.channels).some((ch) => ch.isDemo ?? true);

  const out =
    '// נוצר אוטומטית ע"י fetch_youtube.mjs — אל תערכו ידנית\n' +
    "window.DASH_DATA = " + JSON.stringify(data) + ";\n";
  writeFileSync(dataPath, out, "utf-8");
  console.log("\n✓ data.js עודכן.", refreshed.length ? "רועננו: " + refreshed.join(", ") : "לא רוענן כלום");
}

main();
