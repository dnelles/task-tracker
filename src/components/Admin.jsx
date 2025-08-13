import React, { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export default function AdminPage({
  onImpersonate,
  stopImpersonate,
  impersonatedUid,
}) {
  const [users, setUsers] = useState([]);
  const [tasksByUser, setTasksByUser] = useState({});
  const [expandedUid, setExpandedUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleDrafts, setRoleDrafts] = useState({});

  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      setUsers(list);
      const init = {};
      list.forEach(u => { init[u.uid] = u.role === "admin" ? "admin" : "regular"; });
      setRoleDrafts(init);
    };

    const unsubTasks = onSnapshot(
      query(collection(db, "tasks"), orderBy("dueDate")),
      snap => {
        const grouped = {};
        snap.forEach(ds => {
          const data = { id: ds.id, ...ds.data() };
          const uid = data.userId || "unknown";
          (grouped[uid] ||= []).push(data);
        });
        setTasksByUser(grouped);
        setLoading(false);
      }
    );

    fetchUsers();
    return () => unsubTasks();
  }, []);

  const fmtDate = ts =>
    ts?.toDate?.()?.toLocaleDateString?.("en-US", { month: "short", day: "numeric", year: "numeric" })
    || (ts instanceof Date ? ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null)
    || (typeof ts === "number" ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown");

  const handleSaveRole = async (uid) => {
    const role = roleDrafts[uid] || "regular";
    await updateDoc(doc(db, "users", uid), { role });
    setUsers(prev => prev.map(u => (u.uid === uid ? { ...u, role } : u)));
  };

  if (loading) return <p className="status-text">Loading users…</p>;

  return (
    <div className="admin-container">
      <h2 className="main-heading">Admin – All Users</h2>

      {users.map(user => {
        const uid = user.uid;
        const tasks = tasksByUser[uid] || [];
        const current = tasks.filter(t => !t.completed);
        const complete = tasks.filter(t => t.completed);
        const fullName = `${user.firstName || "?"} ${user.lastName || ""}`.trim();
        const totalSeconds = tasks.reduce((s, t) => s + (t.timeSpent || 0), 0);
        const hhmmss = new Date(totalSeconds * 1000).toISOString().slice(11, 19);
        const joined = fmtDate(user.createdAt);
        const roleDraft = roleDrafts[uid] ?? (user.role === "admin" ? "admin" : "regular");

        return (
          <div key={uid} className="card" style={{ marginBottom: 20, width: "100%", textAlign: "left" }}>
            {/* header row */}
            <div
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onClick={() => setExpandedUid(prev => (prev === uid ? null : uid))}
            >
              <strong>
                {fullName || user.email || uid}
                <span style={{ fontWeight: 400, fontSize: "0.85rem", marginLeft: 8, color: "#888" }}>
                  ⏱ {hhmmss}
                </span>
                {user.role === "admin" && (
                  <span style={{ marginLeft: 8, color: "#00b5ad", fontWeight: 700 }}>(Admin)</span>
                )}
              </strong>

              {/* impersonation buttons */}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                {impersonatedUid === uid ? (
                  <button
                    className="button-secondary"
                    onClick={(e) => { e.stopPropagation(); stopImpersonate(); }}
                  >
                    ⏹ Stop impersonating
                  </button>
                ) : (
                  <button
                    className="button-primary"
                    onClick={(e) => { e.stopPropagation(); onImpersonate(user); }}
                    style={{ fontSize: "0.85rem" }}
                  >
                    🕵️ Act as this user
                  </button>
                )}
              </div>
            </div>

            {/* expanded details */}
            {expandedUid === uid && (
              <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                {/* line 1: joined */}
                <div style={{ marginBottom: 6, color: "#bbb", fontWeight: 600 }}>
                  Joined: <span style={{ fontWeight: 400, color: "#e0e0e0" }}>{joined}</span>
                </div>

                {/* line 2: role selector + save */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontWeight: 600, color: "#bbb" }}>Role:</span>
                  <select
                    value={roleDraft}
                    onChange={(e) => setRoleDrafts(prev => ({ ...prev, [uid]: e.target.value }))}
                    className="input-select"
                    style={{ minWidth: 140 }}
                  >
                    <option value="regular">Regular</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="button-primary" onClick={() => handleSaveRole(uid)}>Save</button>
                </div>

                {/* current tasks */}
                <h4 style={{ margin: "6px 0" }}>Current Tasks ({current.length})</h4>
                {current.length === 0 ? (
                  <p className="status-text">None</p>
                ) : (
                  <ul className="task-list">
                    {current.map(t => (
                      <li key={t.id} className="task-item">
                        <div className="task-info">
                          <strong>{t.title}</strong>
                          <span className="task-metadata">
                            {" "}– {t.category}
                            {t.className && ` (${t.className})`}
                            <span className="task-due-date" style={{ marginLeft: 12 }}>
                              📅 {fmtDate(t.dueDate)}
                            </span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* completed */}
                <h4 style={{ margin: "14px 0 6px" }}>Completed Tasks ({complete.length})</h4>
                {complete.length === 0 ? (
                  <p className="status-text">None</p>
                ) : (
                  <ul className="task-list">
                    {complete.map(t => (
                      <li key={t.id} className="task-item completed">
                        <div className="task-info">
                          <strong>{t.title}</strong>
                          <span className="task-metadata">
                            {" "}– {t.category}
                            {t.className && ` (${t.className})`}
                            <span className="task-due-date" style={{ marginLeft: 12 }}>
                              📅 {fmtDate(t.dueDate)}
                            </span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
