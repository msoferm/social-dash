// פייסבוק + אינסטגרם — חיבור דרך redirect HTTPS (עוקף את חסימת ה-HTTPS).
//  שלב 1:  node facebook_oauth.mjs           → מדפיס קישור לאישור
//  שלב 2:  node facebook_oauth.mjs <code>    → ממיר את הקוד לטוקן ושומר
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = dirname(fileURLToPath(import.meta.url));
const CFGPATH = join(BASE, "api_config.json");
const CFG = JSON.parse(readFileSync(CFGPATH, "utf-8"));
const M = CFG.meta;
const GRAPH = "https://graph.facebook.com/v23.0";
const REDIRECT = "https://social-dash-13031.web.app/fb-callback.html";
const SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights", "instagram_basic", "instagram_manage_insights"].join(",");

const saveCfg = () => writeFileSync(CFGPATH, JSON.stringify(CFG, null, 2), "utf-8");
const get = async (url) => {
  const j = await (await fetch(url)).json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j;
};

const code = process.argv[2];

if (!code) {
  const url = "https://www.facebook.com/v23.0/dialog/oauth?" + new URLSearchParams({
    client_id: M.app_id, redirect_uri: REDIRECT, scope: SCOPES, response_type: "code",
  });
  console.log("פתח את הקישור, אשר, בחר עמוד+אינסטגרם, והעתק את הקוד מהעמוד:\n\n" + url + "\n");
  process.exit(0);
}

const main = async () => {
  const short = await get(`${GRAPH}/oauth/access_token?client_id=${M.app_id}&redirect_uri=${encodeURIComponent(REDIRECT)}&client_secret=${M.app_secret}&code=${code}`);
  const long = await get(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${M.app_id}&client_secret=${M.app_secret}&fb_exchange_token=${short.access_token}`);

  const acc = await get(`${GRAPH}/me/accounts?fields=name,id,access_token,instagram_business_account{id,username,followers_count}&access_token=${long.access_token}`);
  const pages = acc.data || [];
  if (!pages.length) throw new Error("לא נמצאו עמודים — ודא שבחרת עמוד בחלון האישור");

  console.log("עמודים שנמצאו:");
  pages.forEach((p, i) => console.log(`  [${i}] ${p.name} (${p.id})${p.instagram_business_account ? " · IG: @" + p.instagram_business_account.username : " · אין IG"}`));

  const page = pages[0];
  M.access_token = page.access_token;
  M.page_id = page.id;
  M.instagram_id = page.instagram_business_account?.id || "";
  saveCfg();
  console.log(`\n✅ נשמר: "${page.name}" (${page.id}) · IG: ${M.instagram_id ? "@" + page.instagram_business_account.username : "לא מקושר"}`);
};

main().catch((e) => { console.error("✗ שגיאה:", e.message); process.exit(1); });
