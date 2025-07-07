import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import "./StatsPage.css";

export default function StatsPage({ user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const q = query(collection(db, "tasks"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr = [];
      snapshot.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      setTasks(arr);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Always call hooks first (useMemo here)
  const stats = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.completed).length;
    const pendingTasks = totalTasks - completedTasks;
    const totalTimeSpent = tasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);
    const avgTimePerTask = totalTasks ? totalTimeSpent / totalTasks : 0;

    const categoryBreakdown = tasks.reduce((acc, t) => {
      const cat = t.category || "Uncategorized";
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    const classTimeMap = tasks.reduce((acc, t) => {
      if (t.className && t.timeSpent) {
        acc[t.className] = (acc[t.className] || 0) + t.timeSpent;
      }
      return acc;
    }, {});

    const now = new Date();
    const overdueTasks = tasks.filter(
      (t) => !t.completed && t.dueDate?.toDate() < now
    ).length;

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      totalTimeSpent,
      avgTimePerTask,
      categoryBreakdown,
      classTimeMap,
      overdueTasks,
    };
  }, [tasks]);

  if (!user) return <p>Please log in to view your stats.</p>;
  if (loading) return <p>Loading stats...</p>;

  return (
    <div className="stats-container">
      <h2>📊 Task Stats</h2>

      <ul className="stats-list">
        <li><strong>Total Tasks:</strong> {stats.totalTasks}</li>
        <li><strong>Completed Tasks:</strong> {stats.completedTasks}</li>
        <li><strong>Pending Tasks:</strong> {stats.pendingTasks}</li>
        <li><strong>Overdue Tasks:</strong> {stats.overdueTasks}</li>
        <li><strong>Total Time Spent:</strong> {formatHMS(stats.totalTimeSpent)}</li>
        <li><strong>Average Time per Task:</strong> {formatMinutes(stats.avgTimePerTask)}</li>
      </ul>

      <h3>📁 Tasks by Category</h3>
      <ul>
        {Object.entries(stats.categoryBreakdown).map(([cat, count]) => (
          <li key={cat}>{cat}: {count}</li>
        ))}
      </ul>

      <h3>⏱ Time Breakdown by Class</h3>
      {Object.keys(stats.classTimeMap).length === 0 ? (
        <p>No class time data available yet.</p>
      ) : (
        <ul>
          {Object.entries(stats.classTimeMap).map(([className, time]) => {
            const percent = ((time / stats.totalTimeSpent) * 100).toFixed(1);
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

// format seconds as HHh MMm SSs
function formatHMS(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}

// format seconds as MM.m (minutes decimal)
function formatMinutes(seconds) {
  return `${(seconds / 60).toFixed(1)} min`;
}
