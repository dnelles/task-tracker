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
import { db } from "../firebase";

/* ───────── helper – efficiency score ───────── */
function getEfficiencyScore(task) {
  if (!task?.completed) return 0;
  const hrs = (task.timeSpent || 0) / 3600;
  if (hrs <= 0) return 100;
  return Math.min(100, Math.round(100 / (1 + hrs)));
}

export default function TaskManager({ user }) {
  if (!user) return null; // shouldn't render without a user

  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("School");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [className, setClassName] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [selectedForSync, setSelectedForSync] = useState({}); // {taskId: boolean}

  /* timer state */
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);

    const q = query(
      collection(db, "tasks"),
      where("userId", "==", user.uid),
      orderBy("dueDate")
    );

    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setTasks(arr);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setElapsedMs(Date.now() - timerStart), 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerStart]);

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
    setTitle("");
    setDueDate("");
    setCategory("School");
    setClassName("");
  };

  const toggleComplete = (id, cur) =>
    updateDoc(doc(db, "tasks", id), { completed: !cur });

  const deleteTask = (id) => deleteDoc(doc(db, "tasks", id));

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
    setActiveTask((p) => (p ? { ...p, timeSpent: (p.timeSpent || 0) + secs } : p));
  };

  const openDiaglog = (task) => {
    setActiveTask(task);
    setNotesDraft(task.notes || "");
    setLinkDraft(task.link || "");
    setDialogOpen(true);
    setTimerRunning(false);
    setElapsedMs(0);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setTimerRunning(false);
  };

  const saveDialog = async () => {
    if (!activeTask) return;
    await updateDoc(doc(db, "tasks", activeTask.id), {
      notes: notesDraft,
      link: linkDraft.trim(),
    });
    closeDialog();
  };

  const fmtHMS = (s) => new Date(s * 1000).toISOString().substr(11, 8);

  /* Handle checkbox change */
  const toggleSelectForSync = (taskId) => {
    setSelectedForSync((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const syncSelectedTasks = () => {
    const selectedTasks = tasks.filter((t) => selectedForSync[t.id]);
    if (selectedTasks.length === 0) {
      alert("No tasks selected for sync.");
      return;
    }
    alert(`Syncing ${selectedTasks.length} task(s)...`);
  };

  return (
    <div className="task-manager">
      <h2 className="main-heading">Task Wizard</h2>

      {/* input row */}
      <div className="input-row">
        <input
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-text input-title"
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
          <input
            type="text"
            placeholder="Class"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="input-text input-class"
          />
        )}
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="input-date"
        />
        <button onClick={addTask} className="button-primary">
          Add Task
        </button>
      </div>

      {/* tabs */}
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

      {/* sync & select all container */}
      <div
        style={{
          marginBottom: "12px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "20px",
          color: "#00b5ad",
          fontWeight: "600",
          userSelect: "none",
        }}
      >
        <label style={{ fontSize: "0.9rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            onChange={() => {
              const visibleTasks = tasks.filter(
                (t) => t.completed === showCompleted
              );
              const allSelected = visibleTasks.every(
                (t) => selectedForSync[t.id]
              );
              const newSelected = { ...selectedForSync };
              visibleTasks.forEach((t) => {
                newSelected[t.id] = !allSelected;
              });
              setSelectedForSync(newSelected);
            }}
            checked={tasks
              .filter((t) => t.completed === showCompleted)
              .every((t) => selectedForSync[t.id])}
          />{" "}
          Select All Visible
        </label>

        <span
          onClick={syncSelectedTasks}
          style={{
            fontSize: "0.85rem",
            cursor: "pointer",
            color: "#00b5ad",
          }}
          title="Sync selected tasks"
        >
          Sync Selected
        </span>
      </div>

      {/* task list */}
      {loading ? (
        <p className="status-text">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p className="status-text">No tasks yet</p>
      ) : (
        <ul className="task-list">
          {tasks
            .filter((t) => t.completed === showCompleted)
            .map((task) => {
              const isOverdue = task.dueDate.toDate() < new Date() && !task.completed;
              return (
                <li
                  key={task.id}
                  className={`task-item ${task.completed ? "completed" : ""}`}
                  style={{ alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedForSync[task.id]}
                    onChange={() => toggleSelectForSync(task.id)}
                    style={{ marginRight: 8 }}
                    title="Select for sync"
                  />
                  <div
                    className="task-info"
                    style={{
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <strong>{task.title}</strong>
                    <span className="task-metadata">
                      {" "}
                      - {task.category}
                      {task.className && ` (${task.className})`}
                      <span
                        style={{ marginLeft: 12 }}
                        className={`task-due-date ${isOverdue ? "overdue" : ""}`}
                      >
                        📅 {task.dueDate.toDate().toLocaleDateString("en-US")}
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
                      ...
                    </button>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      {/* popup dialog */}
      {dialogOpen && (
        <div className="task-dialog-overlay" onClick={closeDialog}>
          <div className="task-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>Edit details</h4>

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
              placeholder="Reference link (https://...)"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
            />

            {/* timer block */}
            <div className="timer-section">
              <div className="timer-display">
                Current Time:&nbsp;
                {new Date(elapsedMs).toISOString().substr(11, 8)}
              </div>
              {activeTask?.timeSpent !== undefined && (
                <div className="total-time">
                  Total Time: {fmtHMS(activeTask.timeSpent || 0)}
                </div>
              )}
              <button
                type="button"
                onClick={timerRunning ? stopTimer : startTimer}
                className={`button-secondary ${
                  timerRunning ? "stop-btn" : "start-btn"
                }`}
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
                onChange={(e) => setManualMinutes(e.target.value)}
              />
              <div className="manual-buttons">
                <button
                  className="button-secondary"
                  onClick={async () => {
                    if (!activeTask || isNaN(Number(manualMinutes))) return;
                    const secs = Math.round(Number(manualMinutes) * 60);
                    const newTime = Math.max(
                      0,
                      (activeTask.timeSpent || 0) + secs
                    );
                    await updateDoc(doc(db, "tasks", activeTask.id), {
                      timeSpent: newTime,
                    });
                    setActiveTask({ ...activeTask, timeSpent: newTime });
                    setManualMinutes("");
                  }}
                >
                  Add/Subtract
                </button>
                <button
                  className="button-secondary"
                  onClick={async () => {
                    if (!activeTask || isNaN(Number(manualMinutes))) return;
                    const secs = Math.max(0, Math.round(Number(manualMinutes) * 60));
                    await updateDoc(doc(db, "tasks", activeTask.id), {
                      timeSpent: secs,
                    });
                    setActiveTask({ ...activeTask, timeSpent: secs });
                    setManualMinutes("");
                  }}
                >
                  Set Time
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
