import { useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFirebase } from "./firebase";
import type { MemberDoc, RoomDoc } from "./lib/types";
import { makeRoomCode, R1_TEMPLATES } from "./lib/game";

type Props = {
  onEnterRoom: (roomId: string) => void;
};

function randomTemplateId(): number {
  return Math.floor(Math.random() * R1_TEMPLATES.length);
}

export function Home({ onEnterRoom }: Props) {
  const { db } = getFirebase();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createRoom() {
    setErr(null);
    const n = name.trim();
    if (n.length < 1) {
      setErr("Add your name.");
      return;
    }
    if (n.length > 32) {
      setErr("Name is too long (max 32).");
      return;
    }
    setBusy(true);
    try {
      const auth = getAuth();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not signed in");

      let roomId = "";
      for (let k = 0; k < 20; k++) {
        const c = makeRoomCode();
        const ref = doc(db, "rooms", c);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          roomId = c;
          break;
        }
      }
      if (!roomId) throw new Error("Could not allocate a room code. Try again.");

      const now = Date.now();
      const room: RoomDoc = {
        hostId: uid,
        phase: "lobby",
        createdAt: now,
        r1StartedAt: null,
        r1DurationSec: 120,
        r2DurationMins: 12,
        r2EndsAt: null,
        presentationOrder: null,
        r3GuessingUnlocked: false,
        resultsRevealed: false,
        podiumVisible: false,
      };
      const member: MemberDoc = {
        name: n,
        r1TemplateId: randomTemplateId(),
        r1Prompt: "",
        r1Submitted: false,
        r2ForUid: "",
        r3Guesses: {},
        r3Submitted: false,
        manualPointDelta: 0,
      };

      await setDoc(doc(db, "rooms", roomId), room);
      await setDoc(doc(db, "rooms", roomId, "members", uid), member);
      onEnterRoom(roomId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    setErr(null);
    const n = name.trim();
    const c = code.trim().toUpperCase();
    if (n.length < 1) {
      setErr("Add your name.");
      return;
    }
    if (c.length < 4) {
      setErr("Enter a room code.");
      return;
    }
    setBusy(true);
    try {
      const auth = getAuth();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not signed in");

      const roomRef = doc(db, "rooms", c);
      const rs = await getDoc(roomRef);
      if (!rs.exists()) {
        setErr("Room not found. Check the code.");
        return;
      }
      const room = rs.data() as RoomDoc;
      if (room.resultsRevealed) {
        setErr("This session has already ended.");
        return;
      }

      const mRef = doc(db, "rooms", c, "members", uid);
      const existing = await getDoc(mRef);
      if (existing.exists()) {
        onEnterRoom(c);
        return;
      }

      const mQ = query(collection(db, "rooms", c, "members"), where("name", "==", n));
      const mSnap = await getDocs(mQ);
      if (!mSnap.empty) {
        setErr("That name is already taken in this room. Pick another.");
        return;
      }

      const member: MemberDoc = {
        name: n,
        r1TemplateId: randomTemplateId(),
        r1Prompt: "",
        r1Submitted: false,
        r2ForUid: "",
        r3Guesses: {},
        r3Submitted: false,
        manualPointDelta: 0,
      };
      await setDoc(mRef, member);
      onEnterRoom(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <div className="card">
        <h1>Vibe Coding Recess</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Create a room, share the code, run three rounds, then compare guesses. Music and screen sharing stay in
          Teams — this is for prompts, timing hints, and scoring.
        </p>

        <div style={{ marginTop: "1rem" }}>
          <span className="label">Display name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={32}
            autoComplete="off"
          />
        </div>

        {err && (
          <p className="muted" style={{ color: "var(--err)", marginTop: "0.6rem" }}>
            {err}
          </p>
        )}

        <div className="row" style={{ marginTop: "1rem" }}>
          <button className="primary" type="button" disabled={busy} onClick={createRoom}>
            Create room
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Join a room</h2>
        <div className="row">
          <div style={{ flex: "1 1 200px" }}>
            <span className="label">Room code</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. 7K3F9A"
              maxLength={8}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: "0.5rem" }}>
          <button className="primary" type="button" disabled={busy} onClick={joinRoom}>
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
