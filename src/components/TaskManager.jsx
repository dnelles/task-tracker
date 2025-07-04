import React, { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  onSnapshot,
  query,
  orderBy,
  increment,
  where,
} from "firebase/firestore";
import { useGoogleLogin } from "@react-oauth/google";
import { db } from "../firebase";

/* ───── helper – efficiency score (unused in UI for now) ───── */
function getEfficiencyScore(task) {
  if (!task?.completed) return 0;
  const hrs = (task.timeSpent || 0) / 3600;
  if (hrs <= 0) return 100;
  return Math.min(100, Math.round(100 / (1 + hrs)));
}

export default function TaskManager({ user }) {
  if (!user) return null; // guard

  /* ── state ─────────────────────────────────────────────── */
  const [tasks, setTasks]               = useState([]);
  const [title, setTitle]               = useState("");
  const [category, setCategory]         = useState("School");
  const [dueDate, setDueDate]           = useState("");
  const [className, setClassName]       = useState("");

  const [loading, setLoading]           = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [activeTask, setActiveTask]     = useState(null);
  const [notesDraft, setNotesDraft]     = useState("");
  const [linkDraft, setLinkDraft]       = useState("");
  const [manualMinutes, setManualMinutes] = useState("");

  const [selectedForSync, setSelectedForSync] = useState({});
  const [accessToken, setAccessToken]   = useState(null);
  const [isSyncing, setIsSyncing]       = useState(false);

  /* timer state */
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart]     = useState(null);
  const [elapsedMs, setElapsedMs]       = useState(0);

  /* ── Firestore listener (per user) ─────────────────────── */
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const q = query(
      collection(db, "tasks"),
      where("userId", "==", user.uid),
      orderBy("dueDate")
    );

    const unsub = onSnapshot(q, snap => {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      setTasks(arr);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  /* live stopwatch for timer */
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(
      () => setElapsedMs(Date.now() - timerStart),
      1000
    );
    return () => clearInterval(id);
  }, [timerRunning, timerStart]);

