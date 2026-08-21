import { useEffect, useMemo, useState, useCallback } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
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

const WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const emptyItem = (date) => ({
  publish_date: date, publish_time: "", title: "", item_type: "וידאו",
  status: "idea", assignee: "", notes: "",
});

export default function CalendarPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [items, setItems] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null); // 'yyyy-MM-dd'
  const [editing, setEditing] = useState(null); // item object or null

  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("calendar_items")
      .select("*")
      .gte("publish_date", format(gridStart, "yyyy-MM-dd"))
      .lte("publish_date", format(gridEnd, "yyyy-MM-dd"))
      .order("publish_time", { ascending: true, nullsFirst: true });
    if (!error) setItems(data || []);
  }, [gridStart, gridEnd]);

  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const arr = [];
    let d = gridStart;
    while (d <= gridEnd) { arr.push(d); d = addDays(d, 1); }
    return arr;
  }, [gridStart, gridEnd]);

  const itemsByDay = useMemo(() => {
    const m = {};
    for (const it of items) (m[it.publish_date] ??= []).push(it);
    return m;
  }, [items]);

  async function saveItem(form) {
    const payload = {
      publish_date: form.publish_date,
      publish_time: form.publish_time || null,
      title: form.title.trim(),
      item_type: form.item_type || null,
      status: form.status,
      assignee: form.assignee || null,
      notes: form.notes || null,
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
    if (!confirm("למחוק את האייטם?")) return;
    await supabase.from("calendar_items").delete().eq("id", id);
    setEditing(null);
    load();
  }

  const dayItems = selectedDay ? itemsByDay[selectedDay] || [] : [];

  return (
    <div className="calendar-wrap">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="ghost" onClick={() => setCursor(addMonths(cursor, -1))}>‹</button>
          <h2>{format(cursor, "MMMM yyyy")}</h2>
          <button className="ghost" onClick={() => setCursor(addMonths(cursor, 1))}>›</button>
          <button className="ghost" onClick={() => setCursor(new Date())}>היום</button>
        </div>
        <div className="legend">
          {Object.entries(STATUS).map(([k, v]) => (
            <span key={k} className="legend-item">
              <i style={{ background: v.color }} /> {v.label}
            </span>
          ))}
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const dayList = itemsByDay[key] || [];
          const muted = !isSameMonth(d, cursor);
          const today = isSameDay(d, new Date());
          return (
            <div
              key={key}
              className={`cal-cell${muted ? " muted" : ""}${today ? " today" : ""}`}
              onClick={() => setSelectedDay(key)}
            >
              <div className="cal-cell-head">
                <span>{format(d, "d")}</span>
                <button
                  className="add-mini"
                  onClick={(e) => { e.stopPropagation(); setSelectedDay(key); setEditing(emptyItem(key)); }}
                  title="הוסף אייטם"
                >＋</button>
              </div>
              <div className="cal-chips">
                {dayList.slice(0, 4).map((it) => (
                  <div
                    key={it.id}
                    className="chip"
                    style={{ borderRightColor: STATUS[it.status]?.color }}
                    onClick={(e) => { e.stopPropagation(); setSelectedDay(key); setEditing(it); }}
                  >
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

      {selectedDay && (
        <DayPanel
          day={selectedDay}
          items={dayItems}
          onClose={() => setSelectedDay(null)}
          onAdd={() => setEditing(emptyItem(selectedDay))}
          onEdit={(it) => setEditing(it)}
        />
      )}

      {editing && (
        <ItemModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={saveItem}
          onDelete={removeItem}
        />
      )}
    </div>
  );
}

function DayPanel({ day, items, onClose, onAdd, onEdit }) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>{format(parseISO(day), "EEEE, d בMMMM")}</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        <button className="primary full" onClick={onAdd}>＋ אייטם חדש</button>
        <div className="day-list">
          {items.length === 0 && <p className="muted">אין אייטמים ליום זה.</p>}
          {items.map((it) => (
            <div key={it.id} className="day-item" onClick={() => onEdit(it)}>
              <span className="dot" style={{ background: STATUS[it.status]?.color }} />
              <div>
                <div className="di-title">
                  {it.publish_time && <b>{it.publish_time.slice(0, 5)} · </b>}{it.title}
                </div>
                <div className="di-sub muted small">
                  {it.item_type} · {STATUS[it.status]?.label}{it.assignee ? ` · ${it.assignee}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ItemModal({ item, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(item);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h3>{form.id ? "עריכת אייטם" : "אייטם חדש"}</h3>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (form.title.trim()) onSave(form); }}
        >
          <label>כותרת האייטם *</label>
          <input value={form.title} onChange={set("title")} required autoFocus />

          <div className="row">
            <div>
              <label>תאריך</label>
              <input type="date" value={form.publish_date} onChange={set("publish_date")} />
            </div>
            <div>
              <label>שעת עלייה</label>
              <input type="time" value={form.publish_time || ""} onChange={set("publish_time")} />
            </div>
          </div>

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

          <label>אחראי / מי בעריכה</label>
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
