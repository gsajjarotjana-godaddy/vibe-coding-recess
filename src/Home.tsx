import { useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFirebase } from "./firebase";
import { getPublicRoomId } from "./config/room";
import type { MemberDoc, RoomDoc } from "./lib/types";
import { R1_TEMPLATES } from "./lib/game";
import { FigmaHomeDecor } from "./FigmaHomeDecor";

type Props = {
  onJoined: () => void;
};

function randomTemplateId(): number {
  return Math.floor(Math.random() * R1_TEMPLATES.length);
}

const defaultMember = (): Omit<MemberDoc, "name" | "joinedAt"> => ({
  r1TemplateId: randomTemplateId(),
  r1Prompt: "",
  r1Submitted: false,
  r2ForUid: "",
  r3Guesses: {},
  r3Submitted: false,
  manualPointDelta: 0,
});

export function Home({ onJoined }: Props) {
  const { db } = getFirebase();
  const roomId = getPublicRoomId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function join() {
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

      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) {
        const room: RoomDoc = {
          phase: "lobby",
          createdAt: Date.now(),
          r1StartedAt: null,
          r1DurationSec: 120,
          r2DurationMins: 12,
          r2EndsAt: null,
          presentationOrder: null,
          r3GuessingUnlocked: false,
          resultsRevealed: false,
          podiumVisible: false,
        };
        await setDoc(roomRef, room);
      }

      const nameDup = query(collection(db, "rooms", roomId, "members"), where("name", "==", n));
      const nameSnap = await getDocs(nameDup);
      const taken = nameSnap.docs.some((d) => d.id !== uid);
      if (taken) {
        setErr("That name is already taken. Pick another.");
        return;
      }

      const mRef = doc(db, "rooms", roomId, "members", uid);
      const existing = await getDoc(mRef);
      if (existing.exists()) {
        await updateDoc(mRef, { name: n });
      } else {
        const member: MemberDoc = {
          ...defaultMember(),
          name: n,
          joinedAt: serverTimestamp() as MemberDoc["joinedAt"],
        };
        await setDoc(mRef, member);
      }
      onJoined();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="figma-landing">
      <FigmaHomeDecor />
      <header className="figma-topbar figma-landing__chrome">
        <div className="figma-brand">April Vibe Coding Recess</div>
        <nav className="figma-nav-menus" aria-hidden="true">
          <span className="figma-menu figma-menu--cyan">Menu</span>
          <span className="figma-menu figma-menu--pink">Menu</span>
          <span className="figma-menu figma-menu--lime">Menu</span>
        </nav>
        <div className="figma-topbar-cta">
          <button type="button" className="figma-btn-start" disabled={busy} onClick={join}>
            Let’s start
            <span className="figma-btn-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </div>
      </header>

      <main className="figma-hero figma-landing__chrome">
        <h1 className="figma-title">
          <span className="figma-title-strong">Guess the</span>{" "}
          <span className="figma-title-accent">
            <span className="figma-title-pr">Pr</span>ompt
          </span>
        </h1>
        <p className="figma-subtitle">Enter your name to join!</p>

        <div className="figma-join-field">
          <label className="sr" htmlFor="player-name">
            Your name
          </label>
          <input
            id="player-name"
            className="figma-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="Your name"
            maxLength={32}
            autoComplete="name"
            autoFocus
          />
        </div>

        {err && <p className="figma-error">{err}</p>}
      </main>

      <footer className="figma-footer figma-landing__chrome">Designed by Grace Sajjarotjana</footer>
    </div>
  );
}
