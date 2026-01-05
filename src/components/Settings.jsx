import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp, serverTimestamp, writeBatch } from "firebase/firestore";
import Papa from "papaparse";
import { db } from "../firebase";
import "./Settings.css";

export default function SettingsPage({ user }) {
  if (!user?.uid) return <p>Please log in to view settings.</p>;

  const [displayName, setDisplayName] = useState("");
  const [defaultCategory, setDefaultCategory] = useState("School");
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Classes popup
  const [isEditingClasses, setIsEditingClasses] = useState(false);
  const [classInputs, setClassInputs] = useState([]);

  // Import/Export UI state
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [importPreview, setImportPreview] = useState([]); // normalized tasks
  const [importErrors, setImportErrors] = useState([]); // { rowNumber, message, row }
  const [isImporting, setIsImporting] = useState(false);

  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef(null);

  /* ─────────────────────────────── Load Settings ─────────────────────────────── */
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDisplayName(data.displayName || "");
          setDefaultCategory(data.defaultCategory || "School");
          setClasses(Array.isArray(data.classes) ? data.classes : []);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user.uid]);

  /* ─────────────────────────────── Classes Popup ─────────────────────────────── */
  const openClassEditor = () => {
    setClassInputs(classes.length ? [...classes] : [""]);
    setIsEditingClasses(true);
  };

  const addClassInput = () => setClassInputs((prev) => [...prev, ""]);

  const removeClassInput = (index) =>
    setClassInputs((prev) => prev.filter((_, i) => i !== index));

  const updateClassInput = (index, value) =>
    setClassInputs((prev) => prev.map((val, i) => (i === index ? value : val)));

  const saveClassesFromPopup = () => {
    const filtered = classInputs.map((c) => c.trim()).filter((c) => c.length > 0);
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

  /* ─────────────────────────────── CSV Helpers ─────────────────────────────── */
  const normalizeCategory = (raw) => {
    const val = String(raw || "").trim().toLowerCase();
    if (val === "personal") return "Personal";
    if (val === "school") return "School";
    return "School";
  };

  const parseDateYYYYMMDD = (raw) => {
    // Expect YYYY-MM-DD
    const s = String(raw || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d); // local midnight
    if (Number.isNaN(dt.getTime())) return null;
    // sanity check: ensure it round-trips
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  };

  const clampProgress = (raw) => {
    if (raw === undefined || raw === null || raw === "") return 0;
    const n = Number(raw);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  };

  const safeStr = (v) => String(v ?? "").trim();

  const resetImportState = () => {
    setImportPreview([]);
    setImportErrors([]);
    setIsImporting(false);
    // reset file input so selecting the same file again triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ─────────────────────────────── Export CSV ─────────────────────────────── */
  const handleExportCsv = async () => {
  setIsExporting(true);
  try {
    const q = query(collection(db, "tasks"), where("userId", "==", user.uid));
    const snap = await getDocs(q);

    const rows = [];
    snap.forEach((d) => {
      const t = d.data() || {}; // <-- t MUST be declared before use

      const due = t.dueDate?.toDate?.();
      const dueStr = due
        ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(
            due.getDate()
          ).padStart(2, "0")}`
        : "";

      const timeSpentSeconds = typeof t.timeSpent === "number" ? t.timeSpent : 0;
      const timeSpentMinutes = Math.round(timeSpentSeconds / 60);
      const h = Math.floor(timeSpentSeconds / 3600);
      const m = Math.floor((timeSpentSeconds % 3600) / 60);
      const s = timeSpentSeconds % 60;
      const timeSpentHMS = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

      rows.push({
        title: safeStr(t.title),
        dueDate: dueStr,
        category: safeStr(t.category || "School"),
        className: safeStr(t.className),
        notes: safeStr(t.notes),
        link: safeStr(t.link),
        completed: !!t.completed,

        timeSpentSeconds,
        timeSpentMinutes,
        timeSpentHMS,
      });
    });

    rows.sort(
      (a, b) =>
        (a.dueDate || "").localeCompare(b.dueDate || "") ||
        (a.title || "").localeCompare(b.title || "")
    );

    const csv = Papa.unparse(rows, { quotes: false });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const now = new Date();
    const filename = `tasks_export_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}.csv`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Export failed:", err);
    alert("Export failed. Check console for details.");
  } finally {
    setIsExporting(false);
  }
};

  /* ─────────────────────────────── Import CSV ─────────────────────────────── */
  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetImportState();

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => String(h || "").trim(),
      complete: (results) => {
        const data = Array.isArray(results.data) ? results.data : [];
        const errors = [];

        const normalized = data
          .map((row, idx) => {
            const rowNumber = idx + 2; // header row is 1

            const title = safeStr(row.title);
            const dueDateObj = parseDateYYYYMMDD(row.dueDate);
            const category = normalizeCategory(row.category);
            const className = safeStr(row.className);
            const notes = safeStr(row.notes);
            const link = safeStr(row.link);

            if (!title) {
              errors.push({ rowNumber, message: "Missing title", row });
              return null;
            }
            if (!dueDateObj) {
              errors.push({
                rowNumber,
                message: "Invalid or missing dueDate (expected YYYY-MM-DD)",
                row,
              });
              return null;
            }

            return {
              title,
              category,
              className: category === "School" ? className : "",
              notes,
              link,
              dueDateObj,
            };
          })
          .filter(Boolean);

        // Also surface PapaParse structural errors
        if (Array.isArray(results.errors) && results.errors.length) {
          results.errors.forEach((pe) => {
            errors.push({
              rowNumber: (pe.row ?? 0) + 1,
              message: `CSV parse error: ${pe.message}`,
              row: {},
            });
          });
        }

        setImportPreview(normalized);
        setImportErrors(errors);
      },
      error: (err) => {
        console.error("Parse error:", err);
        alert("Failed to parse CSV. Check console for details.");
      },
    });
  };

  const handleConfirmImport = async () => {
    if (isImporting) return;
    if (importErrors.length > 0) return alert("Fix errors before importing.");
    if (importPreview.length === 0) return alert("No valid tasks to import.");

    setIsImporting(true);
    try {
      const batch = writeBatch(db);
      const tasksCol = collection(db, "tasks");

      importPreview.forEach((t) => {
        const dueTs = Timestamp.fromDate(t.dueDateObj);

        const newTaskRef = doc(tasksCol); // auto-id
        batch.set(newTaskRef, {
          title: t.title,
          category: t.category,
          dueDate: dueTs,
          startDate: serverTimestamp(),
          completed: false,
          completedAt: null,
          timeSpent: 0,
          className: t.category === "School" ? t.className : "",
          notes: t.notes || "",
          link: t.link || "",
          userId: user.uid,
          timeLogs: [],
          progress: 0,
        });
      });

      await batch.commit();

      alert(`Imported ${importPreview.length} task(s) successfully!`);
      setShowImportPopup(false);
      resetImportState();
    } catch (err) {
      console.error("Import failed:", err);
      alert("Import failed. Check console for details.");
    } finally {
      setIsImporting(false);
    }
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

      {/* ───────────────────────── Import / Export Tasks ───────────────────────── */}
      <hr style={{ margin: "28px 0", opacity: 0.25 }} />

      <h3 style={{ marginTop: 0 }}>Import / Export Tasks</h3>
      <p style={{ opacity: 0.85, lineHeight: 1.4 }}>
        Use this when you want to upload or download many tasks at once.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            resetImportState();
            setShowImportPopup(true);
          }}
        >
          Import from CSV
        </button>

        <button
          type="button"
          className="button-secondary"
          onClick={handleExportCsv}
          disabled={isExporting}
        >
          {isExporting ? "Exporting…" : "Export to CSV"}
        </button>
      </div>

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />

      {/* ───────────────────────────── Classes Popup ───────────────────────────── */}
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

      {/* ───────────────────────────── Import Popup ───────────────────────────── */}
      {showImportPopup && (
        <div className="time-log-popup-overlay">
          <div className="time-log-popup" style={{ maxWidth: 700, width: "92vw" }}>
            <h4>Import Tasks from CSV</h4>

            <p style={{ opacity: 0.9, lineHeight: 1.4 }}>
              Upload a CSV with headers:
              <code style={{ marginLeft: 8 }}>
                title, dueDate, category, className, notes, link
              </code>
            </p>

            <div className="import-actions-row">
              <button
                type="button"
                className="button-secondary import-action"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose CSV File
              </button>

              <button
                type="button"
                className="button-secondary import-action"
                onClick={() => {
                  setShowImportPopup(false);
                  resetImportState();
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 16 }}>
              {importErrors.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong style={{ color: "#ff6b6b" }}>
                    {importErrors.length} row(s) need fixes before importing
                  </strong>
                  <div style={{ marginTop: 8, maxHeight: 160, overflowY: "auto", fontSize: 13 }}>
                    {importErrors.slice(0, 25).map((er, idx) => (
                      <div key={idx} style={{ marginBottom: 6 }}>
                        <span style={{ opacity: 0.95 }}>
                          Row {er.rowNumber}: {er.message}
                        </span>
                      </div>
                    ))}
                    {importErrors.length > 25 && (
                      <div style={{ opacity: 0.8, marginTop: 8 }}>
                        Showing first 25 errors…
                      </div>
                    )}
                  </div>
                </div>
              )}

              {importPreview.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong style={{ color: "#7bed9f" }}>
                    {importPreview.length} task(s) ready to import
                  </strong>

                  <div
                    style={{
                      marginTop: 10,
                      maxHeight: 220,
                      overflowY: "auto",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    {importPreview.slice(0, 25).map((t, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: "8px 6px",
                          borderBottom: idx === Math.min(importPreview.length, 25) - 1 ? "none" : "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{t.title}</div>
                        <div style={{ fontSize: 13, opacity: 0.85 }}>
                          Due:{" "}
                          {`${t.dueDateObj.getFullYear()}-${String(t.dueDateObj.getMonth() + 1).padStart(2, "0")}-${String(
                            t.dueDateObj.getDate()
                          ).padStart(2, "0")}`}
                          {" • "}
                          {t.category}
                          {t.className ? ` (${t.className})` : ""}
                          {" • "}
                          Progress: {t.progress}%
                        </div>
                      </div>
                    ))}
                    {importPreview.length > 25 && (
                      <div style={{ opacity: 0.8, marginTop: 8 }}>
                        Showing first 25 tasks…
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                className="settings-save-button"
                disabled={isImporting || importPreview.length === 0 || importErrors.length > 0}
                onClick={handleConfirmImport}
                style={{ width: "100%", marginTop: 8 }}
              >
                {isImporting ? "Importing…" : "Import Tasks"}
              </button>

              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>
                Tip: dueDate must be <strong>YYYY-MM-DD</strong>. Category should be <strong>School</strong> or{" "}
                <strong>Personal</strong>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}