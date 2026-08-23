// משיכת אנליטיקס יומי של יוטיוב (90 יום אחרונים) → metrics_daily ב-Supabase
// צפיות/לייקים/תגובות/שיתופים ליום + מספר מנויים. דורש טוקן OAuth יציב.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
const YT = JSON.parse(readFileSync(join(BASE, "api_config.json"), "utf-8")).youtube;
const CH = YT.channel_id, KEY = YT.api_key;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("חסר SUPABASE"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const start = new Date(today.getTime() - 90 * 86400000);

async function accessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YT.oauth_client_id, client_secret: YT.oauth_client_secret,
      refresh_token: YT.oauth_refresh_token, grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(j.error_description || j.error || "no token");
  return j.access_token;
}

async function main() {
  if (!YT.oauth_refresh_token) throw new Error("אין refresh_token — הרץ youtube_oauth.mjs");
  const token = await accessToken();

  // אנליטיקס יומי
  const u = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  Object.entries({
    ids: `channel==${CH}`, startDate: iso(start), endDate: iso(today),
    metrics: "views,likes,comments,shares", dimensions: "day", sort: "day",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  let j = await (await fetch(u, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (j.error) { // נפילה חזרה
    u.searchParams.set("ids", "channel==MINE");
    j = await (await fetch(u, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  if (j.error) throw new Error(j.error.message);

  // מספר מנויים נוכחי (קבוע על כל היום)
  const st = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${CH}&key=${KEY}`)).json();
  const subs = parseInt(st.items?.[0]?.statistics?.subscriberCount || "0", 10);

  const rows = (j.rows || []).map(([day, views, likes, comments, shares]) => ({
    channel_key: "youtube", date: day,
    reach: views, likes, comments, shares, followers: subs,
  }));
  if (rows.length) {
    const r = await db.from("metrics_daily").upsert(rows, { onConflict: "channel_key,date" });
    if (r.error) throw r.error;
  }
  await db.from("channels").update({ is_demo: false }).eq("key", "youtube");
  const totalViews = rows.reduce((s, r) => s + (r.reach || 0), 0);
  console.log(`✅ יוטיוב יומי עודכן: ${rows.length} ימים, ${totalViews.toLocaleString()} צפיות, ${subs.toLocaleString()} מנויים`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
