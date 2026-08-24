// פייסבוק אורגני → Supabase. עוקבים, אינטראקציות יומיות (מהפוסטים), reach ברמת פוסט, פוסטים מובילים.
// דורש: api_config.json (meta.access_token = page token, meta.page_id) + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = JSON.parse(readFileSync(join(BASE, "api_config.json"), "utf-8")).meta;
const G = "https://graph.facebook.com/v23.0";
const PT = M.access_token, PID = M.page_id;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("חסר SUPABASE"); process.exit(1); }
if (!PT || !PID) { console.error("חסר page token / page_id"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DAYS = 90;
const today = new Date();
const since = new Date(today.getTime() - DAYS * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const sinceStr = iso(since);
const allDates = Array.from({ length: DAYS }, (_, i) => iso(new Date(since.getTime() + i * 86400000)));
const israelDate = (isoTs) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(isoTs)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

const get = async (url) => { const j = await (await fetch(url)).json(); if (j.error) throw new Error(j.error.message); return j; };
async function getAll(path, params) {
  let url = `${G}/${path}?${new URLSearchParams({ ...params, access_token: PT })}`, rows = [];
  while (url) { const j = await (await fetch(url)).json(); if (j.error) throw new Error(j.error.message); rows.push(...(j.data || [])); url = j.paging?.next; }
  return rows;
}

async function main() {
  const page = await get(`${G}/${PID}?fields=fan_count,followers_count&access_token=${PT}`);
  const followers = page.followers_count || page.fan_count || 0;

  // daily accumulator
  const daily = Object.fromEntries(allDates.map((d) => [d, { channel_key: "facebook", date: d, reach: 0, likes: 0, comments: 0, shares: 0, followers }]));

  // posts (90d)
  const posts = await getAll(`${PID}/published_posts`, {
    fields: "message,created_time,shares,reactions.summary(total_count),comments.summary(total_count)", limit: 100,
  });
  const postsOut = [];
  for (const p of posts) {
    const d = israelDate(p.created_time);
    if (d < sinceStr) continue;
    const likes = p.reactions?.summary?.total_count || 0;
    const comments = p.comments?.summary?.total_count || 0;
    const shares = p.shares?.count || 0;
    if (daily[d]) { daily[d].likes += likes; daily[d].comments += comments; daily[d].shares += shares; }
    postsOut.push({ platform: "facebook", external_id: p.id, title: (p.message || "(פוסט ללא טקסט)").slice(0, 120), date: d, type: "organic", reach: 0, likes, comments, shares });
  }

  // reach per post (post_impressions_unique) — לפוסטים בטווח
  for (const p of postsOut) {
    try {
      const r = await get(`${G}/${p.external_id}/insights?metric=post_impressions_unique&access_token=${PT}`);
      const reach = r.data?.[0]?.values?.[0]?.value || 0;
      p.reach = reach;
      if (daily[p.date]) daily[p.date].reach += reach;
    } catch { /* skip */ }
  }

  // write metrics_daily
  const rows = allDates.map((d) => daily[d]);
  let res = await db.from("metrics_daily").upsert(rows, { onConflict: "channel_key,date" });
  if (res.error) throw res.error;

  // top posts → posts table (רענון פייסבוק בלבד)
  await db.from("posts").delete().eq("platform", "facebook");
  const top = postsOut.sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares)).slice(0, 10);
  if (top.length) { res = await db.from("posts").insert(top.map(({ external_id, ...p }) => ({ ...p, external_id }))); if (res.error) throw res.error; }

  await db.from("channels").update({ is_demo: false }).eq("key", "facebook");

  const totalEng = rows.reduce((s, r) => s + r.likes + r.comments + r.shares, 0);
  const totalReach = rows.reduce((s, r) => s + r.reach, 0);
  console.log(`✅ פייסבוק: ${followers.toLocaleString()} עוקבים · ${postsOut.length} פוסטים · ${totalEng.toLocaleString()} אינטראקציות · ${totalReach.toLocaleString()} reach (90 יום)`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
