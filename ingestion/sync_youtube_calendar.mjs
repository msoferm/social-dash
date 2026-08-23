// סנכרון סרטוני יוטיוב → לוח התוכן (calendar_items)
//  • שפורסמו: דרך API key + channel_id (אמין לכל הסרטונים)
//  • מתוזמנים: דרך OAuth — רק אם הטוקן יושב על ערוץ המותג (אחרת מדולג עם אזהרה)
// דורש: api_config.json + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
const YT = JSON.parse(readFileSync(join(BASE, "api_config.json"), "utf-8")).youtube;
const API = "https://www.googleapis.com/youtube/v3";
const KEY = YT.api_key, CH = YT.channel_id;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("חסר SUPABASE"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function toIsrael(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const durSec = (iso) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || [];
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
};
const row = (it, status, when) => {
  const { date, time } = toIsrael(when);
  return {
    source: "youtube", external_id: it.id, entry_type: "item", title: it.snippet.title,
    publish_date: date, publish_time: time, status,
    item_type: durSec(it.contentDetails.duration) <= 60 ? "שורט" : "וידאו",
    youtube_url: `https://youtube.com/watch?v=${it.id}`,
  };
};

async function getJSON(path, params, token) {
  const u = new URL(`${API}/${path}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j;
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
  if (!j.access_token) throw new Error(j.error_description || "no token");
  return j.access_token;
}

async function fetchPublished() {
  const chJ = await getJSON("channels", { part: "contentDetails", id: CH, key: KEY });
  const uploads = chJ.items[0].contentDetails.relatedPlaylists.uploads;
  const ids = [];
  let pageToken = "";
  do {
    const p = await getJSON("playlistItems", {
      part: "contentDetails", playlistId: uploads, maxResults: 50, key: KEY,
      ...(pageToken ? { pageToken } : {}),
    });
    ids.push(...p.items.map((it) => it.contentDetails.videoId));
    pageToken = p.nextPageToken || "";
  } while (pageToken);

  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await getJSON("videos", { part: "snippet,contentDetails,status", id: ids.slice(i, i + 50).join(","), key: KEY });
    for (const it of v.items) {
      if (it.status?.privacyStatus === "public") rows.push(row(it, "published", it.snippet.publishedAt));
    }
  }
  return rows;
}

async function fetchScheduled() {
  const token = await accessToken();
  const me = await getJSON("channels", { part: "id", mine: "true" }, token);
  const myCh = me.items?.[0]?.id;
  if (myCh !== CH) {
    console.log(`⚠ דילוג על מתוזמנים — הטוקן יושב על ערוץ אחר (${myCh}), לא על ערוץ המותג (${CH}).`);
    console.log("  כדי לסנכרן מתוזמנים: היה מנהל Brand Account וחבר מחדש עם בחירת 'יואל חשין'.");
    return [];
  }
  const ids = [];
  let pageToken = "";
  do {
    const p = await getJSON("search", {
      part: "id", forMine: "true", type: "video", maxResults: 50, order: "date",
      ...(pageToken ? { pageToken } : {}),
    }, token);
    ids.push(...(p.items || []).map((it) => it.id.videoId).filter(Boolean));
    pageToken = p.nextPageToken || "";
  } while (pageToken);

  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await getJSON("videos", { part: "snippet,contentDetails,status", id: ids.slice(i, i + 50).join(",") }, token);
    for (const it of v.items) {
      if (it.status?.privacyStatus !== "public" && it.status?.publishAt) {
        rows.push(row(it, "scheduled", it.status.publishAt));
      }
    }
  }
  return rows;
}

async function main() {
  const published = await fetchPublished();
  console.log(`שפורסמו: ${published.length}`);
  let scheduled = [];
  try { scheduled = await fetchScheduled(); } catch (e) { console.log("⚠ מתוזמנים:", e.message); }
  console.log(`מתוזמנים: ${scheduled.length}`);

  const rows = [...published, ...scheduled];
  for (let i = 0; i < rows.length; i += 500) {
    const r = await db.from("calendar_items").upsert(rows.slice(i, i + 500), { onConflict: "source,external_id" });
    if (r.error) throw r.error;
  }
  console.log(`✅ סונכרנו ${rows.length} אייטמים ללוח.`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
