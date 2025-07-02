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
} from "firebase/firestore";
import { db } from "../firebase";

export default function TaskManager() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("School");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [className, setClassName] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null); // the task being edited
  const [notesDraft, setNotesDraft] = useState("");
  const [linkDraft,  setLinkDraft]  = useState("");

//Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState(null); // timestamp in ms
  const [elapsedMs, setElapsedMs] = useState(0); // live display while running

//Firestone listener for tasks
  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("dueDate"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const tasksArr = [];
      querySnapshot.forEach((doc) => {
        tasksArr.push({ id: doc.id, ...doc.data() });
      });
      setTasks(tasksArr);
    });
    return () => unsubscribe();
  }, []);

//Live stopwatch timer
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - timerStart);
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerStart]);

     const addTask = async () => {
     if (!title || !dueDate) return alert("Title and due date are required");

    const newTask = {
      title,
      category,
      dueDate: Timestamp.fromDate(new Date(dueDate)),
      completed: false,
      timeSpent: 0,
      className: category === "School" ? className : "",
      notes: "",
      link: ""
    };

    await addDoc(collection(db, "tasks"), newTask);

    setTitle("");
    setDueDate("");
    setCategory("School");
    setClassName("");
  };

  const toggleComplete = async (id, currentState) => {
    const taskRef = doc(db, "tasks", id);
    await updateDoc(taskRef, { completed: !currentState });
  };

  const deleteTask = async (id) => {
    const taskRef = doc(db, "tasks", id);
    await deleteDoc(taskRef);
  };

//Timer helpers
  const startTimer = () => {
    if (timerRunning) return;
    setTimerStart(Date.now());
    setElapsedMs(0);
    setTimerRunning(true);
  };
  const stopTimer = async () => {
    if (!timerRunning || !activeTask) return;
    const ms = Date.now() - timerStart;
    const secs = Math.round(ms / 1000);
    setTimerRunning(false);

    // Persist accumulated seconds atomically
    const taskRef = doc(db, "tasks", activeTask.id);
    await updateDoc(taskRef, { timeSpent: increment(secs) });

    // Reflect locally so reopening dialog shows updated total
    setActiveTask((prev) => (prev ? { ...prev, timeSpent: (prev.timeSpent || 0) + secs } : prev));
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

  //Time formatting
  const fmtHMS = (seconds) => new Date(seconds * 1000).toISOString().substr(11, 8);

  return (
    <div className="task-manager">
      <h2 className="main-heading">Task Manager</h2>

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

      {loading ? (
        <p className="status-text">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p className="status-text">No tasks yet</p>
      ) : (
        <ul className="task-list">
          {tasks
            .filter((task) => task.completed === showCompleted)
            .map((task) => (
              <li
                key={task.id}
                className={`task-item ${task.completed ? "completed" : ""}`}
              >
                <div className="task-info">
                  <strong>{task.title}</strong>{""}
                  <span className="task-metadata ">
                    {" "} - {task.category}
                    {task.className && ` (${task.className})`} - Due:{" "} 
                    {task.dueDate.toDate().toLocaleDateString("en-US", {
                        year: "2-digit",
                        month: "numeric",
                        day: "numeric",
                    })}
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
            ))}
        </ul>
      )}

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
    
    <div className="timer-section">
              <button
                type="button"
                onClick={timerRunning ? stopTimer : startTimer}
                className={`button-secondary ${timerRunning ? "stop-btn" : "start-btn"}`}
              >
                {timerRunning ? "Stop" : "Start"}
              </button>
              <div className="timer-display">Current Time: {new Date(elapsedMs).toISOString().substr(11, 8)}</div>
              {activeTask?.timeSpent !== undefined && (
                <div className="total-time">Total Time: {fmtHMS(activeTask.timeSpent || 0)}</div>
              )}
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