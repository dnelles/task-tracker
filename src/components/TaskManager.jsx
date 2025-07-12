import React, { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc as firestoreDoc,
  getDoc,
  Timestamp,
  onSnapshot,
  query,
  orderBy,
  increment,
  where,
} from "firebase/firestore";
import { useGoogleLogin } from "@react-oauth/google";
import { db } from "../firebase";

export default function TaskManager({ user, isImpersonating = false }) {
  if (!user) return null; // ── guard for unauthenticated render
  /* ─────────────────────────────────── state ────────────────────────────────── */
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("School");
  const [dueDate, setDueDate] = useState("");
  const [className, setClassName] = useState("");
  const [userClasses, setUserClasses] = useState([]);

  const [loading, setLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [progressDraft, setProgressDraft] = useState(0);

  const [selectedForSync, setSelectedForSync] = useState({});
  const [accessToken, setAccessToken] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  /* stopwatch */
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  /* Time Log popup */
  const [showTimeLogPopup, setShowTimeLogPopup] = useState(false);

  /* ─────────────────────────────── Fetch user information ──────────────────── */
  const userId = user.uid;
  useEffect(() => {
    const fetchUserSettings = async () => {
      try {
        const docRef = firestoreDoc(db, "users", userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.defaultCategory) {
            setCategory(data.defaultCategory);
          }
          if (data.firstName) {
            setFirstName(data.firstName);
          }
          if (Array.isArray(data.classes)) {
            setUserClasses(data.classes);
          }
        }
      } finally {
        setIsLoadingUser(false);
      }
    };
    fetchUserSettings();
  }, [userId]);
  

  /* ─────────────────────────────── Firestore listener ──────────────────────── */
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const q = query(
      collection(db, "tasks"),
      where("userId", "==", userId),
      orderBy("dueDate")
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setTasks(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  /* stopwatch tick */
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setElapsedMs(Date.now() - timerStart), 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerStart]);

  /* ─────────────────────────────── Google Tasks OAuth ─────────────────────── */
  const loginWithGoogle = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/tasks",
    onSuccess: ({ access_token }) => {
      setAccessToken(access_token);
      localStorage.setItem(`google_access_token_${userId}`, access_token);
    },
    onError: () => alert("Google Tasks connection failed"),
  });

  const disconnectGoogle = () => {
    setAccessToken(null);
    localStorage.removeItem(`google_access_token_${userId}`);
  };

  /* ─────────────────────────────── task CRUD helpers ──────────────────────── */
  const addTask = async () => {
    if (!title || !dueDate) return alert("Title and due date are required");
    const [y, m, d] = dueDate.split("-").map(Number);
    const localDate = new Date(y, m - 1, d); // midnight local
    await addDoc(collection(db, "tasks"), {
      title,
      category,
      dueDate: Timestamp.fromDate(localDate),
      completed: false,
      timeSpent: 0,
      className: category === "School" ? className : "",
      notes: "",
      link: "",
      userId,
      timeLogs: [],
      progress: 0,
    });
    setTitle("");
    setDueDate("");
    setCategory("School");
    setClassName("");
  };

  const toggleComplete = (id, cur) =>
    updateDoc(firestoreDoc(db, "tasks", id), { completed: !cur });

  const deleteTask = (id) => deleteDoc(firestoreDoc(db, "tasks", id));

  /* stopwatch handlers */
  const startTimer = async () => {
    if (timerRunning) return;
    setTimerStart(Date.now());
    setElapsedMs(0);
    setTimerRunning(true);

    // Add time log entry for start
    if (activeTask) {
      const logEntry = {
        timestamp: Timestamp.now(),
        action: "start",
      };
      await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
        timeLogs: [...(activeTask.timeLogs || []), logEntry],
      });
      setActiveTask((p) =>
        p ? { ...p, timeLogs: [...(p.timeLogs || []), logEntry] } : p
      );
    }
  };
  const stopTimer = async () => {
    if (!timerRunning || !activeTask) return;
    const secs = Math.round((Date.now() - timerStart) / 1000);
    setTimerRunning(false);
    await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
      timeSpent: increment(secs),
    });
    // Add time log entry for stop
    const logEntry = {
      timestamp: Timestamp.now(),
      action: "stop",
      duration: secs,
    };
    await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
      timeLogs: [...(activeTask.timeLogs || []), logEntry],
    });
    setActiveTask((p) =>
      p
        ? {
            ...p,
            timeSpent: (p.timeSpent || 0) + secs,
            timeLogs: [...(p.timeLogs || []), logEntry],
          }
        : p
    );
  };

  /* ───────────────────────── dialog helpers ──────────────────────────────── */
  const openDiaglog = (task) => {
    setActiveTask(task);
    setNotesDraft(task.notes || "");
    setLinkDraft(task.link || "");
    setProgressDraft(task.progress ?? 0); //defaults progress to = 0 if undefined

    // pre‑fill due‑date ISO yyyy‑mm‑dd
    setDueDateDraft(task.dueDate.toDate().toISOString().split("T")[0]);

    setDialogOpen(true);
    setTimerRunning(false);
    setElapsedMs(0);
    setShowTimeLogPopup(false);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setTimerRunning(false);
    setShowTimeLogPopup(false);
  };

  const saveDialog = async () => {
    if (!activeTask) return;

    // convert local yyyy‑mm‑dd to Date (midnight local)
    const [y, m, d] = dueDateDraft.split("-").map(Number);
    const localDate = new Date(y, m - 1, d);

    await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
      notes: notesDraft,
      link: linkDraft.trim(),
      dueDate: Timestamp.fromDate(localDate),
      progress: progressDraft,
    });
    closeDialog();
  };

  /* ───────────────────────── Google Tasks sync selected ───────────────────── */
  const toggleSelectForSync = (id) =>
    setSelectedForSync((p) => ({ ...p, [id]: !p[id] }));

  const syncSelectedTasks = async () => {
    const sel = tasks.filter((t) => selectedForSync[t.id]);
    if (!accessToken) return alert("Connect Google Tasks first");
    if (sel.length === 0) return alert("No tasks selected");

    setIsSyncing(true);
    try {
      for (const t of sel) {
        const body = {
          title: `Due: ${t.title}`,
          notes: t.notes || "",
          due: t.dueDate.toDate().toISOString(), // RFC 3339
        };
        const res = await fetch(
          "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          console.error("Sync error:", data);
          alert(`Failed: ${t.title}\n${data.error?.message}`);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Sync failed (network or auth error).");
    } finally {
      setIsSyncing(false);
    }
  };

  /* ─────────────────────────────── helpers ──────────────────────────────── */
  const fmtHMS = (s) => new Date(s * 1000).toISOString().substr(11, 8);
  const getEstimatedTimeRemaining = () => {
    if (!activeTask || typeof activeTask.timeSpent !== "number") return "Unknown";
    if (progressDraft <= 0 || progressDraft >= 100) return "Unknown";
  
    const estimatedTotal = activeTask.timeSpent / (progressDraft / 100);
    const remaining = estimatedTotal - activeTask.timeSpent;
  
    if (isNaN(remaining) || remaining < 0) return "Unknown";
  
    return fmtHMS(Math.round(remaining));
  }; 

  /* ─────────────────────────────── UI below ─────────────────────────────── */
  return (
    <div className="task-manager">
      {isImpersonating && (
        <div
          style={{
            backgroundColor: "#fff4e5",
            padding: "8px 12px",
            borderRadius: 4,
            color: "#a67c00",
            marginBottom: 20,
            fontWeight: "bold",
            border: "1px solid #a67c00",
            userSelect: "none",
          }}
        >
          ⚠️ You are impersonating: {user.email || user.uid}
        </div>
      )}
      <h2 className="main-heading">
        {isLoadingUser ? null : firstName ? `Hi there ${firstName}`:"Task Wizard"}  
      </h2>

      {/* ── input row ───────────────── */}
      <div className="input-row">
        <input
          type="text"
          className="input-text input-title"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input-select"
        >
          <option value="School">School</option>
          <option value="Personal">Personal</option>
        </select>

        {category === "School" && (
          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="input-select input-class"
          >
            <option value="">Select Class</option>
            {userClasses.map((cls, idx) => (
              <option key={idx} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        )}
        <input
          type="date"
          className="input-date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

        <button onClick={addTask} className="button-primary">
          Add Task
        </button>
      </div>

      {/* tabs */}
      <div className="tab-buttons-container">
        <button
          className={`tab-button ${!showCompleted ? "active" : "inactive"}`}
          onClick={() => setShowCompleted(false)}
        >
          Current
        </button>
        <button
          className={`tab-button ${showCompleted ? "active" : "inactive"}`}
          onClick={() => setShowCompleted(true)}
        >
          Complete
        </button>
      </div>

      {/* sync bar */}
      <div className="sync-bar">
        <label className="sync-item">
          <input
            type="checkbox"
            checked={tasks
              .filter((t) => t.completed === showCompleted)
              .every((t) => selectedForSync[t.id])}
            onChange={() => {
              const visible = tasks.filter((t) => t.completed === showCompleted);
              const allSel = visible.every((t) => selectedForSync[t.id]);
              const next = { ...selectedForSync };
              visible.forEach((t) => {
                next[t.id] = !allSel;
              });
              setSelectedForSync(next);
            }}
          />{" "}
          Select All Visible
        </label>
        <span
          className={`sync-item ${isSyncing ? "disabled" : "clickable"}`}
          onClick={isSyncing ? undefined : syncSelectedTasks}
        >
          {isSyncing ? "Syncing…" : "Sync Selected"}
        </span>
        {!accessToken ? (
          <button className="button-secondary sync-item" onClick={loginWithGoogle}>
            Connect Google Tasks
          </button>
        ) : (
          <span
            className="sync-item clickable"
            onClick={disconnectGoogle}
          >
            ✅ Tasks connected
          </span>
        )}
      </div>
      {/* task list */}
      {loading ? (
        <p className="status-text">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="status-text">No tasks yet</p>
      ) : (
        <ul className="task-list">
          {tasks
            .filter((t) => t.completed === showCompleted)
            .map((task) => {
              const overdue = task.dueDate.toDate() < new Date() && !task.completed;
              return (
                <li
                  key={task.id}
                  className={`task-item ${task.completed ? "completed" : ""}`}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: 8 }}
                    checked={!!selectedForSync[task.id]}
                    onChange={() => toggleSelectForSync(task.id)}
                  />
                  <div className="task-info">
                    <strong>{task.title}</strong>
                    <span className="task-metadata">
                      {" "}
                      – {task.category}
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
                      className="button-secondary task-action-button"
                      >
                      {task.completed ? "Undo" : "✅"}
                    </button>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="button-danger task-action-button"
                    >
                      ❌
                    </button>
                    <button
                      onClick={() => openDiaglog(task)}
                      className="button-secondary more-button task-action-button"
                      >
                        …
                      </button>
                    </div>
                </li>
              );
            })}
        </ul>
      )}

      {/* dialog */}
      {dialogOpen && (
        <div className="task-dialog-overlay" onClick={closeDialog}>
          <div className="task-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>Edit details</h4>

            {/* notes, link, due‑date */}
            <textarea
              className="dialog-field"
              rows="4"
              placeholder="Notes / description"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
            <input
              className="dialog-field"
              type="url"
              placeholder="Reference link (https://…)"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
            />

            {/* ⭐ NEW due-date field */}
            <input
              className="dialog-field"
              type="date"
              value={dueDateDraft}
              onChange={(e) => setDueDateDraft(e.target.value)}
            />

            {/* progress slider */}
            <div className="progress-slider-section">
              <label htmlFor="progress-slider">
                Progress: {progressDraft}%
              </label>
              <input
                id="progress-slider"
                type="range"
                min="0"
                max="100"
                step="5"
                value={progressDraft}
                onChange={(e) => setProgressDraft(Number(e.target.value))}
                className="progress-slider"
              />
            </div>
            <div className="progress-estimate">
              Est. Time Remaining: {getEstimatedTimeRemaining()}
            </div>

            {/* timer block */}
            <div className="timer-section">
              <div className="timer-display">
                Current Time:&nbsp;{new Date(elapsedMs).toISOString().substr(11, 8)}
              </div>
              {activeTask?.timeSpent !== undefined && (
                <div className="total-time">Total Time: {fmtHMS(activeTask.timeSpent || 0)}</div>
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
                className="dialog-field manual-time-input"
                placeholder="Mins"
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
              />
              <div className="manual-buttons">
                <button
                  className="button-secondary"
                  onClick={async () => {
                    if (!activeTask || isNaN(Number(manualMinutes))) return;
                    const secs = Math.round(Number(manualMinutes) * 60);
                    const newTime = Math.max(0, (activeTask.timeSpent || 0) + secs);
                    await updateDoc(firestoreDoc(db, "tasks", activeTask.id), { timeSpent: newTime });
                    // add manual_add log entry
                    const logEntry = {
                      timestamp: Timestamp.now(),
                      action: "manual_add",
                      duration: secs,
                    };
                    await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
                      timeLogs: [...(activeTask.timeLogs || []), logEntry],
                    });
                    setActiveTask({
                      ...activeTask,
                      timeSpent: newTime,
                      timeLogs: [...(activeTask.timeLogs || []), logEntry],
                    });
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
                    await updateDoc(firestoreDoc(db, "tasks", activeTask.id), { timeSpent: secs });
                    // add manual_set log entry
                    const logEntry = {
                      timestamp: Timestamp.now(),
                      action: "manual_set",
                      duration: secs,
                    };
                    await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
                      timeLogs: [...(activeTask.timeLogs || []), logEntry],
                    });
                    setActiveTask({
                      ...activeTask,
                      timeSpent: secs,
                      timeLogs: [...(activeTask.timeLogs || []), logEntry],
                    });
                    setManualMinutes("");
                  }}
                >
                  Set
                </button>
              </div>
            </div>

            {/* Small, discrete time log button */}
            <button
              className="button-secondary time-log-button"
              onClick={() => setShowTimeLogPopup(true)}
            >
              View Time Log
            </button>

            <div className="dialog-actions">
              <button className="button-tertiary" onClick={closeDialog}>
                Cancel
              </button>
              <button className="button-task-save" onClick={saveDialog}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Log Sub-popup */}
      {showTimeLogPopup && (
        <div
          className="time-log-popup-overlay"
          onClick={() => setShowTimeLogPopup(false)}
        >
          <div className="time-log-popup" onClick={(e) => e.stopPropagation()}>
            <h4>Time Log</h4>
            {!activeTask?.timeLogs || activeTask.timeLogs.length === 0 ? (
              <p>No time log entries yet.</p>
            ) : (
              <ul className="time-log-list">
                {[...activeTask.timeLogs]
                  .sort((a, b) => b.timestamp.seconds - a.timestamp.seconds)
                  .map((log, i) => (
                    <li key={i}>
                      <strong>
                        {new Date(log.timestamp.seconds * 1000).toLocaleString()}:
                      </strong>{" "}
                      {log.action === "start" && "Timer started"}
                      {log.action === "stop" &&
                        `Timer stopped (+${fmtHMS(log.duration || 0)})`}
                      {log.action === "manual_add" &&
                        `Manual time added (+${fmtHMS(log.duration || 0)})`}
                      {log.action === "manual_set" &&
                        `Manual time set to ${fmtHMS(log.duration || 0)}`}
                    </li>
                  ))}
              </ul>
            )}

            <button
              onClick={() => setShowTimeLogPopup(false)}
              className="button-primary time-log-close-btn"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}