// בדיקת קצה-לקצה: התחברות עם ה-publishable key + שליפה (כמו האפליקציה)
import { createClient } from "@supabase/supabase-js";
const { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data: auth, error: e1 } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (e1) { console.error("✗ התחברות נכשלה:", e1.message); process.exit(1); }
console.log("✓ התחברות הצליחה:", auth.user.email);

const { data: prof } = await sb.from("profiles").select("role").eq("id", auth.user.id).single();
console.log("✓ תפקיד:", prof?.role);

const { data: ch } = await sb.from("channels").select("key,name,is_demo");
console.log("✓ ערוצים:", ch?.length, "|", ch?.map((c) => `${c.name}${c.is_demo ? "(דמו)" : "(מחובר)"}`).join(", "));

const { count } = await sb.from("metrics_daily").select("*", { count: "exact", head: true });
console.log("✓ שורות נתונים יומיים:", count);

// בדיקת כתיבה ללוח התוכן
const { data: ins, error: e2 } = await sb.from("calendar_items")
  .insert({ publish_date: "2026-08-21", title: "בדיקת מערכת ✅", status: "idea", created_by: auth.user.id })
  .select().single();
if (e2) { console.error("✗ כתיבה ללוח נכשלה:", e2.message); process.exit(1); }
console.log("✓ נכתב אייטם ללוח (id", ins.id + ")");
await sb.from("calendar_items").delete().eq("id", ins.id);
console.log("✓ נמחק אייטם הבדיקה\n✅ הכל עובד!");
