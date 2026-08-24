// מודעות פייסבוק → Supabase (facebookAds): הוצאה (במטבע החשבון), הצגות, קליקים,
// ו"תוצאות" לפי מטרת הקמפיין (objective) — יומי, ברמת קמפיין.
// דורש: api_config.json (meta.system_user_token, meta.ad_account_id) + SUPABASE env
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = JSON.parse(readFileSync(join(BASE, "api_config.json"), "utf-8")).meta;
const G = "https://graph.facebook.com/v23.0";
const T = M.system_user_token, ACT = M.ad_account_id;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("חסר SUPABASE"); process.exit(1); }
if (!T || !ACT) { console.error("חסר system_user_token / ad_account_id"); process.exit(1); }
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DAYS = 90;
const iso = (d) => d.toISOString().slice(0, 10);
const since = iso(new Date(Date.now() - DAYS * 86400000));
const until = iso(new Date());

// מטרת קמפיין → סוג ה-action שמייצג "תוצאה"
const RESULT_ACTION = {
  OUTCOME_TRAFFIC: "link_click", LINK_CLICKS: "link_click",
  OUTCOME_ENGAGEMENT: "post_engagement", POST_ENGAGEMENT: "post_engagement", PAGE_LIKES: "like",
  OUTCOME_LEADS: "lead", LEAD_GENERATION: "lead",
  OUTCOME_SALES: "offsite_conversion.fb_pixel_purchase", CONVERSIONS: "offsite_conversion.fb_pixel_purchase",
  OUTCOME_AWARENESS: null, BRAND_AWARENESS: null, REACH: null,
};
const actionVal = (actions, type) => {
  if (!type) return 0;
  const a = (actions || []).find((x) => x.action_type === type) || (actions || []).find((x) => x.action_type.startsWith(type));
  return a ? Math.round(+a.value || 0) : 0;
};
const get = async (url) => { const j = await (await fetch(url)).json(); if (j.error) throw new Error(j.error.message); return j; };

async function main() {
  // מטבע
  const a = await get(`${G}/${ACT}?fields=currency&access_token=${T}`);
  const currency = a.currency || "USD";

  // מטרות קמפיינים
  const camps = {};
  let url = `${G}/${ACT}/campaigns?fields=objective&limit=200&access_token=${T}`;
  while (url) { const j = await get(url); for (const c of j.data || []) camps[c.id] = c.objective; url = j.paging?.next; }

  // תובנות יומיות ברמת קמפיין
  const daily = {};
  url = `${G}/${ACT}/insights?level=campaign&time_increment=1&fields=campaign_id,spend,impressions,clicks,actions&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&access_token=${T}`;
  while (url) {
    const j = await get(url);
    for (const r of j.data || []) {
      const d = r.date_start;
      const row = (daily[d] ??= { channel_key: "facebookAds", date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
      row.spend += +r.spend || 0;
      row.impressions += +r.impressions || 0;
      row.clicks += +r.clicks || 0;
      row.conversions += actionVal(r.actions, RESULT_ACTION[camps[r.campaign_id]]);
    }
    url = j.paging?.next;
  }

  const arr = Object.values(daily).map((r) => ({ ...r, spend: Math.round(r.spend * 100) / 100 }));
  if (arr.length) { const res = await db.from("metrics_daily").upsert(arr, { onConflict: "channel_key,date" }); if (res.error) throw res.error; }
  await db.from("channels").update({ is_demo: false, currency }).eq("key", "facebookAds");

  const t = arr.reduce((x, r) => ({ s: x.s + r.spend, i: x.i + r.impressions, c: x.c + r.clicks, v: x.v + r.conversions }), { s: 0, i: 0, c: 0, v: 0 });
  console.log(`✅ מודעות פייסבוק (${currency}): ${arr.length} ימים · ${Math.round(t.s).toLocaleString()} הוצאה · ${t.i.toLocaleString()} הצגות · ${t.c.toLocaleString()} קליקים · ${t.v.toLocaleString()} תוצאות`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
