import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const STATUS = {
  pending:   { label: "ממתין",  color: "#94a3b8" },
  scheduled: { label: "מתוזמן", color: "#8b5cf6" },
  published: { label: "עלה",    color: "#3b82f6" },
  done:      { label: "הושלם ✓", color: "#10b981" },
  error:     { label: "שגיאה",  color: "#ef4444" },
  canceled:  { label: "בוטל",   color: "#64748b" },
};

const defaultTime = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000); // שעה מעכשיו
  d.setSeconds(0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
};

export default function ComposePost() {
  const { user } = useAuth();
  const [form, setForm] = useState({ message: "", image_url: "", link: "", first_comment: "", scheduled_time: defaultTime() });
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    const { data } = await supabase.from("scheduled_posts").select("*").order("scheduled_time", { ascending: false }).limit(50);
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    if (!form.message.trim() && !form.image_url.trim()) { setMsg("צריך טקסט או תמונה"); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.from("scheduled_posts").insert({
      message: form.message.trim() || null,
      image_url: form.image_url.trim() || null,
      link: form.link.trim() || null,
      first_comment: form.first_comment.trim() || null,
      scheduled_time: new Date(form.scheduled_time).toISOString(),
      created_by: user.id,
    });
    setBusy(false);
    if (error) { setMsg("שגיאה: " + error.message); return; }
    setMsg("✅ הפוסט נשמר ויתוזמן בהרצת ה-worker הקרובה");
    setForm({ message: "", image_url: "", link: "", first_comment: "", scheduled_time: defaultTime() });
    load();
  }

  async function cancel(id) {
    if (!confirm("לבטל/למחוק את הפוסט?")) return;
    await supabase.from("scheduled_posts").delete().eq("id", id);
    load();
  }

  return (
    <div className="compose">
      <form className="panel compose-form" onSubmit={submit}>
        <h2>✍️ פוסט חדש לפייסבוק</h2>

        <label>טקסט הפוסט</label>
        <textarea value={form.message} onChange={set("message")} rows={4} placeholder="מה לפרסם?" />

        <div className="row">
          <div>
            <label>קישור לתמונה (אופציונלי)</label>
            <input value={form.image_url} onChange={set("image_url")} placeholder="https://…/image.jpg" />
          </div>
          <div>
            <label>קישור בגוף הפוסט (אופציונלי)</label>
            <input value={form.link} onChange={set("link")} placeholder="https://…" />
          </div>
        </div>

        <label>🔗 קישור לתגובה הראשונה (הסרטון המלא)</label>
        <input value={form.first_comment} onChange={set("first_comment")} placeholder="https://youtube.com/watch?v=… — יתפרסם כתגובה ראשונה אוטומטית" />

        <label>⏰ מתי לפרסם</label>
        <input type="datetime-local" value={form.scheduled_time} onChange={set("scheduled_time")} />
        <p className="muted small">פחות מ-10 דקות מעכשיו = פרסום מיידי. אחרת — מתוזמן בפייסבוק.</p>

        {msg && <div className={msg.startsWith("✅") ? "ok-msg" : "error"}>{msg}</div>}
        <button className="primary" disabled={busy}>{busy ? "שומר…" : "תזמן פוסט"}</button>
      </form>

      <div className="panel">
        <h3>פוסטים מתוזמנים ({rows.length})</h3>
        <div className="table-scroll">
          <table className="posts-table">
            <thead><tr><th>זמן</th><th>טקסט</th><th>תגובה ראשונה</th><th>סטטוס</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const st = STATUS[p.status] || {};
                return (
                  <tr key={p.id}>
                    <td>{format(new Date(p.scheduled_time), "dd/MM HH:mm")}</td>
                    <td className="post-title">{p.image_url && "🖼 "}{p.message || "(תמונה)"}</td>
                    <td className="post-title">{p.first_comment ? "🔗 " + p.first_comment : "—"}</td>
                    <td><span className="pill-status" style={{ background: st.color }}>{st.label}</span>
                      {p.status === "error" && p.error && <div className="muted small">{p.error}</div>}</td>
                    <td>{["pending", "error", "done", "canceled"].includes(p.status) &&
                      <button className="ghost small-btn" onClick={() => cancel(p.id)}>מחק</button>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5} className="muted">אין פוסטים מתוזמנים.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
