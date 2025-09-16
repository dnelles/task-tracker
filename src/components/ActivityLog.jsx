import React, { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import "./ActivityLog.css";
import { format } from "date-fns";

export default function ActivityLog({ user }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const q = query(
      collection(db, "activityLog"),
      where("userId", "==", user.uid),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr = [];
      snapshot.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      setActivities(arr);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (!user) {
    return <p>Please log in to view activity log.</p>;
  }

  if (loading) {
    return <p>Loading activity log...</p>;
  }

  return (
    <div className="activity-log-container">
      <h2>Activity Log</h2>
      {activities.length === 0 ? (
        <p className="status-text">No activity yet.</p>
      ) : (
        <ul className="activity-list">
          {activities.map((activity) => (
            <li key={activity.id} className="activity-item">
              <span className="activity-date">
                {format(activity.timestamp.toDate(), "M/d/yy h:mma")}
              </span>
              <span className="activity-message">{activity.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}