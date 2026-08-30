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
const MAX = 50 * 1024 * 1024;

const defaultTime = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
};

export default function ComposePost() {
  const { user } = useAuth();
  const [form, setForm] = useState({ message: "", link: "", first_comment: "", scheduled_time: defaultTime() });
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    const { data } = await supabase.from("scheduled_posts").select("*").order("scheduled_time", { ascending: false }).limit(50);
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (f && f.size > MAX) { setMsg("הקובץ גדול מ-50MB — בחר קובץ קטן יותר"); e.target.value = ""; return; }
    setFile(f || null); setMsg("");
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.message.trim() && !file) { setMsg("צריך טקסט או מדיה"); return; }
    setBusy(true); setMsg("");

    let image_url = null, media_type = null, media_path = null;
    if (file) {
      setMsg("מעלה קובץ…");
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      media_path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("post-media").upload(media_path, file, { contentType: file.type });
      if (upErr) { setBusy(false); setMsg("שגיאת העלאה: " + upErr.message); return; }
      image_url = supabase.storage.from("post-media").getPublicUrl(media_path).data.publicUrl;
      media_type = file.type.startsWith("video") ? "video" : "image";
    }

    const { error } = await supabase.from("scheduled_posts").insert({
      message: form.message.trim() || null,
      image_url, media_type, media_path,
      link: form.link.trim() || null,
      first_comment: form.first_comment.trim() || null,
      scheduled_time: new Date(form.scheduled_time).toISOString(),
      created_by: user.id,
    });
    setBusy(false);
    if (error) { setMsg("שגיאה: " + error.message); return; }
    setMsg("✅ הפוסט נשמר ויתוזמן בהרצת ה-worker הקרובה");
    setForm({ message: "", link: "", first_comment: "", scheduled_time: defaultTime() });
    setFile(null);
    document.getElementById("media-input").value = "";
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

        <label>🎬 תמונה או וידאו (עד 50MB)</label>
        <input id="media-input" type="file" accept="image/*,video/*" onChange={pickFile} />
        {file && <p className="muted small">{file.type.startsWith("video") ? "🎥" : "🖼"} {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</p>}

        <label>קישור בגוף הפוסט (אופציונלי)</label>
        <input value={form.link} onChange={set("link")} placeholder="https://…" />

        <label>🔗 קישור לתגובה הראשונה (הסרטון המלא)</label>
        <input value={form.first_comment} onChange={set("first_comment")} placeholder="https://youtube.com/watch?v=… — יתפרסם כתגובה ראשונה אוטומטית" />

        <label>⏰ מתי לפרסם</label>
        <input type="datetime-local" value={form.scheduled_time} onChange={set("scheduled_time")} />
        <p className="muted small">פחות מ-10 דקות מעכשיו = פרסום מיידי. אחרת — מתוזמן בפייסבוק. המדיה נמחקת אוטומטית אחרי יומיים.</p>

        {msg && <div className={msg.startsWith("✅") ? "ok-msg" : "error"}>{msg}</div>}
        <button className="primary" disabled={busy}>{busy ? "שומר…" : "תזמן פוסט"}</button>
      </form>

      <div className="panel">
        <h3>פוסטים מתוזמנים ({rows.length})</h3>
        <div className="table-scroll">
          <table className="posts-table">
            <thead><tr><th>זמן</th><th>תוכן</th><th>תגובה ראשונה</th><th>סטטוס</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const st = STATUS[p.status] || {};
                return (
                  <tr key={p.id}>
                    <td>{format(new Date(p.scheduled_time), "dd/MM HH:mm")}</td>
                    <td className="post-title">{p.media_type === "video" ? "🎥 " : p.media_type === "image" ? "🖼 " : ""}{p.message || "(מדיה)"}</td>
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
