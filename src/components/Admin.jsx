// src/components/AdminPage.jsx
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
  const [grouped, setGrouped] = useState({});
  const [userProfiles, setUserProfiles] = useState({});
  const [expandedUid, setExpandedUid] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ── fetch user profiles ───────────── */
  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const map = {};
      snap.forEach(doc => map[doc.id] = doc.data());
      setUserProfiles(map);
    };
    fetchUsers();
  }, []);

  /* ── fetch ALL tasks once, group by userId ─────────────── */
  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("dueDate"));
    const unsub = onSnapshot(q, snap => {
      const byUser = {};
      snap.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        const uid  = data.userId || "unknown";
        if (!byUser[uid]) byUser[uid] = [];
        byUser[uid].push(data);
      });
      setGrouped(byUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  /* ── helper to format date ─────────── */
  const fmtDate = ts =>
    ts?.toDate().toLocaleDateString("en-US", {
      month:"short", day:"numeric", year:"numeric"
    });

  if (loading) return <p className="status-text">Loading all users…</p>;

  const userUids = Object.keys(grouped).sort();

  return (
    <div className="admin-container">
      <h2 className="main-heading">Admin – All Users</h2>

      {userUids.length === 0 ? (
        <p className="status-text">No task data yet.</p>
      ) : (
        userUids.map(uid => {
          const tasks = grouped[uid];
          const current  = tasks.filter(t => !t.completed);
          const complete = tasks.filter(t =>  t.completed);

          const profile = userProfiles[uid];
          const displayName = profile
            ? `${profile.firstName || "?"} ${profile.lastName || "?"} (${profile.email})`
            : uid;

          return (
            <div
              key={uid}
              className="card"
              style={{ marginBottom: 20, width: "100%", textAlign: "left" }}
            >
              {/* header / toggle */}
              <div
                style={{ cursor:"pointer", display:"flex", justifyContent:"space-between" }}
                onClick={() => setExpandedUid(expandedUid === uid ? null : uid)}
              >
                <strong>{displayName}</strong>
                <span>{expandedUid === uid ? "▲" : "▼"}</span>
              </div>

              {/* body */}
              {expandedUid === uid && (
                <div style={{ marginTop: 12 }}>
                  {/* CURRENT */}
                  <h4 style={{ margin: "6px 0" }}>
                    Current Tasks ({current.length})
                  </h4>
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

                  {/* COMPLETED */}
                  <h4 style={{ margin: "14px 0 6px" }}>
                    Completed Tasks ({complete.length})
                  </h4>
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
        })
      )}
    </div>
  );
}
