import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const nf = (n) => (n == null ? "—" : Number(n).toLocaleString("he-IL"));

export default function ShortsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyShorts, setOnlyShorts] = useState(true);
  const [sort, setSort] = useState("date"); // date | views

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from("yt_videos").select("*");
      if (onlyShorts) q = q.eq("is_short", true);
      const { data } = await q;
      setRows(data || []);
      setLoading(false);
    })();
  }, [onlyShorts]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) =>
      sort === "views" ? b.views - a.views : (b.published_at || "").localeCompare(a.published_at || "")
    );
    return arr;
  }, [rows, sort]);

  const totals = useMemo(() => {
    return rows.reduce(
      (t, r) => ({
        views: t.views + (r.views || 0),
        organic: t.organic + (r.organic_views || 0),
        paid: t.paid + (r.paid_views || 0),
      }),
      { views: 0, organic: 0, paid: 0 }
    );
  }, [rows]);

  const hasPaidData = rows.some((r) => r.paid_views != null);

  return (
    <div className="panel">
      <div className="shorts-head">
        <h3>🎬 שורטים ביוטיוב {onlyShorts ? `(${rows.length})` : ""}</h3>
        <div className="shorts-controls">
          <label className="chk">
            <input type="checkbox" checked={onlyShorts} onChange={(e) => setOnlyShorts(e.target.checked)} />
            רק שורטים
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="date">מיון: תאריך</option>
            <option value="views">מיון: צפיות</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : rows.length === 0 ? (
        <p className="muted">אין נתונים עדיין — הרץ את משיכת היוטיוב.</p>
      ) : (
        <>
          <div className="shorts-summary">
            <span>סה"כ צפיות: <b>{nf(totals.views)}</b></span>
            {hasPaidData && (
              <>
                <span className="org">אורגני: <b>{nf(totals.organic)}</b></span>
                <span className="paid">ממומן: <b>{nf(totals.paid)}</b></span>
              </>
            )}
          </div>
          <div className="table-scroll">
            <table className="posts-table">
              <thead>
                <tr>
                  <th>תאריך פרסום</th>
                  <th>כותרת</th>
                  <th>צפיות</th>
                  {hasPaidData && <th>אורגני</th>}
                  {hasPaidData && <th>ממומן</th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((v) => (
                  <tr key={v.video_id}>
                    <td>{v.published_at}</td>
                    <td className="post-title">
                      <a href={`https://youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noreferrer">
                        {v.title}
                      </a>
                    </td>
                    <td>{nf(v.views)}</td>
                    {hasPaidData && <td className="org">{nf(v.organic_views)}</td>}
                    {hasPaidData && <td className="paid">{nf(v.paid_views)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasPaidData && (
            <p className="muted small">
              * פילוח אורגני/ממומן יופיע אחרי משיכה עם הרשאת Analytics. הוצאה כספית על קידום אינה זמינה
              דרך יוטיוב — נדרש Google Ads API.
            </p>
          )}
        </>
      )}
    </div>
  );
}
