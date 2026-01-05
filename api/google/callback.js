import { getServices } from "../_lib/admin.js";

export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host;
  const url = new URL(req.url, `${proto}://${host}`);

  const code = url.searchParams.get("code");
  const uid = url.searchParams.get("state"); // we sent the uid in /start
  if (!code || !uid) {
    res.status(400).send("Missing code or state");
    return;
  }

  const redirectUri = `${url.origin}/api/google/callback`;

  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json();
  if (!resp.ok) {
    res.status(500).send(data.error || "Token exchange failed");
    return;
  }

  if (!data.refresh_token) {
    // If the account was already connected without prompt=consent earlier
    res.redirect("/?google=needs_consent");
    return;
  }

  const { db } = getServices();
  await db.collection("googleTokens").doc(uid).set(
    {
      provider: "tasks",
      refreshToken: data.refresh_token,
      createdAt: Date.now(),
    },
    { merge: true }
  );

  res.redirect("/?google=connected");
}