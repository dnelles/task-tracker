import React, { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDocs
} from "firebase/firestore";
import { db } from "../firebase";

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [tasksByUser, setTasksByUser] = useState({});
  const [expandedUid, setExpandedUid] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load all users
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const userList = [];
      snap.forEach(doc => {
        userList.push({ uid: doc.id, ...doc.data() });
      });
      setUsers(userList);
    };

    // Load all tasks and group by userId
    const unsubTasks = onSnapshot(
      query(collection(db, "tasks"), orderBy("dueDate")),
      snap => {
        const grouped = {};
        snap.forEach(doc => {
          const data = { id: doc.id, ...doc.data() };
          const uid = data.userId || "unknown";
          if (!grouped[uid]) grouped[uid] = [];
          grouped[uid].push(data);
        });
        setTasksByUser(grouped);
        setLoading(false);
      }
    );

    fetchUsers();

    return () => unsubTasks(); // cleanup
  }, []);

  const fmtDate = ts =>
    ts?.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

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
        const totalSeconds = tasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);
        const formatTime = secs => new Date(secs * 1000).toISOString().substr(11, 8);
        const formattedTime = formatTime(totalSeconds);

        return (
          <div
            key={uid}
            className="card"
            style={{ marginBottom: 20, width: "100%", textAlign: "left" }}
          >
            <div
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between" }}
              onClick={() => setExpandedUid(expandedUid === uid ? null : uid)}
            >
              <strong>
                {fullName || user.email || uid}
                <span style={{ fontWeight: 400, fontSize: "0.85rem", marginLeft: 8, color: "#888" }}>
                    ⏱ {formattedTime}
                </span>
            </strong>
            </div>

            {expandedUid === uid && (
              <div style={{ marginTop: 12 }}>
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
                              📅 {fmtDate(t.dueDate)}
                            </span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

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
                              📅 {fmtDate(t.dueDate)}
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
