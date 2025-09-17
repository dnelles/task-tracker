import { getServices, requireUser } from './_lib/admin.js';
import { setDoc, doc, arrayUnion, serverTimestamp } from 'firebase/firestore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return void res.status(405).send('Method Not Allowed');
  }

  const uid = await requireUser(req);
  if (!uid) {
    return void res.status(401).send('Unauthorized');
  }

  const { message } = req.body;
  if (!message) {
    return void res.status(400).send('Missing message');
  }

  const { db } = getServices();
  const userRef = db.collection('users').doc(uid);

  try {
    // Get the current user document
    const userDoc = await userRef.get();
    let activityLog = [];

    if (userDoc.exists) {
      activityLog = userDoc.data().activityLog || [];
    }

    // Append the new log entry
    activityLog.push({
      message,
      timestamp: new Date().toISOString(),
    });

    // Write the full array back to the document
    await userRef.set({ activityLog }, { merge: true });

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error("Error logging activity on server:", error);
    res.status(500).json({ status: 'error', error: error.message });
  }
}