import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import "./Settings.css";

export default function SettingsPage({ user }) {
  const [displayName, setDisplayName] = useState("");
  const [defaultCategory, setDefaultCategory] = useState("School");
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isEditingClasses, setIsEditingClasses] = useState(false);
  const [classInputs, setClassInputs] = useState([]);

  useEffect(() => {
    const fetchSettings = async () => {
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDisplayName(data.displayName || "");
        setDefaultCategory(data.defaultCategory || "School");
        setClasses(data.classes || []);
      }
      setLoading(false);
    };
    fetchSettings();
  }, [user.uid]);

  const openClassEditor = () => {
    setClassInputs(classes.length ? [...classes] : [""]);
    setIsEditingClasses(true);
  };

  const addClassInput = () => {
    setClassInputs((prev) => [...prev, ""]);
  };

  const removeClassInput = (index) => {
    setClassInputs((prev) => prev.filter((_, i) => i !== index));
  };

  const updateClassInput = (index, value) => {
    setClassInputs((prev) =>
      prev.map((val, i) => (i === index ? value : val))
    );
  };

  const saveClassesFromPopup = () => {
    const filtered = classInputs
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    setClasses(filtered);
    setIsEditingClasses(false);
  };

  const saveSettings = async () => {
    const docRef = doc(db, "users", user.uid);
    await setDoc(
      docRef,
      {
        displayName,
        defaultCategory,
        classes,
      },
      { merge: true }
    );
    alert("Settings saved!");
  };

  if (loading) return <p>Loading settings...</p>;

  return (
    <div className="settings-container">
      <h2>Settings</h2>

      <label htmlFor="displayName">Display Name:</label>
      <input
        id="displayName"
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="settings-input"
      />

      <label htmlFor="defaultCategory">Default Category:</label>
      <select
        id="defaultCategory"
        value={defaultCategory}
        onChange={(e) => setDefaultCategory(e.target.value)}
        className="settings-select"
      >
        <option value="School">School</option>
        <option value="Personal">Personal</option>
      </select>

    <label>Classes:</label>
      <button
        onClick={openClassEditor}
        className="edit-classes-button"
        style={{ marginTop: -4 }}
        type="button"
      >
        Edit Classes
      </button>

      <button
        onClick={saveSettings}
        className="settings-save-button"
        style={{ marginTop: 24 }}
      >
        Save Changes
      </button>

      {isEditingClasses && (
        <div className="time-log-popup-overlay">
          <div className="time-log-popup" style={{ maxWidth: 400 }}>
            <h4>Edit Classes</h4>

            {classInputs.map((cls, i) => (
              <div key={i} className="class-input-row">
                <input
                  type="text"
                  value={cls}
                  onChange={(e) => updateClassInput(i, e.target.value)}
                  className="settings-input class-input-field outlined-input"
                  placeholder={`Class #${i + 1}`}
                />
                <button
                  onClick={() => removeClassInput(i)}
                  className="button-danger class-remove-button"
                  title="Remove class"
                  type="button"
                >
                  −
                </button>
              </div>
            ))}

            <button
              onClick={addClassInput}
              className="button-secondary add-class-button"
              type="button"
            >
              + Add Class
            </button>

            <div className="popup-buttons-row">
                <button
                    onClick={() => setIsEditingClasses(false)}
                    className="settings-cancel-button popup-button-equal"
                    type="button"
                >
                    Cancel
                </button>
                <button
                    onClick={saveClassesFromPopup}
                    className="settings-save-button popup-button-equal"
                    type="button"
                >
                    Save
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
