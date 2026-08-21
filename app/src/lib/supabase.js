import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // עוזר לאבחן מהר אם ה-.env לא הוגדר
  console.error("חסרים VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ב-.env.local");
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
