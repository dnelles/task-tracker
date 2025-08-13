import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY || '';
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw; // supports both newline styles
}

export function initAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      }),
    });
  }
}

export function getServices() {
  initAdmin();
  return { auth: getAuth(), db: getFirestore() };
}

export async function requireUser(req) {
  try {
    const authz = req.headers.authorization || '';
    const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!idToken) return null;
    const { auth } = getServices();
    const decoded = await auth.verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}