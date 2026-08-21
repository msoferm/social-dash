// ייבוא הנתונים הקיימים (data.js + config.js) ל-Supabase.
// כולל את נתוני היוטיוב האמיתיים שכבר נמשכו.
// הרצה:  node seed_from_datajs.mjs   (דורש SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = join(dirname(fileURLToPath(import.meta.url)), "..");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("חסר SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ראה .env.example)");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// טעינת קבצי window.* בסביבה מבוקרת (קבצים מקומיים מהימנים)
function loadWindowFile(relPath, prop) {
  const src = readFileSync(join(BASE, relPath), "utf-8");
  const win = {};
  new Function("window", src)(win);
  return win[prop];
}

const DATA = loadWindowFile("data.js", "DASH_DATA");
const CFG = loadWindowFile("config.js", "DASH_CONFIG");

async function run() {
  // ---- channels ----
  const chEntries = Object.entries(CFG.channels);
  const channels = chEntries.map(([key, c], i) => ({
    key,
    name: c.name,
    color: c.color,
    kind: c.kind,
    enabled: c.enabled !== false,
    is_demo: DATA.channels[key]?.isDemo ?? true,
    sort_order: i,
  }));
  let r = await db.from("channels").upsert(channels, { onConflict: "key" });
  if (r.error) throw r.error;
  console.log(`✓ channels: ${channels.length}`);

  // ---- metrics_daily ----
  const rows = [];
  for (const [key, ch] of Object.entries(DATA.channels)) {
    for (const d of ch.daily || []) {
      rows.push({
        channel_key: key,
        date: d.date,
        reach: d.reach ?? null,
        likes: d.likes ?? null,
        comments: d.comments ?? null,
        shares: d.shares ?? null,
        followers: d.followers ?? null,
        spend: d.spend ?? null,
        impressions: d.impressions ?? null,
        clicks: d.clicks ?? null,
        conversions: d.conversions ?? null,
      });
    }
  }
  // upsert בקבוצות של 1000
  for (let i = 0; i < rows.length; i += 1000) {
    r = await db.from("metrics_daily").upsert(rows.slice(i, i + 1000), { onConflict: "channel_key,date" });
    if (r.error) throw r.error;
  }
  console.log(`✓ metrics_daily: ${rows.length}`);

  // ---- posts (רענון מלא) ----
  await db.from("posts").delete().neq("id", 0);
  const posts = (DATA.posts || []).map((p) => ({
    platform: p.platform,
    external_id: p.external_id ?? null,
    title: p.title,
    date: p.date,
    type: p.type ?? "organic",
    reach: p.reach ?? 0,
    likes: p.likes ?? 0,
    comments: p.comments ?? 0,
    shares: p.shares ?? 0,
  }));
  if (posts.length) {
    r = await db.from("posts").insert(posts);
    if (r.error) throw r.error;
  }
  console.log(`✓ posts: ${posts.length}`);

  console.log("\n✅ הייבוא הושלם.");
}

run().catch((e) => { console.error("✗ שגיאה:", e.message); process.exit(1); });
