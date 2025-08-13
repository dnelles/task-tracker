import { getServices, requireUser } from '../_lib/admin.js';

export default async function handler(req, res) {
  const uid = await requireUser(req);
  if (!uid) return void res.status(401).send('Unauthorized');

  const { db } = getServices();
  const snap = await db.collection('googleTokens').doc(uid).get();
  if (!snap.exists) return void res.status(404).send('Not connected');

  const { refreshToken } = snap.data();

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await resp.json();
  if (!resp.ok) return void res.status(500).send(data.error || 'Refresh failed');

  res.json({ access_token: data.access_token, expires_in: data.expires_in });
}
