import React, { useEffect, useState, useRef } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc as firestoreDoc,
  getDoc,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  increment,
  where,
} from "firebase/firestore";
import { db, auth } from "../firebase";

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
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [progressDraft, setProgressDraft] = useState(0);

  const [selectedForSync, setSelectedForSync] = useState({});
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  // NEW: persistent Google Tasks connection status
  const [googleConnected, setGoogleConnected] = useState(false);

  /* stopwatch */
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  /* Time Log popup */
  const [showTimeLogPopup, setShowTimeLogPopup] = useState(false);

  /* Toast popup */
  const [toast, setToast] = useState(null); // { message, type: 'success'|'error'|'info' }
  const toastTimerRef = useRef(null);
  const showToast = (message, type = "success", duration = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  };
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

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

  /* ─────────────────────────── Google Tasks (persistent) ───────────────────── */

  // Helper to call your Vercel APIs with the current Firebase ID token
  async function authedFetch(path, options = {}) {
    const idToken = await auth.currentUser.getIdToken();
    return fetch(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(options.headers || {}),
      },
    });
  }

  // Check whether this user has already connected Google Tasks (refresh token saved server-side)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!userId) return;
        const res = await authedFetch("/api/google/status");
        if (!res.ok) throw new Error();
        const { connected } = await res.json();
        if (!cancelled) setGoogleConnected(!!connected);
      } catch {
        if (!cancelled) setGoogleConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Starts OAuth flow via server (redirect)
  const connectGoogleTasks = () => {
    window.location.href = `/api/google/start?uid=${userId}`;
  };

  // Disconnects across devices (revokes + deletes refresh token server-side)
  const disconnectGoogle = async () => {
    try {
      await authedFetch("/api/google/revoke", { method: "POST" });
      await logActivity(`Disconnected Google Tasks integration`);
    } catch {
      // ignore
    } finally {
      setGoogleConnected(false);
      showToast("Disconnected Google Tasks", "info");
    }
  };

  /* ─────────────────────────────── Activity Logging (Server-Side) ──────────────────────── */
  const logActivity = async (message) => {
    try {
      const res = await authedFetch("/api/logActivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to log activity");
      }
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  };

  /* ─────────────────────────────── Task CRUD Helpers ──────────────────────── */
  const addTask = async () => {
    // ✅ Due date is optional now
    if (!title) return alert("Title is required");

    let dueDateTimestamp = null;
    if (dueDate) {
      const [y, m, d] = dueDate.split("-").map(Number);
      const localDate = new Date(y, m - 1, d); // midnight local
      dueDateTimestamp = Timestamp.fromDate(localDate);
    }

    showToast("Adding new task...", "info", 5000);
    try {
      await addDoc(collection(db, "tasks"), {
        title,
        category,
        dueDate: dueDateTimestamp, // ✅ null allowed
        startDate: serverTimestamp(), // Set current date/time as startdate
        completed: false,
        timeSpent: 0,
        className: category === "School" ? className : "",
        notes: "",
        link: "",
        userId,
        timeLogs: [],
        progress: 0,
      });
      await logActivity(`Added new task: "${title}"`);
      showToast("Task added successfully!", "success");
      setTitle("");
      setDueDate("");
      setCategory("School");
      setClassName("");
    } catch (error) {
      showToast("Failed to add task.", "error");
      console.error("Error adding task:", error);
    }
  };

  const toggleComplete = async (id, cur) => {
    const updates = { completed: !cur };
    if (!cur) {
      updates.completedAt = serverTimestamp();
    } else {
      updates.completedAt = null;
    }

    showToast("Updating task status...", "info", 5000);
    try {
      const taskRef = firestoreDoc(db, "tasks", id);
      const docSnap = await getDoc(taskRef);
      if (docSnap.exists()) {
        const taskTitle = docSnap.data().title;
        await updateDoc(taskRef, updates);
        await logActivity(
          `${!cur ? "Marked" : "Unmarked"} task as complete: "${taskTitle}"`
        );
        showToast("Task status updated!", "success");
      }
    } catch (error) {
      showToast("Failed to update task status.", "error");
      console.error("Error toggling task completion:", error);
    }
  };

  const deleteTask = async (id) => {
    showToast("Deleting task...", "info", 5000);
    try {
      const taskRef = firestoreDoc(db, "tasks", id);
      const docSnap = await getDoc(taskRef);
      if (docSnap.exists()) {
        const taskTitle = docSnap.data().title;
        await deleteDoc(taskRef);
        await logActivity(`Deleted task: "${taskTitle}"`);
        showToast("Task deleted successfully!", "success");
      }
    } catch (error) {
      showToast("Failed to delete task.", "error");
      console.error("Error deleting task:", error);
    }
  };

  /* stopwatch handlers */
  const startTimer = async () => {
    if (timerRunning) return;
    setTimerStart(Date.now());
    setElapsedMs(0);
    setTimerRunning(true);

    if (activeTask) {
      try {
        const logEntry = { timestamp: Timestamp.now(), action: "start" };
        await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
          timeLogs: [...(activeTask.timeLogs || []), logEntry],
        });
        setActiveTask((p) =>
          p ? { ...p, timeLogs: [...(p.timeLogs || []), logEntry] } : p
        );
      } catch (error) {
        console.error("Error starting timer:", error);
      }
    }
  };

  const stopTimer = async () => {
    if (!timerRunning || !activeTask) return;
    const secs = Math.round((Date.now() - timerStart) / 1000);
    setTimerRunning(false);

    try {
      const newTimeSpent = (activeTask.timeSpent || 0) + secs;
      await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
        timeSpent: increment(secs),
      });
      const logEntry = {
        timestamp: Timestamp.now(),
        action: "stop",
        duration: secs,
        totalTime: newTimeSpent, // Add the new total time to the log entry
      };
      await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
        timeLogs: [...(activeTask.timeLogs || []), logEntry],
      });
      setActiveTask((p) =>
        p
          ? {
              ...p,
              timeSpent: newTimeSpent,
              timeLogs: [...(p.timeLogs || []), logEntry],
            }
          : p
      );
    } catch (error) {
      console.error("Error stopping timer:", error);
    }
  };

  /* ───────────────────────── dialog helpers ──────────────────────────────── */
  const openDiaglog = (task) => {
    setActiveTask(task);
    setTitleDraft(task.title || "");
    setNotesDraft(task.notes || "");
    setLinkDraft(task.link || "");
    setProgressDraft(task.progress ?? 0);

    // ✅ handle tasks with no due date
    setDueDateDraft(
      task.dueDate?.toDate?.()
        ? task.dueDate.toDate().toISOString().split("T")[0]
        : ""
    );

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

    const oldTitle = activeTask.title;
    const oldDueDate = activeTask.dueDate?.toDate?.()
      ? activeTask.dueDate.toDate().toISOString().split("T")[0]
      : "";
    const oldProgress = activeTask.progress ?? 0;

    showToast("Saving changes...", "info", 5000);
    try {
      // ✅ due date optional
      let dueDateTimestamp = null;
      if (dueDateDraft) {
        const [y, m, d] = dueDateDraft.split("-").map(Number);
        const localDate = new Date(y, m - 1, d);
        dueDateTimestamp = Timestamp.fromDate(localDate);
      }

      await updateDoc(firestoreDoc(db, "tasks", activeTask.id), {
        title: titleDraft,
        notes: notesDraft,
        link: linkDraft.trim(),
        dueDate: dueDateTimestamp, // ✅ null allowed
        progress: progressDraft,
      });

      // Log changes
      if (oldTitle !== titleDraft) {
        await logActivity(`Renamed task from "${oldTitle}" to "${titleDraft}"`);
      }
      if (oldDueDate !== dueDateDraft) {
        await logActivity(`Updated due date for "${titleDraft}"`);
      }
      if (oldProgress !== progressDraft) {
        await logActivity(
          `Updated progress for "${titleDraft}" from ${oldProgress}% to ${progressDraft}%`
        );
      }
      showToast("Changes saved successfully!", "success");
      closeDialog();
    } catch (error) {
      showToast("Failed to save changes.", "error");
      console.error("Error saving task details:", error);
    }
  };

  /* ───────────────────────── Google Tasks sync selected ───────────────────── */
  const toggleSelectForSync = (id) =>
    setSelectedForSync((p) => ({ ...p, [id]: !p[id] }));

  const syncSelectedTasks = async () => {
    const sel = tasks.filter((t) => selectedForSync[t.id]);
    if (!googleConnected) return showToast("Connect Google Tasks first", "error");
    if (sel.length === 0) return showToast("No tasks selected", "info");

    setIsSyncing(true);
    try {
      // get a fresh access token from server (works across devices)
      const tokRes = await authedFetch("/api/google/refresh", { method: "POST" });
      if (!tokRes.ok) throw new Error(await tokRes.text());
      const { access_token } = await tokRes.json();

      let ok = 0,
        fail = 0;
      for (const t of sel) {
        const hasDue = !!t.dueDate?.toDate?.();
        const body = {
          title: hasDue ? `Due: ${t.title}` : t.title,
          notes: t.notes || "",
          ...(hasDue ? { due: t.dueDate.toDate().toISOString() } : {}), // ✅ only include due if it exists
        };

        const res = await fetch(
          "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        if (res.ok) ok++;
        else fail++;
      }

      if (fail === 0) {
        showToast(`Tasks successfully synced (${ok})`, "success");
      } else if (ok === 0) {
        showToast("Task sync failed", "error");
      } else {
        showToast(`Partial sync: ${ok} succeeded, ${fail} failed`, "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Task sync failed", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  /* ─────────────────────────────── helpers ──────────────────────────────── */
  const fmtHMS = (s) => {
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };
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
        {isLoadingUser ? null : firstName ? `Hi there, ${firstName}` : "Task Wizard"}
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

        {!googleConnected ? (
          <button className="button-secondary sync-item" onClick={connectGoogleTasks}>
            Connect Google Tasks
          </button>
        ) : (
          <span className="sync-item clickable" onClick={disconnectGoogle}>
            ✅ Google Tasks Connected
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
              const hasDue = !!task.dueDate?.toDate?.();
              const overdue = hasDue && task.dueDate.toDate() < new Date() && !task.completed;

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
                        📅{" "}
                        {hasDue
                          ? task.dueDate.toDate().toLocaleDateString()
                          : "No due date"}
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

            {/* title, notes, link, due-date */}
            <input
              type="text"
              className="dialog-field"
              placeholder="Task title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
            />
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

            {/* due-date field (optional) */}
            <input
              className="dialog-field"
              type="date"
              value={dueDateDraft}
              onChange={(e) => setDueDateDraft(e.target.value)}
            />

            {/* progress slider */}
            <div className="progress-slider-section">
              <label htmlFor="progress-slider">Progress: {progressDraft}%</label>
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
                    const logEntry = {
                      timestamp: Timestamp.now(),
                      action: "manual_add",
                      duration: secs,
                      totalTime: newTime, // Add the new total time to the log entry
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
                    const logEntry = {
                      timestamp: Timestamp.now(),
                      action: "manual_set",
                      duration: secs,
                      totalTime: secs, // Add the new total time to the log entry
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
                        `Timer stopped (+${fmtHMS(log.duration || 0)}) -- Total: ${fmtHMS(
                          log.totalTime || 0
                        )}`}
                      {log.action === "manual_add" &&
                        `Manual time added (+${fmtHMS(log.duration || 0)}) -- Total: ${fmtHMS(
                          log.totalTime || 0
                        )}`}
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

      {/* Toast (click to dismiss) */}
      {toast && (
        <div
          role="status"
          onClick={() => setToast(null)}
          title="Click to dismiss"
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            background:
              toast.type === "success"
                ? "#16a34a"
                : toast.type === "error"
                ? "#dc2626"
                : "#2563eb",
            color: "#fff",
            padding: "12px 16px",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,.25)",
            zIndex: 1000,
            fontWeight: 600,
            cursor: "pointer",
            animation: "toast-in .18s ease-out",
          }}
        >
          {toast.message}
          {/* quick inline keyframes */}
          <style>{`
            @keyframes toast-in {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
