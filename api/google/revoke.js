import { getServices, requireUser } from '../_lib/admin.js';

export default async function handler(req, res) {
  const uid = await requireUser(req);
  if (!uid) return void res.status(401).send('Unauthorized');

  const { db } = getServices();
  const ref = db.collection('googleTokens').doc(uid);
  const snap = await ref.get();
  if (snap.exists) {
    const { refreshToken } = snap.data();
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch { /* ignore */ }
    await ref.delete();
  }
  res.json({ ok: true });
}
