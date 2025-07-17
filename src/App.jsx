import { Routes, Route, Link, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";

import TaskManager from "./components/TaskManager";
import StatsPage   from "./components/StatsPage";
import GanttPage from "./components/GanttPage";
import SettingsPage from "./components/Settings";
import AdminPage   from "./components/Admin";
import AuthForm    from "./components/AuthForm";
import "./App.css";

const ADMIN_USER_IDS = [
  "HO0jawqleTdZgaJNejS5KTtoxlP2",
  "EMPTY",
];

function RequireAdmin({ user, children }) {
  if (!user || !ADMIN_USER_IDS.includes(user.uid)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  const [authUser,         setAuthUser]         = useState(null); // the REAL signed‑in user
  const [impersonatedUser, setImpersonatedUser] = useState(null); // user we’re acting as

  /* subscribe to Firebase auth */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, usr => setAuthUser(usr));
    return () => unsub();
  }, []);

  const handleLogout = () => {
    setImpersonatedUser(null);   // safety: drop impersonation first
    signOut(auth);
  };

  /* pick which “user” object each page should use */
  const effectiveUser = impersonatedUser || authUser;

  if (!authUser) return <AuthForm />;

  return (
    <div className="app-container">
      <nav className="nav-bar">
        <Link to="/"      className="nav-link">Tasks</Link>
        <Link to="/stats" className="nav-link">Stats</Link>
        <Link to="/gantt" className="nav-link">Gantt</Link>
        <Link to="/settings" className="nav-link">Settings</Link>

        {ADMIN_USER_IDS.includes(authUser.uid) && (
          <Link to="/admin" className="nav-link" style={{ color: "red" }}>
            Admin
          </Link>
        )}
        <span
          onClick={handleLogout}
          className="logout-link"
          style={{ marginLeft: "auto" }}
        >
          Log Out
        </span>
      </nav>

      <Routes>
        <Route
          path="/"
          element={
            <TaskManager
              user={effectiveUser}
              isImpersonating={!!impersonatedUser}
            />
          }
        />
        <Route
          path="/stats"
          element={
            <StatsPage
              user={effectiveUser}
              isImpersonating={!!impersonatedUser}
            />
          }
        />
        <Route
          path="/gantt"
          element={
            <GanttPage
              user={effectiveUser}
            />
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsPage
              user={effectiveUser}
              isImpersonating={!!impersonatedUser}
            />
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin user={authUser}>
              <AdminPage
                onImpersonate={setImpersonatedUser}
                stopImpersonate={() => setImpersonatedUser(null)}
                impersonatedUid={impersonatedUser?.uid || null}
              />
            </RequireAdmin>
          }
        />
      </Routes>
    </div>
  );
}
