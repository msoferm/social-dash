// סנכרון פוסטים שעלו בפייסבוק+אינסטגרם → לוח התוכן (calendar_items, status=published)
// דורש: api_config.json (meta.access_token=page token, page_id, instagram_id) + SUPABASE env
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = JSON.parse(readFileSync(join(BASE, "api_config.json"), "utf-8")).meta;
const G = "https://graph.facebook.com/v23.0";
const PT = M.access_token;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("חסר SUPABASE"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DAYS = 120;
const sinceStr = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
const israelDate = (ts) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
async function getAll(url) { let rows = []; while (url) { const j = await (await fetch(url)).json(); if (j.error) throw new Error(j.error.message); rows.push(...(j.data || [])); url = j.paging?.next; if (rows.length > 500) break; } return rows; }

async function main() {
  const rows = [];

  // Facebook
  if (M.page_id) {
    try {
      const posts = await getAll(`${G}/${M.page_id}/published_posts?fields=message,created_time,full_picture,permalink_url&limit=100&access_token=${PT}`);
      for (const p of posts) {
        const d = israelDate(p.created_time);
        if (d < sinceStr) continue;
        rows.push({ source: "facebook", external_id: p.id, entry_type: "item", status: "published",
          title: (p.message || "פוסט פייסבוק").slice(0, 120), item_type: "פוסט פייסבוק",
          publish_date: d, publish_time: p.created_time.slice(11, 16), image_url: p.full_picture || null, link: p.permalink_url || null });
      }
    } catch (e) { console.log("⚠ פייסבוק:", e.message); }
  }

  // Instagram
  if (M.instagram_id) {
    try {
      const media = await getAll(`${G}/${M.instagram_id}/media?fields=caption,timestamp,media_type,media_url,thumbnail_url,permalink&limit=100&access_token=${PT}`);
      for (const m of media) {
        const d = israelDate(m.timestamp);
        if (d < sinceStr) continue;
        const type = m.media_type === "VIDEO" ? "רילס/וידאו" : m.media_type === "CAROUSEL_ALBUM" ? "אלבום" : "פוסט";
        rows.push({ source: "instagram", external_id: m.id, entry_type: "item", status: "published",
          title: (m.caption || "פוסט אינסטגרם").slice(0, 120), item_type: `אינסטגרם · ${type}`,
          publish_date: d, publish_time: m.timestamp.slice(11, 16), image_url: m.thumbnail_url || m.media_url || null, link: m.permalink || null });
      }
    } catch (e) { console.log("⚠ אינסטגרם:", e.message); }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const r = await db.from("calendar_items").upsert(rows.slice(i, i + 500), { onConflict: "source,external_id" });
    if (r.error) throw r.error;
  }
  const fb = rows.filter((r) => r.source === "facebook").length;
  const ig = rows.filter((r) => r.source === "instagram").length;
  console.log(`✅ סונכרנו ללוח: ${fb} פוסטים פייסבוק, ${ig} פוסטים אינסטגרם`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
