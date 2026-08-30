// Worker: מבצע פוסטים מתוזמנים לפייסבוק + תגובה ראשונה. רץ כל כמה דקות.
// זרימה: pending → יוצר פוסט (מיידי/מתוזמן) → scheduled → (כשעבר הזמן) published → done (עם תגובה)
// דורש: api_config.json (meta.access_token=page token, meta.page_id) + SUPABASE env
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

const post = async (path, params) => {
  const r = await fetch(`${G}/${path}`, { method: "POST", body: new URLSearchParams({ ...params, access_token: PT }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
};
const upd = (id, fields) => db.from("scheduled_posts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);

async function createPost(p) {
  const now = Date.now();
  const when = new Date(p.scheduled_time).getTime();
  const immediate = when <= now + 11 * 60 * 1000; // פחות מ-11 דק' → מפרסם מיד
  const timing = immediate ? { published: "true" } : { published: "false", scheduled_publish_time: String(Math.floor(when / 1000)) };

  let res, fbId;
  if (p.image_url) {
    res = await post(`${PID}/photos`, { url: p.image_url, caption: p.message || "", ...timing });
    fbId = res.post_id || res.id;
  } else {
    res = await post(`${PID}/feed`, { message: p.message || "", ...(p.link ? { link: p.link } : {}), ...timing });
    fbId = res.id;
  }
  return { fbId, immediate };
}

async function main() {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await db.from("scheduled_posts")
    .select("*").in("status", ["pending", "scheduled", "published"]);
  if (error) throw error;

  for (const p of rows || []) {
    try {
      if (p.status === "pending") {
        const { fbId, immediate } = await createPost(p);
        await upd(p.id, { fb_post_id: fbId, status: immediate ? "published" : "scheduled", error: null });
        console.log(`✓ נוצר פוסט ${p.id} (${immediate ? "פורסם" : "מתוזמן"}) → ${fbId}`);
      } else if (p.status === "scheduled" && new Date(p.scheduled_time).getTime() <= Date.now() - 60000) {
        await upd(p.id, { status: "published" }); // פייסבוק כבר פרסמה אותו
        console.log(`✓ פוסט ${p.id} עלה`);
      } else if (p.status === "published") {
        if (p.first_comment && p.fb_post_id) {
          await post(`${p.fb_post_id}/comments`, { message: p.first_comment });
          console.log(`✓ תגובה ראשונה נוספה לפוסט ${p.id}`);
        }
        await upd(p.id, { status: "done" });
      }
    } catch (e) {
      await upd(p.id, { status: "error", error: e.message });
      console.log(`✗ פוסט ${p.id}:`, e.message);
    }
  }
  console.log(`(${nowIso}) עובדו ${rows?.length || 0} רשומות`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
