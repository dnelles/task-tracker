import React, { useEffect, useState, useMemo } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "../firebase";
import "./ActivityLog.css";
import { format } from "date-fns";

export default function ActivityLog({ user }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const userRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const activityLog = data.activityLog || [];
        setActivities(activityLog);
      } else {
        setActivities([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredActivities = useMemo(() => {
    let tempActivities = activities;

    if (startDateFilter || endDateFilter) {
      const startOfDay = startDateFilter ? new Date(startDateFilter).setHours(0, 0, 0, 0) : -Infinity;
      const endOfDay = endDateFilter ? new Date(endDateFilter).setHours(23, 59, 59, 999) : Infinity;

      tempActivities = tempActivities.filter(activity => {
        const activityDate = new Date(activity.timestamp).getTime();
        return activityDate >= startOfDay && activityDate <= endOfDay;
      });
    }
    
    // Sort the log entries by timestamp in descending order
    tempActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return tempActivities;
  }, [activities, startDateFilter, endDateFilter]);

  const handleClearFilters = () => {
    setStartDateFilter("");
    setEndDateFilter("");
  };

  if (!user) {
    return <p>Please log in to view activity log.</p>;
  }

  if (loading) {
    return <p>Loading activity log...</p>;
  }

  return (
    <div className="activity-log-container">
      <h2>Log</h2>
      <div className="stats-filters">
        <div className="filter-group">
          <label htmlFor="startDate">Start Date:</label>
          <input
            id="startDate"
            type="date"
            value={startDateFilter}
            onChange={(e) => setStartDateFilter(e.target.value)}
            className="filter-input"
          />
        </div>
        <div className="filter-group">
          <label htmlFor="endDate">End Date:</label>
          <input
            id="endDate"
            type="date"
            value={endDateFilter}
            onChange={(e) => setEndDateFilter(e.target.value)}
            className="filter-input"
          />
        </div>
        <button onClick={handleClearFilters} className="clear-button">
          Clear Filters
        </button>
      </div>
      {filteredActivities.length === 0 ? (
        <p className="status-text">No activity yet.</p>
      ) : (
        <ul className="activity-list">
          {filteredActivities.map((activity, index) => (
            <li key={index} className="activity-item">
              <span className="activity-date">
                {format(new Date(activity.timestamp), "M/d/yy h:mma")}
              </span>
              <span className="activity-message">{activity.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}