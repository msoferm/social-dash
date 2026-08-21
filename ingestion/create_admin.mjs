// יצירת משתמש אדמין.  שימוש (ערכים מהסביבה):
//   SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. ADMIN_EMAIL=.. ADMIN_PASSWORD=.. node create_admin.mjs
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("חסרים משתני סביבה"); process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await db.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: "מנהל", role: "admin" },
});
if (error) { console.error("✗", error.message); process.exit(1); }

// ודא שהתפקיד admin (למקרה שהטריגר קבע member)
await db.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
console.log("✅ נוצר אדמין:", data.user.email);
