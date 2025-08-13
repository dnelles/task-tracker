import { getServices, requireUser } from '../_lib/admin.js';

export default async function handler(req, res) {
  const uid = await requireUser(req);
  if (!uid) return void res.status(401).send('Unauthorized');

  const { db } = getServices();
  const doc = await db.collection('googleTokens').doc(uid).get();
  res.json({ connected: doc.exists });
}
