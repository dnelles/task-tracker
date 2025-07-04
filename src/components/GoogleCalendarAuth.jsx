import React, { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";

export default function GoogleCalendarAuth({ onToken }) {
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("google_access_token");
    if (token) {
      setAccessToken(token);
      onToken(token);
    }
  }, [onToken]);

  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setAccessToken(tokenResponse.access_token);
      localStorage.setItem("google_access_token", tokenResponse.access_token);
      onToken(tokenResponse.access_token);
    },
    onError: () => alert("Google login failed"),
    scope: "https://www.googleapis.com/auth/calendar.events",
  });

  const logout = () => {
    setAccessToken(null);
    localStorage.removeItem("google_access_token");
    onToken(null);
  };

  if (accessToken) {
    return (
      <p
        onClick={logout}
        style={{ 
          cursor: "pointer", 
          color: "#00b5ad",
          userSelect: "none",
          textDecoration: "underline"
        }}
        title="Click to disconnect Google Calendar"
      >
        Google Calendar connected ✅
      </p>
    );
  }

  return (
    <button onClick={() => login()}>
      Connect Google Calendar
    </button>
  );
}
