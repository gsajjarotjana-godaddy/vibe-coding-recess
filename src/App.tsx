import { useEffect, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { getFirebase, isFirebaseConfigured } from "./firebase";
import { getPublicRoomId } from "./config/room";
import { Home } from "./Home";
import { RoomView } from "./RoomView";

const SESSION_KEY = "vcr_session";

export function App() {
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [inSession, setInSession] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");

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
    if (inSession) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  }, [inSession]);

  if (!ready) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (!isFirebaseConfigured()) {
    return (
      <div className="shell-figma">
        <div className="figma-card figma-card--compact">
          <h1 className="figma-title">
            <span className="figma-title-strong">Guess the</span>{" "}
            <span className="figma-title-accent">
              <span className="figma-title-pr">Pr</span>ompt
            </span>
          </h1>
          <p className="figma-muted">
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
      <div className="shell-figma">
        <div className="figma-card figma-card--compact">
          <h1>Sign-in error</h1>
          <p className="figma-muted">{authError}</p>
        </div>
      </div>
    );
  }

  const roomId = getPublicRoomId();

  if (inSession) {
    return <RoomView roomId={roomId} onLeave={() => setInSession(false)} />;
  }

  return <Home onEnterGame={() => setInSession(true)} />;
}
