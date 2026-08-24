import { useEffect, useMemo, useState, useCallback } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks,
  format, isSameMonth, isSameDay, parseISO,
} from "date-fns";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export const STATUS = {
  idea:       { label: "רעיון",     color: "#94a3b8" },
  in_editing: { label: "בעריכה",    color: "#f59e0b" },
  edited:     { label: "סיים עריכה", color: "#3b82f6" },
  scheduled:  { label: "מתוזמן",    color: "#8b5cf6" },
  published:  { label: "עלה",       color: "#10b981" },
};
const EVENT_COLOR = "#a855f7";

const WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const emptyEntry = (date, entry_type = "item") => ({
  entry_type, publish_date: date, publish_time: "", title: "", item_type: entry_type === "event" ? "ראיון" : "וידאו",
  status: "idea", assignee: "", notes: "", youtube_url: "", facebook_url: "", interviewer: "", interviewee: "",
});

// חילוץ מזהה סרטון מכתובת יוטיוב → כתובת תמונה ממוזערת
export function ytThumb(url, quality = "mqdefault") {
  if (!url) return null;
  const m = url.match(/(?:v=|\/shorts\/|youtu\.be\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/${quality}.jpg` : null;
}

const chipColor = (it) => (it.entry_type === "event" ? EVENT_COLOR : STATUS[it.status]?.color);
const thumbOf = (it) => it.image_url || ytThumb(it.youtube_url);
const SOURCE_ICON = { youtube: "▶️", facebook: "📘", instagram: "📸" };

export default function CalendarPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [items, setItems] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewMode, setViewMode] = useState("month"); // month | week

  const rangeStart = viewMode === "month"
    ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
    : startOfWeek(cursor, { weekStartsOn: 0 });
  const rangeEnd = viewMode === "month"
    ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
    : endOfWeek(cursor, { weekStartsOn: 0 });
  const rangeStartStr = format(rangeStart, "yyyy-MM-dd");
  const rangeEndStr = format(rangeEnd, "yyyy-MM-dd");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("calendar_items")
      .select("*")
      .gte("publish_date", rangeStartStr)
      .lte("publish_date", rangeEndStr)
      .order("publish_time", { ascending: true, nullsFirst: true });
    if (!error) setItems(data || []);
  }, [rangeStartStr, rangeEndStr]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const arr = [];
    let d = rangeStart;
    while (d <= rangeEnd) { arr.push(d); d = addDays(d, 1); }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStartStr, rangeEndStr]);

  const navigate = (dir) =>
    setCursor(viewMode === "month" ? addMonths(cursor, dir) : addWeeks(cursor, dir));

  const itemsByDay = useMemo(() => {
    const m = {};
    for (const it of items) (m[it.publish_date] ??= []).push(it);
    return m;
  }, [items]);

  async function saveItem(form) {
    const payload = {
      entry_type: form.entry_type,
      publish_date: form.publish_date,
      publish_time: form.publish_time || null,
      title: form.title.trim(),
      item_type: form.item_type || null,
      status: form.status,
      assignee: form.assignee || null,
      notes: form.notes || null,
      youtube_url: form.entry_type === "item" ? form.youtube_url || null : null,
      facebook_url: form.entry_type === "item" ? form.facebook_url || null : null,
      interviewer: form.entry_type === "event" ? form.interviewer || null : null,
      interviewee: form.entry_type === "event" ? form.interviewee || null : null,
    };
    if (form.id) {
      await supabase.from("calendar_items").update(payload).eq("id", form.id);
    } else {
      await supabase.from("calendar_items").insert({ ...payload, created_by: user.id });
    }
    setEditing(null);
    load();
  }

  async function removeItem(id) {
    if (!confirm("למחוק את הרשומה?")) return;
    await supabase.from("calendar_items").delete().eq("id", id);
    setEditing(null);
    load();
  }

  const dayItems = selectedDay ? itemsByDay[selectedDay] || [] : [];

  return (
    <div className="calendar-wrap">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="ghost" onClick={() => navigate(-1)}>‹</button>
          <h2>
            {viewMode === "month"
              ? format(cursor, "MMMM yyyy")
              : `${format(rangeStart, "d MMM")} – ${format(rangeEnd, "d MMM")}`}
          </h2>
          <button className="ghost" onClick={() => navigate(1)}>›</button>
          <button className="ghost" onClick={() => setCursor(new Date())}>היום</button>
          <div className="seg view-seg">
            <button type="button" className={viewMode === "month" ? "active" : ""} onClick={() => setViewMode("month")}>חודש</button>
            <button type="button" className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>שבוע</button>
          </div>
        </div>
        <div className="legend">
          {Object.entries(STATUS).map(([k, v]) => (
            <span key={k} className="legend-item"><i style={{ background: v.color }} /> {v.label}</span>
          ))}
          <span className="legend-item"><i style={{ background: EVENT_COLOR }} /> 🎙️ אירוע</span>
        </div>
      </div>

      {viewMode === "month" && (
        <div className="cal-grid">
          {WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const dayList = itemsByDay[key] || [];
            const muted = !isSameMonth(d, cursor);
            const today = isSameDay(d, new Date());
            return (
              <div key={key} className={`cal-cell${muted ? " muted" : ""}${today ? " today" : ""}`}
                onClick={() => setSelectedDay(key)}>
                <div className="cal-cell-head">
                  <span>{format(d, "d")}</span>
                  <button className="add-mini"
                    onClick={(e) => { e.stopPropagation(); setSelectedDay(key); setEditing(emptyEntry(key)); }}
                    title="הוסף">＋</button>
                </div>
                <div className="cal-chips">
                  {dayList.slice(0, 4).map((it) => (
                    <div key={it.id} className="chip" style={{ borderRightColor: chipColor(it) }}
                      onClick={(e) => { e.stopPropagation(); setSelectedDay(key); setEditing(it); }}>
                      {it.entry_type === "event" ? "🎙️ " : (SOURCE_ICON[it.source] ? SOURCE_ICON[it.source] + " " : "")}
                      {it.publish_time && <b>{it.publish_time.slice(0, 5)} </b>}
                      {it.title}
                    </div>
                  ))}
                  {dayList.length > 4 && <div className="chip more">+{dayList.length - 4} עוד</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "week" && (
        <div className="cal-week">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const dayList = itemsByDay[key] || [];
            const today = isSameDay(d, new Date());
            return (
              <div key={key} className={`week-col${today ? " today" : ""}`}>
                <div className="week-col-head" onClick={() => setEditing(emptyEntry(key))} title="הוסף">
                  <span>{WEEKDAYS[d.getDay()]}׳ {format(d, "d/M")}</span>
                  <span className="add-mini">＋</span>
                </div>
                <div className="week-col-body">
                  {dayList.length === 0 && <span className="muted small">—</span>}
                  {dayList.map((it) => {
                    const thumb = thumbOf(it);
                    return (
                      <div key={it.id} className="week-item" style={{ borderRightColor: chipColor(it) }}
                        onClick={() => setEditing(it)}>
                        {thumb && <img className="week-thumb" src={thumb} alt="" />}
                        <div className="week-item-txt">
                          {it.entry_type === "event" && "🎙️ "}
                          {it.publish_time && <b>{it.publish_time.slice(0, 5)} </b>}
                          {it.title}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedDay && (
        <DayPanel day={selectedDay} items={dayItems}
          onClose={() => setSelectedDay(null)}
          onAddItem={() => setEditing(emptyEntry(selectedDay, "item"))}
          onAddEvent={() => setEditing(emptyEntry(selectedDay, "event"))}
          onEdit={(it) => setEditing(it)} />
      )}

      {editing && (
        <ItemModal item={editing} onClose={() => setEditing(null)} onSave={saveItem} onDelete={removeItem} />
      )}
    </div>
  );
}

function DayPanel({ day, items, onClose, onAddItem, onAddEvent, onEdit }) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>{format(parseISO(day), "EEEE, d בMMMM")}</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        <div className="add-row">
          <button className="primary" onClick={onAddItem}>📹 אייטם</button>
          <button className="primary event" onClick={onAddEvent}>🎙️ אירוע</button>
        </div>
        <div className="day-list">
          {items.length === 0 && <p className="muted">אין רשומות ליום זה.</p>}
          {items.map((it) => {
            const thumb = thumbOf(it);
            return (
              <div key={it.id} className="day-item" onClick={() => onEdit(it)}>
                {thumb
                  ? <img className="di-thumb" src={thumb} alt="" />
                  : <span className="dot" style={{ background: chipColor(it) }} />}
                <div>
                  <div className="di-title">
                    {it.entry_type === "event" && "🎙️ "}
                    {it.publish_time && <b>{it.publish_time.slice(0, 5)} · </b>}{it.title}
                  </div>
                  <div className="di-sub muted small">
                    {it.entry_type === "event"
                      ? [it.item_type, it.interviewer && `מראיין: ${it.interviewer}`, it.interviewee && `מרואיין: ${it.interviewee}`].filter(Boolean).join(" · ")
                      : `${it.item_type || ""} · ${STATUS[it.status]?.label || ""}${it.assignee ? ` · ${it.assignee}` : ""}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function ItemModal({ item, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(item);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isEvent = form.entry_type === "event";
  const thumb = ytThumb(form.youtube_url);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>{form.id ? "עריכה" : isEvent ? "אירוע חדש" : "אייטם חדש"}</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <div className="seg">
          <button type="button" className={!isEvent ? "active" : ""}
            onClick={() => setForm({ ...form, entry_type: "item" })}>📹 אייטם</button>
          <button type="button" className={isEvent ? "active" : ""}
            onClick={() => setForm({ ...form, entry_type: "event", item_type: form.item_type || "ראיון" })}>🎙️ אירוע</button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (form.title.trim()) onSave(form); }}>
          <label>{isEvent ? "שם האירוע *" : "כותרת האייטם *"}</label>
          <input value={form.title} onChange={set("title")} required autoFocus />

          <div className="row">
            <div>
              <label>תאריך</label>
              <input type="date" value={form.publish_date} onChange={set("publish_date")} />
            </div>
            <div>
              <label>שעה</label>
              <input type="time" value={form.publish_time || ""} onChange={set("publish_time")} />
            </div>
          </div>

          {isEvent ? (
            <>
              <label>סוג אירוע</label>
              <input list="event-types" value={form.item_type || ""} onChange={set("item_type")}
                placeholder="ראיון / ישיבת צוות / הקלטה…" />
              <datalist id="event-types">
                <option value="ראיון" /><option value="ישיבת צוות" /><option value="הקלטה" /><option value="פגישה" />
              </datalist>
              <div className="row">
                <div>
                  <label>מי מראיין</label>
                  <input value={form.interviewer || ""} onChange={set("interviewer")} />
                </div>
                <div>
                  <label>את מי מראיינים</label>
                  <input value={form.interviewee || ""} onChange={set("interviewee")} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="row">
                <div>
                  <label>סוג אייטם</label>
                  <input value={form.item_type || ""} onChange={set("item_type")} placeholder="וידאו / רילס / פוסט…" />
                </div>
                <div>
                  <label>סטטוס</label>
                  <select value={form.status} onChange={set("status")}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              <label>קישור יוטיוב</label>
              <input value={form.youtube_url || ""} onChange={set("youtube_url")}
                placeholder="https://youtube.com/watch?v=… או /shorts/…" />
              {thumb && <img className="yt-preview" src={thumb} alt="תצוגה מקדימה" />}

              <label>קישור פייסבוק</label>
              <input value={form.facebook_url || ""} onChange={set("facebook_url")}
                placeholder="https://facebook.com/…" />
            </>
          )}

          <label>{isEvent ? "אחראי" : "אחראי / מי בעריכה"}</label>
          <input value={form.assignee || ""} onChange={set("assignee")} />

          <label>הערות</label>
          <textarea value={form.notes || ""} onChange={set("notes")} rows={3} />

          <div className="modal-actions">
            {form.id && <button type="button" className="danger" onClick={() => onDelete(form.id)}>מחיקה</button>}
            <span style={{ flex: 1 }} />
            <button type="button" className="ghost" onClick={onClose}>ביטול</button>
            <button type="submit" className="primary">שמירה</button>
          </div>
        </form>
      </div>
    </div>
  );
}
