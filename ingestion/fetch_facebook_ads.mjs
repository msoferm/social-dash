// מודעות פייסבוק → Supabase (facebookAds): הוצאה, הצגות, קליקים, המרות — יומי.
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
const CONV = ["lead", "purchase", "offsite_conversion", "complete_registration", "submit_application", "onsite_conversion.lead"];

async function main() {
  const rows = {};
  let url = `${G}/${ACT}/insights?level=account&time_increment=1&fields=spend,impressions,clicks,actions&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&access_token=${T}`;
  while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) throw new Error(j.error.message);
    for (const r of j.data || []) {
      const d = r.date_start;
      const conv = (r.actions || []).filter((a) => CONV.some((t) => a.action_type.startsWith(t)))
        .reduce((s, a) => s + Math.round(+a.value || 0), 0);
      rows[d] = {
        channel_key: "facebookAds", date: d,
        spend: Math.round((+r.spend || 0) * 100) / 100,
        impressions: +r.impressions || 0, clicks: +r.clicks || 0, conversions: conv,
      };
    }
    url = j.paging?.next;
  }

  const arr = Object.values(rows);
  if (arr.length) {
    const res = await db.from("metrics_daily").upsert(arr, { onConflict: "channel_key,date" });
    if (res.error) throw res.error;
  }
  await db.from("channels").update({ is_demo: false }).eq("key", "facebookAds");

  const t = arr.reduce((a, r) => ({ spend: a.spend + r.spend, imp: a.imp + r.impressions, clk: a.clk + r.clicks, cnv: a.cnv + r.conversions }), { spend: 0, imp: 0, clk: 0, cnv: 0 });
  console.log(`✅ מודעות פייסבוק: ${arr.length} ימים · ₪${Math.round(t.spend).toLocaleString()} · ${t.imp.toLocaleString()} הצגות · ${t.clk.toLocaleString()} קליקים · ${t.cnv.toLocaleString()} המרות`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
