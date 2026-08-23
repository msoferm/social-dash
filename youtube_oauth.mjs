// יוטיוב — צפיות יומיות אמיתיות דרך YouTube Analytics API (OAuth)
// הרצה ראשונה:  node youtube_oauth.mjs   → נפתח דפדפן לאישור, נשמר refresh_token
// הרצות הבאות:  node youtube_oauth.mjs   → משתמש ב-refresh_token ומרענן נתונים בלי דפדפן
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = dirname(fileURLToPath(import.meta.url));
const CFGPATH = join(BASE, "api_config.json");
const CFG = JSON.parse(readFileSync(CFGPATH, "utf-8"));
const YT = CFG.youtube;
const PORT = 42813;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly";

function saveCfg() {
  writeFileSync(CFGPATH, JSON.stringify(CFG, null, 2), "utf-8");
}

// ---- OAuth: get a refresh token via loopback flow (only once) ----
function getAuthCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT);
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding-top:60px">` +
          (code
            ? "<h2>✅ ההרשאה הושלמה!</h2><p>אפשר לסגור את החלון ולחזור ל-VS Code.</p>"
            : `<h2>❌ שגיאה: ${err || "לא התקבל קוד"}</h2>`) +
          "</body></html>"
      );
      server.close();
      code ? resolve(code) : reject(new Error(err || "no code"));
    });
    server.listen(PORT, () => {
      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: YT.oauth_client_id,
          redirect_uri: REDIRECT,
          response_type: "code",
          scope: SCOPE,
          access_type: "offline",
          prompt: "select_account consent",
        });
      console.log("\n🔓 פותח דפדפן לאישור... אם לא נפתח, פתח ידנית את הכתובת:\n" + authUrl + "\n");
      exec(`start "" "${authUrl}"`, () => {}); // Windows
    });
  });
}

async function exchange(body) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error_description || j.error);
  return j;
}

async function ensureRefreshToken() {
  if (YT.oauth_refresh_token) return;
  const code = await getAuthCode();
  const tok = await exchange({
    code,
    client_id: YT.oauth_client_id,
    client_secret: YT.oauth_client_secret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  });
  if (!tok.refresh_token) throw new Error("לא התקבל refresh_token — נסה שוב (ודא prompt=consent)");
  YT.oauth_refresh_token = tok.refresh_token;
  saveCfg();
  console.log("✓ refresh_token נשמר ב-api_config.json");
}

async function accessToken() {
  const tok = await exchange({
    client_id: YT.oauth_client_id,
    client_secret: YT.oauth_client_secret,
    refresh_token: YT.oauth_refresh_token,
    grant_type: "refresh_token",
  });
  return tok.access_token;
}

// ---- Analytics: daily views/likes/comments/shares over the existing date range ----
async function queryReports(token, ids, startDate, endDate) {
  const u = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  Object.entries({
    ids,
    startDate,
    endDate,
    metrics: "views,likes,comments,shares",
    dimensions: "day",
    sort: "day",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function fetchDaily(token, startDate, endDate) {
  // פנייה מפורשת לערוץ המותג (עובד כשמנהלים אותו); נפילה חזרה ל-MINE
  let j = await queryReports(token, `channel==${YT.channel_id}`, startDate, endDate);
  if (j.error) {
    console.log(`  ⚠ גישה מפורשת לערוץ נכשלה (${j.error.message || j.error.code}); מנסה channel==MINE`);
    j = await queryReports(token, "channel==MINE", startDate, endDate);
  }
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  const map = {};
  for (const [day, views, likes, comments, shares] of j.rows || []) {
    map[day] = { reach: views, likes, comments, shares };
  }
  return map;
}

async function main() {
  await ensureRefreshToken();
  const token = await accessToken();

  const dataPath = join(BASE, "data.js");
  const raw = readFileSync(dataPath, "utf-8");
  const data = JSON.parse(raw.slice(raw.indexOf("=") + 1).trim().replace(/;\s*$/, ""));

  const daily = data.channels.youtube.daily;
  const startDate = daily[0].date;
  const endDate = daily[daily.length - 1].date;
  console.log(`\n📊 מושך צפיות יומיות מ-Analytics: ${startDate} → ${endDate}`);

  const map = await fetchDaily(token, startDate, endDate);
  let hits = 0;
  for (const row of daily) {
    const m = map[row.date];
    if (m) {
      row.reach = m.reach;
      row.likes = m.likes;
      row.comments = m.comments;
      row.shares = m.shares;
      hits++;
    } else {
      row.reach = 0;
      row.likes = 0;
      row.comments = 0;
      row.shares = 0;
    }
  }
  data.channels.youtube.isDemo = false;
  data.generatedAt = new Date().toISOString().slice(0, 19);
  data.isDemo = Object.values(data.channels).some((ch) => ch.isDemo ?? true);

  const out =
    '// נוצר אוטומטית — אל תערכו ידנית\n' +
    "window.DASH_DATA = " + JSON.stringify(data) + ";\n";
  writeFileSync(dataPath, out, "utf-8");
  const totalViews = daily.reduce((s, r) => s + r.reach, 0);
  console.log(`\n✓ יוטיוב מחובר! ${hits}/${daily.length} ימים עם נתונים, סה"כ ${totalViews.toLocaleString()} צפיות בטווח.`);
}

main().catch((e) => {
  console.error("✗ שגיאה:", e.message);
  process.exit(1);
});
