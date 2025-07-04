// src/components/AuthForm.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export default function AuthForm({ onUserLoggedIn }) {
  /* ── local state ─────────────────────────── */
  const [isLogin, setIsLogin]       = useState(true);   // toggle login / signup
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [firstName, setFirstName]   = useState("");
  const [lastName,  setLastName]    = useState("");
  const [error, setError]           = useState("");

  /* ── submit handler ──────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (isLogin) {
        /* ----------  LOGIN ---------- */
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        /* ---------- SIGN‑UP ---------- */
        // 1) Firebase Auth account
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const user = cred.user;

        // 2) Optional: set displayName in Auth profile
        await updateProfile(user, { displayName: `${firstName} ${lastName}` });

        // 3) Store extra profile data in Firestore
        await setDoc(doc(db, "users", user.uid), {
          firstName: firstName.trim(),
          lastName : lastName.trim(),
          email    : user.email,
          createdAt: serverTimestamp(),
        });
      }

      /* success → bubble up */
      onUserLoggedIn?.();
    } catch (err) {
      console.error("Auth error:", err);
      setError(err.message);
    }
  };

  /* ── JSX ─────────────────────────────────── */
  return (
    <div className="auth-form">
      <form onSubmit={handleSubmit}>
        <h2 style={{ marginBottom: 16 }}>
          {isLogin ? "Log In" : "Create Account"}
        </h2>

        {!isLogin && (
          <>
            <input
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="input-text"
            />
            <input
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="input-text"
            />
          </>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="input-text"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="input-text"
        />

        <button type="submit" className="button-primary" style={{ marginTop: 6 }}>
          {isLogin ? "Log In" : "Sign Up"}
        </button>

        {error && (
          <p style={{ color: "red", marginTop: 8 }}>
            {error}
          </p>
        )}

        <p style={{ marginTop: 14, fontSize: "0.9rem" }}>
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setIsLogin(!isLogin);
            }}
            className="button-tertiary"
            style={{ padding: 0 }}
          >
            {isLogin ? "Sign Up" : "Log In"}
          </button>
        </p>
      </form>
    </div>
  );
}
