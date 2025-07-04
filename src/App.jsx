import { Routes, Route, Link, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import TaskManager from "./components/TaskManager";
import StatsPage from "./components/StatsPage";
import AdminPage from "./components/Admin";  // <-- import admin page
import AuthForm from "./components/AuthForm";
import './App.css';

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

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth);
  };

  if (!user) {
    return <AuthForm />;
  }

  return (
    <div className="app-container">
      <nav className="nav-bar">
        <Link to="/" className="nav-link">Tasks</Link>
        <Link to="/stats" className="nav-link">Stats</Link>

        {/* Show Admin link only for admin user */}
        {ADMIN_USER_IDS.includes(user.uid) && (
          <Link to="/admin" className="nav-link" style={{ color: "red" }}>
            Admin
          </Link>
        )}
        <span
          onClick={handleLogout}
          className="nav-link logout-link"
          style={{ marginLeft: "auto", cursor: "pointer" }}
        >
          Log Out
        </span>
      </nav>

      <Routes>
        <Route path="/" element={<TaskManager user={user} />} />
        <Route path="/stats" element={<StatsPage user={user} />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin user={user}>
              <AdminPage />
            </RequireAdmin>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