const userId = user?.uid || null;
useEffect(() => {
  if (!userId) return;
  const token = localStorage.getItem(`google_access_token_${userId}`);
  if (token) setAccessToken(token);
  else setAccessToken(null);
}, [userId]);

  
  const loginWithGoogle = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/calendar.events",
    onSuccess: (tok) => {
      setAccessToken(tok.access_token);
      localStorage.setItem(`google_access_token_${user.uid}`, tok.access_token);
    },
    onError: () => alert("Google Calendar connection failed"),
  });
  
  const disconnectGoogle = () => {
    setAccessToken(null);
    localStorage.removeItem(`google_access_token_${user.uid}`);
  };  

  /* ── Google Calendar helper – create one event ────────── */
  async function createCalendarEvent(task) {
    if (!accessToken) throw new Error("Missing Google token");

    // default whole-day event on dueDate
    const startDate = task.dueDate.toDate();
    const startStr = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate()
).toISOString().split("T")[0];
const endDate = new Date(startDate);
endDate.setDate(endDate.getDate() + 1);
const endStr = new Date(
  endDate.getFullYear(),
  endDate.getMonth(),
  endDate.getDate()
).toISOString().split("T")[0];
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Calendar API error");
    }
    return await res.json();
  }

  /* ── CRUD helpers for tasks ───────────────────────────── */
  const addTask = async () => {
    if (!title || !dueDate) return alert("Title and due date are required");
    await addDoc(collection(db, "tasks"), {
      title,
      category,
      dueDate: Timestamp.fromDate(new Date(dueDate)),
      completed: false,
      timeSpent: 0,
      className: category === "School" ? className : "",
      notes: "",
      link: "",
      userId: user.uid,
    });
    setTitle(""); setDueDate(""); setCategory("School"); setClassName("");
  };

  const toggleComplete = (id, cur) =>
    updateDoc(doc(db, "tasks", id), { completed: !cur });

  const deleteTask = id => deleteDoc(doc(db, "tasks", id));

  /* timer helpers */
  const startTimer = () => {
    if (timerRunning) return;
    setTimerStart(Date.now());
    setElapsedMs(0);
    setTimerRunning(true);
  };
  const stopTimer = async () => {
    if (!timerRunning || !activeTask) return;
    const secs = Math.round((Date.now() - timerStart) / 1000);
    setTimerRunning(false);
    await updateDoc(doc(db, "tasks", activeTask.id), { timeSpent: increment(secs) });
    setActiveTask(p => p ? { ...p, timeSpent: (p.timeSpent || 0) + secs } : p);
  };

  /* dialog helpers */
  const openDiaglog = task => {
    setActiveTask(task);
    setNotesDraft(task.notes || "");
    setLinkDraft(task.link || "");
    setDialogOpen(true);
    setTimerRunning(false);
    setElapsedMs(0);
  };
  const closeDialog = () => { setDialogOpen(false); setTimerRunning(false); };

  const saveDialog = async () => {
    if (!activeTask) return;
    await updateDoc(doc(db, "tasks", activeTask.id), {
      notes: notesDraft,
      link : linkDraft.trim(),
    });
    closeDialog();
  };

  /* utilities */
  const fmtHMS = s => new Date(s * 1000).toISOString().substr(11, 8);

  /* checkbox & sync helpers */
  const toggleSelectForSync = id =>
    setSelectedForSync(prev => ({ ...prev, [id]: !prev[id] }));

  const syncSelectedTasks = async () => {
    const sel = tasks.filter((t) => selectedForSync[t.id]);
    if (sel.length === 0) {
      alert("No tasks selected to sync.");
      return;
    }
    if (!accessToken) {
      alert("Connect Google Calendar first.");
      return;
    }
  
    for (const task of sel) {
      const startDate = task.dueDate.toDate();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1); // Google Calendar end is exclusive
    
      const startStr = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate()
      ).toISOString().split("T")[0];
    
      const endStr = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate()
      ).toISOString().split("T")[0];
    
      const event = {
        summary: `Due: ${task.title}`,
        description: task.notes || "",
        start: { date: startStr },
        end: { date: endStr },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 960 }, // Notification reminder 8am the day before
          ],
        },
      };      
    
      try {
        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(event),
          }
        );
    
        const data = await res.json();
        console.log("Event sync response:", data);
    
        if (res.ok) {
          alert(`Synced: ${task.title}`);
        } else {
          console.error("Sync error:", data);
          alert(`Failed to sync: ${task.title}\nReason: ${data.error?.message || "Unknown error"}`);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        alert(`Error syncing: ${task.title}`);
      }
    }    
  };  

  /* ── UI ─────────────────────────────────────────────── */
  return (
    <div className="task-manager">
      <h2 className="main-heading">Task Wizard</h2>

      {/* ───── input row ───── */}
      <div className="input-row">
        <input
          type="text"
          placeholder="Task title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="input-text input-title"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="input-select"
        >
          <option value="School">School</option>
          <option value="Personal">Personal</option>
        </select>
        {category === "School" && (
          <input
            type="text"
            placeholder="Class"
            value={className}
            onChange={e => setClassName(e.target.value)}
            className="input-text input-class"
          />
        )}
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="input-date"
        />
        <button onClick={addTask} className="button-primary">Add Task</button>
      </div>

      {/* ───── tabs ───── */}
      <div className="tab-buttons-container">
        <button
          onClick={() => setShowCompleted(false)}
          className={`tab-button ${!showCompleted ? "active" : "inactive"}`}
        >
          Current
        </button>
        <button
          onClick={() => setShowCompleted(true)}
          className={`tab-button ${showCompleted ? "active" : "inactive"}`}
        >
          Complete
        </button>
      </div>

      <h3>{showCompleted ? "Completed Tasks" : "Current Tasks"}</h3>

      {/* ───── select‑all / sync / calendar connect ───── */}
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 20,
          fontWeight: 600,
          color: "#00b5ad",
        }}
      >
        {/* select all visible */}
        <label style={{ fontSize: "0.9rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={tasks
              .filter(t => t.completed === showCompleted)
              .every(t => selectedForSync[t.id])}
            onChange={() => {
              const visible = tasks.filter(t => t.completed === showCompleted);
              const allSel  = visible.every(t => selectedForSync[t.id]);
              const next = { ...selectedForSync };
              visible.forEach(t => { next[t.id] = !allSel; });
              setSelectedForSync(next);
            }}
          />{" "}
          Select All Visible
        </label>

        {/* sync selected */}
        <span
          onClick={isSyncing ? undefined : syncSelectedTasks}
          style={{
            cursor: isSyncing ? "default" : "pointer",
            fontSize: "0.85rem",
            textDecoration: "underline",
            opacity: isSyncing ? 0.5 : 1,
          }}
          title="Sync selected tasks"
        >
          {isSyncing ? "Syncing…" : "Sync Selected"}
        </span>

        {/* connect / disconnect calendar */}
        {!accessToken ? (
          <button
            onClick={loginWithGoogle}
            className="button-secondary"
            style={{ fontSize: "0.8rem" }}
          >
            Connect Google&nbsp;Calendar
          </button>
        ) : (
          <span
            onClick={disconnectGoogle}
            style={{
              fontSize: "0.8rem",
              cursor: "pointer",
              textDecoration: "underline",
              userSelect: "none",
              color: "#00b5ad",
            }}
            title="Click to disconnect Google Calendar"
          >
            ✅ Calendar connected
          </span>
        )}
      </div>

      {/* ───── task list ───── */}
      {loading ? (
        <p className="status-text">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="status-text">No tasks yet</p>
      ) : (
        <ul className="task-list">
          {tasks
            .filter(t => t.completed === showCompleted)
            .map(task => {
              const overdue = task.dueDate.toDate() < new Date() && !task.completed;
              return (
                <li key={task.id} className={`task-item ${task.completed ? "completed" : ""}`}>
                  <input
                    type="checkbox"
                    checked={!!selectedForSync[task.id]}
                    onChange={() => toggleSelectForSync(task.id)}
                    title="Select for sync"
                    style={{ marginRight: 8 }}
                  />

                  <div className="task-info">
                    <strong>{task.title}</strong>
                    <span className="task-metadata">
                      {" "}– {task.category}
                      {task.className && ` (${task.className})`}
                      <span
                        className={`task-due-date ${overdue ? "overdue" : ""}`}
                        style={{ marginLeft: 12 }}
                      >
                        📅 {task.dueDate.toDate().toLocaleDateString()}
                      </span>
                    </span>
                  </div>

                  <div className="task-actions">
                    <button
                      onClick={() => toggleComplete(task.id, task.completed)}
                      className="button-secondary"
                    >
                      {task.completed ? "Undo" : "Complete"}
                    </button>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="button-danger"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => openDiaglog(task)}
                      className="button-secondary more-button"
                    >
                      …
                    </button>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      {/* ───── popup dialog ───── */}
      {dialogOpen && (
        <div className="task-dialog-overlay" onClick={closeDialog}>
          <div className="task-dialog" onClick={e => e.stopPropagation()}>
            <h4>Edit details</h4>

            <textarea
              className="dialog-field"
              rows="4"
              placeholder="Notes / description"
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
            />

            <input
              className="dialog-field"
              type="url"
              placeholder="Reference link (https://…)"
              value={linkDraft}
              onChange={e => setLinkDraft(e.target.value)}
            />

            {/* timer block */}
            <div className="timer-section">
              <div className="timer-display">
                Current Time:&nbsp;{new Date(elapsedMs).toISOString().substr(11, 8)}
              </div>
              {activeTask?.timeSpent !== undefined && (
                <div className="total-time">
                  Total Time: {fmtHMS(activeTask.timeSpent || 0)}
                </div>
              )}
              <button
                type="button"
                onClick={timerRunning ? stopTimer : startTimer}
                className={`button-secondary ${timerRunning ? "stop-btn" : "start-btn"}`}
                style={{ marginTop: 12 }}
              >
                {timerRunning ? "Stop" : "Start"}
              </button>
            </div>

            {/* manual time entry */}
            <div className="manual-time-section">
              <h5 style={{ marginBottom: 8 }}>Manual Time Entry</h5>
              <input
                type="number"
                placeholder="Mins"
                className="dialog-field manual-time-input"
                value={manualMinutes}
                onChange={e => setManualMinutes(e.target.value)}
              />
              <div className="manual-buttons">
                <button
                  className="button-secondary"
                  onClick={async () => {
                    if (!activeTask || isNaN(Number(manualMinutes))) return;
                    const secs = Math.round(Number(manualMinutes) * 60);
                    const newTime = Math.max(0, (activeTask.timeSpent || 0) + secs);
                    await updateDoc(doc(db, "tasks", activeTask.id), { timeSpent: newTime });
                    setActiveTask({ ...activeTask, timeSpent: newTime });
                    setManualMinutes("");
                  }}
                >
                  Add
                </button>
                <button
                  className="button-secondary"
                  onClick={async () => {
                    if (!activeTask || isNaN(Number(manualMinutes))) return;
                    const secs = Math.max(0, Math.round(Number(manualMinutes) * 60));
                    await updateDoc(doc(db, "tasks", activeTask.id), { timeSpent: secs });
                    setActiveTask({ ...activeTask, timeSpent: secs });
                    setManualMinutes("");
                  }}
                >
                  Set
                </button>
              </div>
            </div>

            <div className="dialog-actions">
              <button className="button-tertiary" onClick={closeDialog}>
                Cancel
              </button>
              <button className="button-primary" onClick={saveDialog}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
