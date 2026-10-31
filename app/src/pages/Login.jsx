import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    // שם משתמש בלי @ ממופה לכתובת פנימית (Supabase Auth דורש אימייל)
    const login = email.trim().toLowerCase();
    const { error } = await signIn(login.includes("@") ? login : `${login}@users.social-dash.local`, password);
    setBusy(false);
    if (error) setErr("שם משתמש או סיסמה שגויים");
  }

  return (
    <div className="center-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>📊 דאשבורד שיווק</h1>
        <p className="muted">התחברות למערכת</p>
        <label>אימייל או שם משתמש</label>
        <input type="text" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <label>סיסמה</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="error">{err}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "מתחבר…" : "כניסה"}
        </button>
        <p className="muted small">אין לך גישה? פנה למנהל המערכת ליצירת משתמש.</p>
      </form>
    </div>
  );
}
