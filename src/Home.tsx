import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFirebase } from "./firebase";
import { getPublicRoomId } from "./config/room";
import type { MemberDoc } from "./lib/types";
import { R1_TEMPLATES } from "./lib/game";
import { createInitialRoomDoc } from "./lib/roomReset";
import { FigmaHomeDecor } from "./FigmaHomeDecor";
import { LobbyPlayerGrid } from "./components/LobbyPlayerGrid";
import { getHostMemberId, sortMembersByJoinOrder } from "./lib/host";
import { resetEntireSession } from "./lib/roomReset";

type Props = {
  onEnterGame: () => void;
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
  r2VibeDone: false,
  r3SkipSharing: false,
});

const HOST_ONLY_TIMER_MS = 2800;

export function Home({ onEnterGame }: Props) {
  const { db } = getFirebase();
  const roomId = getPublicRoomId();
  const uid = getAuth().currentUser?.uid ?? "";

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lobbyMode, setLobbyMode] = useState(false);
  const [members, setMembers] = useState<Record<string, MemberDoc & { id: string }>>({});
  const [hostOnlyMsg, setHostOnlyMsg] = useState(false);
  const hostOnlyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHostOnlyMsg = useCallback(() => {
    if (hostOnlyTimer.current) {
      clearTimeout(hostOnlyTimer.current);
      hostOnlyTimer.current = null;
    }
    setHostOnlyMsg(false);
  }, []);

  const memberList = useMemo(
    () => sortMembersByJoinOrder(Object.values(members)),
    [members]
  );
  const hostMemberId = useMemo(() => getHostMemberId(members), [members]);
  const isHost = Boolean(uid && hostMemberId && hostMemberId === uid);

  const wasMemberInLobby = useRef(false);
  useEffect(() => {
    if (lobbyMode && uid && members[uid]) {
      wasMemberInLobby.current = true;
    }
  }, [lobbyMode, uid, members]);
  useEffect(() => {
    if (!lobbyMode || !uid) return;
    if (!wasMemberInLobby.current) return;
    if (members[uid]) return;
    wasMemberInLobby.current = false;
    setLobbyMode(false);
    setName("");
    setMembers({});
    clearHostOnlyMsg();
    setErr(null);
  }, [lobbyMode, uid, members, clearHostOnlyMsg]);

  const hostResetEntireSession = useCallback(async () => {
    if (
      !window.confirm(
        "Reset the room? Everyone will return to the name screen. The first person to join again will be the new host."
      )
    ) {
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await resetEntireSession(db, roomId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }, [db, roomId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid) return;
      const mRef = doc(db, "rooms", roomId, "members", uid);
      const snap = await getDoc(mRef);
      if (!cancelled && snap.exists()) {
        setLobbyMode(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, roomId, uid]);

  useEffect(() => {
    if (!lobbyMode) return;
    const unsub = onSnapshot(
      collection(db, "rooms", roomId, "members"),
      (snap) => {
        const o: Record<string, MemberDoc & { id: string }> = {};
        snap.forEach((d) => {
          o[d.id] = { id: d.id, ...(d.data() as MemberDoc) };
        });
        setMembers(o);
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, [lobbyMode, db, roomId]);

  /** Non-hosts auto-enter session when host opens it (sessionOpen). */
  useEffect(() => {
    if (!lobbyMode || !uid) return;
    const roomRef = doc(db, "rooms", roomId);
    const unsub = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as { sessionOpen?: boolean };
      if (!d.sessionOpen) return;
      const mRef = doc(db, "rooms", roomId, "members", uid);
      void getDoc(mRef).then((ms) => {
        if (ms.exists()) onEnterGame();
      });
    });
    return () => unsub();
  }, [lobbyMode, uid, db, roomId, onEnterGame]);

  useEffect(
    () => () => {
      if (hostOnlyTimer.current) clearTimeout(hostOnlyTimer.current);
    },
    []
  );

  async function join() {
    setErr(null);
    const n = name.trim();
    if (n.length < 1) {
      return;
    }
    if (n.length > 32) {
      setErr("Name is too long (max 32).");
      return;
    }
    setBusy(true);
    try {
      const auth = getAuth();
      const u = auth.currentUser?.uid;
      if (!u) throw new Error("Not signed in");

      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) {
        await setDoc(roomRef, createInitialRoomDoc(Date.now()));
      }

      const nameDup = query(collection(db, "rooms", roomId, "members"), where("name", "==", n));
      const nameSnap = await getDocs(nameDup);
      const taken = nameSnap.docs.some((d) => d.id !== u);
      if (taken) {
        setErr("That name is already taken. Pick another.");
        return;
      }

      const mRef = doc(db, "rooms", roomId, "members", u);
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
      setLobbyMode(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setBusy(false);
    }
  }

  async function handleLetsStart() {
    if (!lobbyMode) return;
    if (isHost) {
      clearHostOnlyMsg();
      setErr(null);
      if (memberList.length < 2) {
        setErr("Need at least 2 people to start.");
        return;
      }
      try {
        await updateDoc(doc(db, "rooms", roomId), {
          sessionOpen: true,
          phase: "r1_intro" as const,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not open session");
        return;
      }
      onEnterGame();
      return;
    }
    setHostOnlyMsg(true);
    if (hostOnlyTimer.current) clearTimeout(hostOnlyTimer.current);
    hostOnlyTimer.current = setTimeout(() => {
      setHostOnlyMsg(false);
      hostOnlyTimer.current = null;
    }, HOST_ONLY_TIMER_MS);
  }

  async function handleLeave() {
    if (lobbyMode && uid) {
      if (isHost) {
        if (
          !window.confirm(
            "End the session for everyone? All players return to the name screen, and the next person to join is the new host."
          )
        ) {
          return;
        }
        wasMemberInLobby.current = false;
        setErr(null);
        setBusy(true);
        try {
          await resetEntireSession(db, roomId);
          setLobbyMode(false);
          setMembers({});
          setName("");
          clearHostOnlyMsg();
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Could not end session");
        } finally {
          setBusy(false);
        }
        return;
      }
      wasMemberInLobby.current = false;
      setErr(null);
      setBusy(true);
      try {
        await deleteDoc(doc(db, "rooms", roomId, "members", uid));
        setLobbyMode(false);
        setMembers({});
        setName("");
        clearHostOnlyMsg();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not leave");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    }
  }

  return (
    <div className="figma-landing">
      <FigmaHomeDecor />
      <header className="figma-topbar figma-landing__chrome">
        <div className="figma-brand">April Vibe Coding Recess</div>
        <nav className="figma-nav-menus" aria-label="Top navigation">
          <span className="figma-menu figma-menu--cyan" aria-hidden="true">
            Rules
          </span>
          <span className="figma-menu figma-menu--pink" aria-hidden="true">
            Prompts
          </span>
          <button
            type="button"
            className="figma-menu figma-menu--lime figma-menu--button"
            onClick={handleLeave}
            disabled={busy}
          >
            Leave
          </button>
        </nav>
        <div className="figma-topbar-cta">
          <div className="figma-topbar-cta__wrap">
            <button
              type="button"
              className={
                lobbyMode
                  ? "figma-btn-start figma-btn-start--lobby"
                  : "figma-btn-start figma-btn-start--prelobby"
              }
              disabled={lobbyMode && busy}
              onClick={handleLetsStart}
              tabIndex={lobbyMode ? 0 : -1}
              {...(!lobbyMode ? { "aria-hidden": true as const } : {})}
            >
              Let’s start
              <span className="figma-btn-arrow" aria-hidden="true">
                →
              </span>
            </button>
            {hostOnlyMsg && (
              <p className="figma-host-only-msg" role="status" aria-live="polite">
                for host only
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="figma-hero figma-landing__chrome figma-hero--static-head">
        <h1 className="figma-title">
          <span className="figma-title-strong">Guess the</span>{" "}
          <span className="figma-title-accent">
            <span className="figma-title-pr">Pr</span>ompt
          </span>
        </h1>

        <p className="figma-subtitle">
          {lobbyMode ? "Waiting for other players.." : "Enter your name to join!"}
        </p>

        {!lobbyMode && (
          <>
            <div className="figma-join-field">
              <label className="sr" htmlFor="player-name">
                Your name
              </label>
              <div className="figma-join-row">
                <div className="figma-name-pill-outer">
                  <div className="figma-name-pill-inner">
                    <input
                      id="player-name"
                      className="figma-name-pill__input"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !busy && join()}
                      placeholder="Enter your name"
                      maxLength={32}
                      autoComplete="name"
                      autoFocus
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="figma-name-submit"
                  disabled={busy}
                  onClick={join}
                  aria-label="Join with your name"
                >
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
            {err && <p className="figma-error">{err}</p>}
          </>
        )}

        {lobbyMode && (
          <>
            {err && <p className="figma-error">{err}</p>}
            <LobbyPlayerGrid
              members={memberList.map((m) => ({ id: m.id, name: m.name }))}
              hostMemberId={hostMemberId}
              onHostReset={hostResetEntireSession}
              variant="lobby"
            />
          </>
        )}
      </main>

      <footer className="figma-footer figma-landing__chrome">Designed by Grace Sajjarotjana</footer>
    </div>
  );
}
