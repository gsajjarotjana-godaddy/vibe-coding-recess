import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
] as const;

function readConfig(): Record<string, string> {
  const c: Record<string, string> = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  };
  if (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET)
    c.storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID)
    c.messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  if (import.meta.env.VITE_FIREBASE_APP_ID) c.appId = import.meta.env.VITE_FIREBASE_APP_ID;
  return c;
}

export function isFirebaseConfigured(): boolean {
  for (const k of required) {
    const v = (import.meta.env as Record<string, string | undefined>)[k];
    if (!v) return false;
  }
  return true;
}

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function getFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Add VITE_FIREBASE_* env vars.");
  }
  if (_app) return { app: _app, auth: _auth!, db: _db! };
  const config = readConfig();
  _app = initializeApp(config);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  return { app: _app, auth: _auth, db: _db };
}
