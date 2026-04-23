import { useEffect, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { getFirebase, isFirebaseConfigured } from "./firebase";
import { Home } from "./Home";
import { RoomView } from "./RoomView";

export function App() {
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(() => sessionStorage.getItem("vcr_room") || null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setReady(true);
      return;
    }
    const { auth } = getFirebase();
    signInAnonymously(auth)
      .then(() => {
        setReady(true);
      })
      .catch((e: Error) => {
        setAuthError(e.message || "Auth failed");
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (roomId) sessionStorage.setItem("vcr_room", roomId);
    else sessionStorage.removeItem("vcr_room");
  }, [roomId]);

  if (!ready) {
    return (
      <div className="shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!isFirebaseConfigured()) {
    return (
      <div className="shell">
        <div className="card">
          <h1>Vibe Coding Recess</h1>
          <p className="muted">
            Add Firebase config to <code>.env</code> (see <code>.env.example</code> in the repo). Required
            variables: <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>,{" "}
            <code>VITE_FIREBASE_PROJECT_ID</code>, and the rest from the Firebase console.
          </p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="shell">
        <div className="card">
          <h1>Sign-in error</h1>
          <p className="muted">{authError}</p>
        </div>
      </div>
    );
  }

  if (roomId) {
    return <RoomView roomId={roomId} onLeave={() => setRoomId(null)} />;
  }

  return <Home onEnterRoom={setRoomId} />;
}
