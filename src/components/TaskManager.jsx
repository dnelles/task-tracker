import React, { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export default function TaskManager() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("School");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch tasks from Firestore
  const fetchTasks = async () => {
    setLoading(true);
    const querySnapshot = await getDocs(collection(db, "tasks"));
    const tasksArr = [];
    querySnapshot.forEach((doc) => {
      tasksArr.push({ id: doc.id, ...doc.data() });
    });
    setTasks(tasksArr);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Add new task
  const addTask = async () => {
    if (!title || !dueDate) return alert("Title and due date are required");

    const newTask = {
      title,
      category,
      dueDate: Timestamp.fromDate(new Date(dueDate)),
      completed: false,
      timeSpent: 0,
    };

    await addDoc(collection(db, "tasks"), newTask);

    setTitle("");
    setDueDate("");
    setCategory("School");
    fetchTasks();
  };

  // Toggle completed state
  const toggleComplete = async (id, currentState) => {
    const taskRef = doc(db, "tasks", id);
    await updateDoc(taskRef, { completed: !currentState });
    fetchTasks();
  };

  // Delete a task
  const deleteTask = async (id) => {
    const taskRef = doc(db, "tasks", id);
    await deleteDoc(taskRef);
    fetchTasks();
  };

  return (
    <div style={{ maxWidth: 500, margin: "auto", padding: 20 }}>
      <h2>Task Manager</h2>
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: "60%", marginRight: 10 }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ marginRight: 10 }}
        >
          <option value="School">School</option>
          <option value="Personal">Personal</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          style={{ marginRight: 10 }}
        />
        <button onClick={addTask}>Add Task</button>
      </div>

      {loading ? (
        <p>Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p>No tasks yet</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {tasks.map((task) => (
            <li
              key={task.id}
              style={{
                marginBottom: 10,
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 4,
                backgroundColor: task.completed ? "#d3ffd3" : "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{task.title}</strong> - {task.category} - Due:{" "}
                {task.dueDate.toDate().toLocaleDateString()}
              </div>
              <div>
                <button
                  onClick={() => toggleComplete(task.id, task.completed)}
                  style={{ marginRight: 8 }}
                >
                  {task.completed ? "Undo" : "Complete"}
                </button>
                <button onClick={() => deleteTask(task.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
