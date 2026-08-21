import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { profile, user, signOut } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">📊 דאשבורד שיווק דיגיטלי</div>
        <nav className="topnav">
          <NavLink to="/" end>לוח תוכן</NavLink>
          <NavLink to="/dashboard">אנליטיקס</NavLink>
        </nav>
        <div className="user-box">
          <span className="muted small">{profile?.full_name || user?.email}</span>
          <button className="ghost" onClick={signOut}>יציאה</button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
