import React, { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import {
  addDays,
  addWeeks,
  isSameWeek,
  format,
  startOfWeek,
  isWithinInterval,
  differenceInCalendarDays,
} from "date-fns";

export default function GanttPage({ user }) {
  const [tasks, setTasks] = useState([]);
  const [groupedTasks, setGroupedTasks] = useState({});
  const [weeks, setWeeks] = useState([]);
  const [startDate, setStartDate] = useState(new Date());
  const [hoveredTaskId, setHoveredTaskId] = useState(null);
  const today = new Date();

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "tasks"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          const now = new Date();

          let start = data.startDate?.toDate?.() || data.createdAt?.toDate?.() || new Date(data.startDate || data.createdAt || now);
          let end = data.dueDate?.toDate?.() || new Date(data.dueDate || now);

          return {
            id: doc.id,
            title: data.title || "Untitled",
            className: data.className || (data.category === "Personal" ? "Personal" : "No Class"),
            startDate: start,
            dueDate: end,
            progress: data.progress ?? 0,
            notes: data.notes || "",
            timeTracked: data.timeSpent || 0,
            completed: data.completed || false
          };
        })
        .filter((task) => !task.completed);

      setTasks(fetchedTasks);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const base = startOfWeek(startDate, { weekStartsOn: 0 });
    const newWeeks = Array.from({ length: 12 }, (_, i) => addWeeks(base, i));
    setWeeks(newWeeks);
  }, [startDate]);

  useEffect(() => {
    const grouped = tasks.reduce((acc, task) => {
      (acc[task.className] ||= []).push(task);
      return acc;
    }, {});
    setGroupedTasks(grouped);
  }, [tasks]);

  const getBarPosition = (task) => {
    const weekWidth = 80;
    const baseOffset = 180;

    const firstIdx = weeks.findIndex((w) => isWithinInterval(task.startDate, { start: w, end: addDays(w, 6) }));
    const lastIdx = weeks.findIndex((w) => isWithinInterval(task.dueDate, { start: w, end: addDays(w, 6) }));
    const validFirst = firstIdx !== -1 ? firstIdx : 0;
    const validLast = lastIdx !== -1 ? lastIdx : weeks.length - 1;
    const fullSpan = validLast - validFirst;
    const daysIntoWeek = Math.min(differenceInCalendarDays(addDays(task.dueDate, 1), weeks[validLast]) + 1, 7);
    const partialRatio = Math.max(0.15, daysIntoWeek / 7);
    const widthPx = fullSpan * weekWidth + partialRatio * weekWidth;
    const leftPx = baseOffset + validFirst * weekWidth;

    return { leftPx, widthPx };
  };

  const getProgressColor = (progress) => {
    if (progress >= 90) return "#00b894";
    if (progress >= 60) return "#0984e3";
    if (progress >= 30) return "#fdcb6e";
    return "#d63031";
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getMonthGroups = () => {
    if (!weeks.length) return [];
    const result = [];
    let current = format(weeks[0], "MMMM"), span = 0;
    for (const w of weeks) {
      const m = format(w, "MMMM");
      if (m === current) span++;
      else result.push({ label: current, span }), current = m, span = 1;
    }
    if (span) result.push({ label: current, span });
    return result;
  };

  if (!user || !weeks.length) return <p>Loading timeline…</p>;

  return (
    <div style={{ padding: "1rem", color: "#fff", position: "relative" }}>
      <h2 style={{ marginBottom: "1rem" }}>Assignment Timeline</h2>
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <input
          type="date"
          value={format(startDate, "yyyy-MM-dd")}
          onChange={(e) => setStartDate(new Date(e.target.value))}
          style={{ backgroundColor: "#1e1e1e", color: "#fff", border: "1px solid #00b5ad", borderRadius: "6px", padding: "6px 10px", fontSize: "0.95rem" }}
        />
      </div>
      <div style={{ overflowX: "auto", background: "#2a2a2a", borderRadius: "12px", padding: "1rem", boxShadow: "0 0 25px rgba(0, 181, 173, 0.35)" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead>
            <tr>
              <th style={{ minWidth: "180px", backgroundColor: "#1a1a1a", color: "#fff", border: "1px solid #444" }} />
              {getMonthGroups().map((group, idx) => (
                <th key={idx} colSpan={group.span} style={{ textAlign: "center", backgroundColor: "#1a1a1a", color: "#00b5ad", fontWeight: "bold", border: "1px solid #444" }}>{group.label}</th>
              ))}
            </tr>
            <tr>
              <th style={{ minWidth: "180px", backgroundColor: "#111", color: "#fff", textAlign: "left", position: "sticky", left: 0, zIndex: 2, padding: "6px 8px" }}>Class / Assignment</th>
              {weeks.map((w, i) => (
                <th key={i} style={{ minWidth: "80px", textAlign: "center", backgroundColor: isSameWeek(today, w, { weekStartsOn: 0 }) ? "#f1c40f" : "#333", color: isSameWeek(today, w, { weekStartsOn: 0 }) ? "#000" : "#ccc", border: "1px solid #444", fontSize: "0.85rem" }}>{format(w, "MMM d")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedTasks).map(([className, assignments]) => (
              <React.Fragment key={className}>
                <tr><td colSpan={weeks.length + 1} style={{ backgroundColor: "#222", color: "#00b5ad", fontWeight: "bold", padding: "6px 8px", fontSize: "1rem", borderTop: "2px solid #555", alignItems: "left" }}>{className}</td></tr>
                {assignments.map((task) => {
                  const { leftPx, widthPx } = getBarPosition(task);
                  return (
                    <React.Fragment key={task.id}>
                      <tr>
                        <td style={{ backgroundColor: "#1e1e1e", color: "#eee", position: "sticky", left: 0, zIndex: 1, textAlign: "left", padding: "4px 8px", borderRight: "1px solid #444" }}>{task.title}</td>
                        {weeks.map((_, i) => (
                          <td key={i} style={{ border: "1px solid #444", height: "28px", padding: 0, backgroundColor: "#1e1e1e" }} />
                        ))}
                      </tr>
                      <tr>
                        <td colSpan={weeks.length + 1} style={{ padding: 0, height: 0 }}>
                          <div style={{ position: "relative", height: 0 }}>
                            <div
                              onMouseEnter={() => setHoveredTaskId(task.id)}
                              onMouseLeave={() => setHoveredTaskId(null)}
                              style={{
                                position: "absolute",
                                top: -24,
                                left: `${leftPx}px`,
                                width: `${widthPx}px`,
                                height: "20px",
                                backgroundColor: getProgressColor(task.progress ?? 0),
                                borderRadius: "4px",
                                zIndex: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontSize: "12px",
                                fontWeight: "bold",
                                overflow: "visible",
                                whiteSpace: "nowrap",
                                cursor: "pointer",
                              }}
                            >
                              {task.progress ?? 0}%
                              {hoveredTaskId === task.id && (
                                <div style={{
                                  position: "absolute",
                                  bottom: "125%",
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  backgroundColor: "#1e1e1e",
                                  color: "#fff",
                                  padding: "8px 12px",
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                  whiteSpace: "nowrap",
                                  boxShadow: "0 0 12px rgba(0,181,173,0.4)",
                                  zIndex: 5
                                }}>
                                  <div><strong>{task.title}</strong></div>
                                  <div>Due: {format(task.dueDate, "MMM d, yyyy")}</div>
                                  {task.notes && <div>Notes: {task.notes}</div>}
                                  <div>Tracked: {formatTime(task.timeTracked)}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
