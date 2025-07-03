import { Routes, Route, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";

import TaskManager from "./components/TaskManager";
import StatsPage from "./components/StatsPage";
import AuthForm from "./components/AuthForm";

import './App.css';

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
      </Routes>
    </div>
  );
}

export default App;
