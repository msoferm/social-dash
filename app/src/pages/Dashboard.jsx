import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { format, subDays } from "date-fns";
import { supabase } from "../lib/supabase";

const RANGES = [7, 30, 90];
const nf = (n) => (n || 0).toLocaleString("he-IL");

export default function Dashboard() {
  const [range, setRange] = useState(30);
  const [channels, setChannels] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = format(subDays(new Date(), range), "yyyy-MM-dd");
      const [ch, mt, ps] = await Promise.all([
        supabase.from("channels").select("*").eq("enabled", true).order("sort_order"),
        supabase.from("metrics_daily").select("*").gte("date", since).order("date"),
        supabase.from("posts").select("*").order("reach", { ascending: false }).limit(10),
      ]);
      setChannels(ch.data || []);
      setMetrics(mt.data || []);
      setPosts(ps.data || []);
      setLoading(false);
    })();
  }, [range]);

  const totals = useMemo(() => {
    const t = { spend: 0, reach: 0, engagement: 0, impressions: 0, clicks: 0, conversions: 0 };
    for (const r of metrics) {
      t.spend += Number(r.spend || 0);
      t.reach += Number(r.reach || 0);
      t.engagement += Number(r.likes || 0) + Number(r.comments || 0) + Number(r.shares || 0);
      t.impressions += Number(r.impressions || 0);
      t.clicks += Number(r.clicks || 0);
      t.conversions += Number(r.conversions || 0);
    }
    return t;
  }, [metrics]);

  // סדרה יומית מצטברת: reach אורגני + spend ממומן
  const series = useMemo(() => {
    const byDate = {};
    for (const r of metrics) {
      const d = (byDate[r.date] ??= { date: r.date, reach: 0, spend: 0 });
      d.reach += Number(r.reach || 0);
      d.spend += Number(r.spend || 0);
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  const anyDemo = channels.some((c) => c.is_demo);

  if (loading) return <div className="center-pad">טוען נתונים…</div>;

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>סקירת ביצועים</h2>
        <div className="range-tabs">
          {RANGES.map((r) => (
            <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>
              {r} ימים
            </button>
          ))}
        </div>
      </div>

      {anyDemo && (
        <div className="demo-banner">
          ⚠️ חלק מהערוצים מציגים נתוני דמו. ערוצים מחוברים מסומנים ב־<span className="live-badge">● מחובר</span>.
        </div>
      )}

      <div className="cards">
        <Card title="הוצאת פרסום" value={`₪${nf(Math.round(totals.spend))}`} />
        <Card title="חשיפה אורגנית" value={nf(totals.reach)} />
        <Card title="אינטראקציות" value={nf(totals.engagement)} />
        <Card title="קליקים" value={nf(totals.clicks)} />
        <Card title="המרות" value={nf(totals.conversions)} />
      </div>

      <div className="panel">
        <h3>מגמה יומית — חשיפה מול הוצאה</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gReach" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#22304a" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} reversed />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ direction: "rtl" }} />
            <Legend />
            <Area type="monotone" dataKey="reach" name="חשיפה" stroke="#3b82f6" fill="url(#gReach)" />
            <Area type="monotone" dataKey="spend" name="הוצאה ₪" stroke="#f59e0b" fill="none" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3>ערוצים</h3>
        <div className="channel-pills">
          {channels.map((c) => (
            <span key={c.key} className="channel-pill" style={{ borderColor: c.color }}>
              <i style={{ background: c.color }} />
              {c.name}
              {c.is_demo ? <em className="demo-tag">דמו</em> : <em className="live-badge">● מחובר</em>}
            </span>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>פוסטים מובילים</h3>
        <table className="posts-table">
          <thead>
            <tr><th>כותרת</th><th>פלטפורמה</th><th>תאריך</th><th>חשיפה</th><th>לייקים</th><th>תגובות</th></tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td className="post-title">{p.title}</td>
                <td>{p.platform}</td>
                <td>{p.date}</td>
                <td>{nf(p.reach)}</td>
                <td>{nf(p.likes)}</td>
                <td>{nf(p.comments)}</td>
              </tr>
            ))}
            {posts.length === 0 && <tr><td colSpan={6} className="muted">אין נתונים עדיין.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
    </div>
  );
}
