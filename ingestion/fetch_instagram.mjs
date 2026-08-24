// אינסטגרם אורגני → Supabase. עוקבים, reach יומי, אינטראקציות (מהמדיה), פוסטים מובילים.
// דורש: api_config.json (meta.access_token = page token, meta.instagram_id) + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = JSON.parse(readFileSync(join(BASE, "api_config.json"), "utf-8")).meta;
const G = "https://graph.facebook.com/v23.0";
const PT = M.access_token, IG = M.instagram_id;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("חסר SUPABASE"); process.exit(1); }
if (!PT || !IG) { console.error("חסר page token / instagram_id"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DAYS = 90;
const today = new Date();
const since = new Date(today.getTime() - DAYS * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const sinceStr = iso(since);
const allDates = Array.from({ length: DAYS }, (_, i) => iso(new Date(since.getTime() + i * 86400000)));
const israelDate = (ts) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const get = async (url) => { const j = await (await fetch(url)).json(); if (j.error) throw new Error(j.error.message); return j; };

async function main() {
  const acct = await get(`${G}/${IG}?fields=followers_count,media_count&access_token=${PT}`);
  const followers = acct.followers_count || 0;
  const daily = Object.fromEntries(allDates.map((d) => [d, { channel_key: "instagram", date: d, reach: 0, likes: 0, comments: 0, shares: 0, followers }]));

  // reach יומי — בחתיכות של 30 יום
  for (let s = new Date(since); s < today; s = new Date(s.getTime() + 30 * 86400000)) {
    const e = new Date(Math.min(s.getTime() + 30 * 86400000, today.getTime()));
    try {
      const r = await get(`${G}/${IG}/insights?metric=reach&period=day&since=${Math.floor(s / 1000)}&until=${Math.floor(e / 1000)}&access_token=${PT}`);
      for (const v of r.data?.[0]?.values || []) {
        const d = israelDate(v.end_time);
        if (daily[d]) daily[d].reach = v.value || 0;
      }
    } catch (ex) { console.log("  ⚠ reach:", ex.message); }
  }

  // מדיה (90 יום) → אינטראקציות יומיות + פוסטים מובילים
  let media = [], url = `${G}/${IG}/media?fields=caption,timestamp,like_count,comments_count,media_type,permalink&limit=100&access_token=${PT}`;
  while (url) { const j = await get(url); media.push(...(j.data || [])); url = j.paging?.next; if (media.length > 300) break; }

  const postsOut = [];
  for (const m of media) {
    const d = israelDate(m.timestamp);
    if (d < sinceStr) continue;
    const likes = m.like_count || 0, comments = m.comments_count || 0;
    if (daily[d]) { daily[d].likes += likes; daily[d].comments += comments; }
    postsOut.push({ platform: "instagram", external_id: m.id, title: (m.caption || "(ללא כיתוב)").slice(0, 120), date: d, type: "organic", reach: 0, likes, comments, shares: 0 });
  }

  // reach לפוסטים המובילים
  const top = postsOut.sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments)).slice(0, 10);
  for (const p of top) {
    try {
      const r = await get(`${G}/${p.external_id}/insights?metric=reach&access_token=${PT}`);
      p.reach = r.data?.[0]?.values?.[0]?.value || r.data?.[0]?.total_value?.value || 0;
    } catch { /* skip */ }
  }

  // write
  let res = await db.from("metrics_daily").upsert(allDates.map((d) => daily[d]), { onConflict: "channel_key,date" });
  if (res.error) throw res.error;
  await db.from("posts").delete().eq("platform", "instagram");
  if (top.length) { res = await db.from("posts").insert(top.map(({ external_id, ...p }) => ({ ...p, external_id }))); if (res.error) throw res.error; }
  await db.from("channels").update({ is_demo: false }).eq("key", "instagram");

  const eng = allDates.reduce((s, d) => s + daily[d].likes + daily[d].comments, 0);
  const reach = allDates.reduce((s, d) => s + daily[d].reach, 0);
  console.log(`✅ אינסטגרם: ${followers.toLocaleString()} עוקבים · ${postsOut.length} פוסטים · ${eng.toLocaleString()} אינטראקציות · ${reach.toLocaleString()} reach (90 יום)`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
