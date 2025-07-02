// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Replace these values with your own from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyA1nkqg-q9fIblX60NO_9OCAQMYnV18iCs",
  authDomain: "tasktracker-88ce9.firebaseapp.com",
  projectId: "tasktracker-88ce9",
  storageBucket: "tasktracker-88ce9.firebasestorage.app",
  messagingSenderId: "922122860378",
  appId: "1:922122860378:web:64891c2b175f6fd256e563"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
