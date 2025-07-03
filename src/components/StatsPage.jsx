import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import "./StatsPage.css";

export default function StatsPage({ user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTasks() {
      if (!user?.uid) return;

      const q = query(
        collection(db, "tasks"),
        where("userId", "==", user.uid)
      );

      const snapshot = await getDocs(q);
      const taskData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(taskData);
      setLoading(false);
    }

    fetchTasks();
  }, [user]);

  if (!user) return <p>Please log in to view your stats.</p>;
  if (loading) return <p>Loading stats...</p>;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const totalTimeSpent = tasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);

  // Category breakdown
  const categoryBreakdown = {};
  for (let task of tasks) {
    const key = task.category || "Uncategorized";
    categoryBreakdown[key] = (categoryBreakdown[key] || 0) + 1;
  }

  // Class time breakdown
  const classTimeMap = {};
  for (let task of tasks) {
    if (task.className && task.timeSpent) {
      classTimeMap[task.className] = (classTimeMap[task.className] || 0) + task.timeSpent;
    }
  }

  return (
    <div className="stats-container">
      <h2>📊 Task Stats</h2>

      <ul className="stats-list">
        <li><strong>Total Tasks:</strong> {totalTasks}</li>
        <li><strong>Completed Tasks:</strong> {completedTasks}</li>
        <li><strong>Total Time Spent:</strong> {formatHMS(totalTimeSpent)}</li>
      </ul>

      <h3>📁 Tasks by Category</h3>
      <ul>
        {Object.entries(categoryBreakdown).map(([cat, count]) => (
          <li key={cat}>{cat}: {count}</li>
        ))}
      </ul>

      <h3>⏱ Time Breakdown by Class</h3>
      {Object.keys(classTimeMap).length === 0 ? (
        <p>No class time data available yet.</p>
      ) : (
        <ul>
          {Object.entries(classTimeMap).map(([className, time]) => {
            const percent = ((time / totalTimeSpent) * 100).toFixed(1);
            return (
              <li key={className}>
                {className}: {formatHMS(time)} ({percent}%)
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatHMS(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}