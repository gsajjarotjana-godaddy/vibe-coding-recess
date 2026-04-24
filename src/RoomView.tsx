import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebase } from "./firebase";
import {
  type MemberDoc,
  type RoomDoc,
  firestoreNumberOrTimeToMs,
  migrateRoomDoc,
} from "./lib/types";
import {
  R1_MIN_WORDS,
  R2_BUILD_DURATION_MINS,
  allGuessedForTarget,
  countWords,
  buildR2Mapping,
  totalScoreForPlayer,
  pickNextPresenter,
  EXAMPLE_PROMPTS,
  scoreGuess,
} from "./lib/game";
import { getHostMemberId, sortMembersByJoinOrder } from "./lib/host";
import { resetEntireSession } from "./lib/roomReset";
import { HighlightText } from "./components/HighlightText";
import { LobbyPlayerGrid } from "./components/LobbyPlayerGrid";
import { InstructionTimeBadge } from "./components/InstructionTimeBadge";
import { SessionPageLayout } from "./components/SessionPageLayout";
import { FigmaHomeDecor } from "./FigmaHomeDecor";

type Props = {
  roomId: string;
  onLeave: () => void;
};

function r1WritingTimeBadge(room: RoomDoc) {
  const start = firestoreNumberOrTimeToMs(room.r1StartedAt as unknown);
  const dur = room.r1DurationSec || 120;
  if (start == null) {
    return <InstructionTimeBadge type="static" totalSeconds={dur} />;
  }
  return <InstructionTimeBadge type="live" endAtMs={start + dur * 1000} />;
}

const R3_GUESS_SEC = 60;

function r2CodingHeaderTimeBadge(room: RoomDoc) {
  const end = firestoreNumberOrTimeToMs(room.r2EndsAt as unknown);
  const windowSec = R2_BUILD_DURATION_MINS * 60;
  if (end == null) {
    return <InstructionTimeBadge type="static" totalSeconds={windowSec} />;
  }
  return <InstructionTimeBadge type="live" endAtMs={end} />;
}

/** Live countdown; `endsAt` is for guessers on the typing form only. */
function r3GuessTimeBadge(endsAt: number | null) {
  if (endsAt == null) {
    return <InstructionTimeBadge type="static" totalSeconds={R3_GUESS_SEC} />;
  }
  return <InstructionTimeBadge type="live" endAtMs={endsAt} />;
}

const INAPP_CTA_ERR_MS = 2500;

/** Title case for display (e.g. "grace's" → "Grace's" is handled if split words; "john doe" → "John Doe"). */
function toTitleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function InAppCtaButton({
  label,
  disabled,
  onAction,
  isHost,
  onNotHost,
}: {
  label: string;
  disabled?: boolean;
  onAction: () => void;
  isHost: boolean;
  onNotHost: () => void;
}) {
  return (
    <button
      type="button"
      className="figma-btn-start figma-btn-start--lobby"
      disabled={disabled}
      onClick={() => (isHost ? onAction() : onNotHost())}
    >
      {label} <span className="figma-btn-arrow">→</span>
    </button>
  );
}

export function RoomView({ roomId, onLeave }: Props) {
  const { db } = getFirebase();
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [members, setMembers] = useState<Record<string, MemberDoc & { id: string }>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [r1Text, setR1Text] = useState("");
  const [r3Line, setR3Line] = useState("");
  const [inAppCtaErr, setInAppCtaErr] = useState(false);
  const [revealCtaNotHostErr, setRevealCtaNotHostErr] = useState(false);
  const ctaErrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealCtaErrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uid = getAuth().currentUser?.uid || "";
  const me = uid ? members[uid] : undefined;
  const hostMemberId = useMemo(() => getHostMemberId(members), [members]);
  const isHost = Boolean(hostMemberId && uid && hostMemberId === uid);
  const hadMe = useRef(false);
  const leftAfterRemoval = useRef(false);

  const clearCtaErr = useCallback(() => {
    if (ctaErrTimer.current) {
      clearTimeout(ctaErrTimer.current);
      ctaErrTimer.current = null;
    }
    setInAppCtaErr(false);
    if (revealCtaErrTimer.current) {
      clearTimeout(revealCtaErrTimer.current);
      revealCtaErrTimer.current = null;
    }
    setRevealCtaNotHostErr(false);
  }, []);

  const bumpNotHost = useCallback(() => {
    setInAppCtaErr(true);
    if (ctaErrTimer.current) clearTimeout(ctaErrTimer.current);
    ctaErrTimer.current = setTimeout(() => {
      setInAppCtaErr(false);
      ctaErrTimer.current = null;
    }, INAPP_CTA_ERR_MS);
  }, []);

  const bumpNotHostReveal = useCallback(() => {
    setRevealCtaNotHostErr(true);
    if (revealCtaErrTimer.current) clearTimeout(revealCtaErrTimer.current);
    revealCtaErrTimer.current = setTimeout(() => {
      setRevealCtaNotHostErr(false);
      revealCtaErrTimer.current = null;
    }, INAPP_CTA_ERR_MS);
  }, []);

  useEffect(
    () => () => {
      if (ctaErrTimer.current) clearTimeout(ctaErrTimer.current);
      if (revealCtaErrTimer.current) clearTimeout(revealCtaErrTimer.current);
    },
    []
  );

  useEffect(() => {
    if (me) hadMe.current = true;
  }, [me]);

  useEffect(() => {
    if (leftAfterRemoval.current) return;
    if (hadMe.current && uid && !members[uid]) {
      leftAfterRemoval.current = true;
      onLeave();
    }
  }, [uid, members, onLeave]);

  useEffect(() => {
    const u = onSnapshot(
      doc(db, "rooms", roomId),
      (snap) => {
        if (!snap.exists()) {
          setErr("Room no longer exists.");
          setRoom(null);
          return;
        }
        setRoom(migrateRoomDoc(snap.data() as Record<string, unknown>));
      },
      (e) => setErr(e.message)
    );
    return () => u();
  }, [db, roomId]);

  useEffect(() => {
    const q = query(collection(db, "rooms", roomId, "members"), orderBy("name", "asc"));
    const u = onSnapshot(
      q,
      (snap) => {
        const o: Record<string, MemberDoc & { id: string }> = {};
        snap.forEach((d) => {
          o[d.id] = { id: d.id, ...(d.data() as MemberDoc) };
        });
        setMembers(o);
      },
      (e) => setErr(e.message)
    );
    return () => u();
  }, [db, roomId]);

  /** If the room is open but still at lobby (e.g. older clients), move everyone to Round 1 intro. */
  useEffect(() => {
    if (!room || !isHost) return;
    if (room.sessionOpen !== true || room.phase !== "lobby") return;
    void updateDoc(doc(db, "rooms", roomId), { phase: "r1_intro" as const });
  }, [room, isHost, db, roomId]);

  useEffect(() => {
    if (me?.r1Prompt) setR1Text(me.r1Prompt);
  }, [me?.r1Prompt, me?.id]);

  /** Legacy rooms: skip removed r3_present step and go straight to guessing. */
  useEffect(() => {
    if (!room || room.phase !== "r3_present" || !isHost) return;
    void updateDoc(doc(db, "rooms", roomId), { phase: "r3_guess" as const, r3AnswerRevealed: false });
  }, [room, isHost, db, roomId]);

  /** Legacy: r3_wait removed; jump to reveal. */
  useEffect(() => {
    if (!room || room.phase !== "r3_wait" || !isHost) return;
    void updateDoc(doc(db, "rooms", roomId), {
      phase: "r3_reveal" as const,
      r3AnswerRevealed: false,
      r3GuessEndsAt: null,
    });
  }, [room, isHost, db, roomId]);

  const tUid = room?.r3CurrentPresenter;

  const r3GuessInWaiting = useMemo(() => {
    if (!room || room.phase !== "r3_guess" || !tUid || !me) return false;
    if (uid === tUid) return Boolean(me.r3PresentRoundAck);
    return Boolean((me.r3Guesses?.[tUid] || "").trim().length);
  }, [room, tUid, me, uid]);

  /** R3: 1:00 for guessers only, on the typing form (not the full-page wait, not presenter). */
  const [r3LocalGuessEndsAt, setR3LocalGuessEndsAt] = useState<number | null>(null);
  const r3GuessTimerPhaseRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (room?.phase !== "r3_guess" || !tUid) {
      r3GuessTimerPhaseRef.current = null;
      setR3LocalGuessEndsAt(null);
      return;
    }
    const isGuesserTyping = Boolean(uid) && uid !== tUid && !r3GuessInWaiting;
    if (!isGuesserTyping) {
      setR3LocalGuessEndsAt(null);
      return;
    }
    if (r3GuessTimerPhaseRef.current !== tUid) {
      r3GuessTimerPhaseRef.current = tUid;
      setR3LocalGuessEndsAt(Date.now() + R3_GUESS_SEC * 1000);
    }
  }, [room?.phase, tUid, r3GuessInWaiting, uid]);

  useEffect(() => {
    if (!me || !room || room.phase !== "r3_guess" || !tUid) {
      return;
    }
    setR3Line((me.r3Guesses && me.r3Guesses[tUid]) || "");
  }, [me, room?.phase, tUid, me?.r3Guesses, room?.r3CurrentPresenter]);

  const uids = useMemo(() => Object.keys(members), [members]);
  const allR1Submitted =
    uids.length >= 2 && uids.every((id) => members[id]?.r1Submitted);
  const allR2VibeDone =
    uids.length >= 2 && uids.every((id) => members[id]?.r2VibeDone);

  const lobbyMembersByJoin = useMemo(
    () =>
      sortMembersByJoinOrder(Object.values(members)).map((m) => ({
        id: m.id,
        name: m.name,
        r1Submitted: m.r1Submitted,
        r2VibeDone: m.r2VibeDone,
        r3Guesses: m.r3Guesses,
        r3PresentRoundAck: m.r3PresentRoundAck,
      })),
    [members]
  );

  /** Background icon drift: on for waiting phases, r3 guess wait, and final standings; form steps stay static. */
  const decorDriftEnabled = useMemo(() => {
    if (!room) return true;
    const p = room.phase;
    if (p === "r2_waiting") return true;
    if (p === "r1_writing" && (me?.r1Submitted || allR1Submitted)) return true;
    if (p === "r2_coding" && me?.r2VibeDone) return true;
    if (p === "r3_guess" && r3GuessInWaiting) return true;
    if (p === "results" && room.resultsRevealed) return true;
    return false;
  }, [room, me, allR1Submitted, r3GuessInWaiting]);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const hostResetEntireSession = useCallback(() => {
    if (
      !window.confirm(
        "Reset the room? Everyone will return to the name screen. The first person to join again will be the new host."
      )
    ) {
      return;
    }
    void withBusy(() => resetEntireSession(db, roomId));
  }, [withBusy, db, roomId]);

  async function handleLeave() {
    if (!uid) {
      onLeave();
      return;
    }
    if (isHost) {
      if (
        !window.confirm(
          "End the session for everyone? All players return to the name screen, and the next person to join is the new host."
        )
      ) {
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        await resetEntireSession(db, roomId);
        leftAfterRemoval.current = true;
        onLeave();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not end session");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await deleteDoc(doc(db, "rooms", roomId, "members", uid));
      leftAfterRemoval.current = true;
      onLeave();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not leave");
    } finally {
      setBusy(false);
    }
  }

  const scores = useMemo(() => {
    if (!Object.keys(members).length) return [];
    return uids
      .map((id) => {
        const t = totalScoreForPlayer(id, members);
        return { id, name: members[id]!.name, ...t };
      })
      .sort((a, b) => b.total - a.total);
  }, [members, uids]);

  // ——— Host actions ———
  async function goR1IntroToWriting() {
    await withBusy(async () => {
      if (!room) return;
      await updateDoc(doc(db, "rooms", roomId), {
        phase: "r1_writing" as const,
        r1StartedAt: Date.now(),
        r1DurationSec: room.r1DurationSec ?? 120,
      });
    });
  }

  async function goR1WaitToR2Intro() {
    await withBusy(async () => {
      if (!room) return;
      const m = buildR2Mapping(uids);
      if (!m) {
        setErr("Need at least 2 players for a fair swap.");
        return;
      }
      const batch = writeBatch(db);
      uids.forEach((id) => {
        batch.update(doc(db, "rooms", roomId, "members", id), { r2ForUid: m[id]!, r2VibeDone: false });
      });
      batch.update(doc(db, "rooms", roomId), {
        phase: "r2_intro" as const,
        r2EndsAt: null,
      });
      await batch.commit();
    });
  }

  async function goR2IntroToCoding() {
    await withBusy(async () => {
      if (!room) return;
      const r2EndsAt = Date.now() + R2_BUILD_DURATION_MINS * 60 * 1000;
      await updateDoc(doc(db, "rooms", roomId), {
        phase: "r2_coding" as const,
        r2EndsAt,
        r2DurationMins: R2_BUILD_DURATION_MINS,
      });
    });
  }

  async function goR2WaitToR3Intro() {
    await withBusy(async () => {
      const batch = writeBatch(db);
      uids.forEach((id) => {
        batch.update(doc(db, "rooms", roomId, "members", id), {
          r3Guesses: {},
          r3Submitted: false,
        });
      });
      batch.update(doc(db, "rooms", roomId), {
        phase: "r3_intro" as const,
        r3PresentedUids: [],
        r3CurrentPresenter: null,
        r3PickedRevealed: false,
        r3AnswerRevealed: false,
        r3GuessingUnlocked: false,
        r3GuessEndsAt: null,
      });
      await batch.commit();
    });
  }

  async function goR3IntroToPick() {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId), { phase: "r3_pick" as const, r3PickedRevealed: false, r3CurrentPresenter: null });
    });
  }

  async function hostRandomizePresenter() {
    await withBusy(async () => {
      if (!room) return;
      const next = pickNextPresenter(uids, room.r3PresentedUids || []);
      if (!next) {
        setErr("No one left to pick. Go to results.");
        return;
      }
      await updateDoc(doc(db, "rooms", roomId), {
        r3CurrentPresenter: next,
        r3PickedRevealed: true,
        r3AnswerRevealed: false,
      });
    });
  }

  async function hostR3PickToPresent() {
    await withBusy(async () => {
      if (!room?.r3CurrentPresenter) return;
      const batch = writeBatch(db);
      uids.forEach((id) => {
        batch.update(doc(db, "rooms", roomId, "members", id), { r3PresentRoundAck: false });
      });
      batch.update(doc(db, "rooms", roomId), {
        phase: "r3_guess" as const,
        r3AnswerRevealed: false,
      });
      await batch.commit();
    });
  }

  async function r3PresentContinue() {
    if (!uid) return;
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId, "members", uid), { r3PresentRoundAck: true });
    });
  }

  async function hostRevealAnswer() {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId), { r3AnswerRevealed: true });
    });
  }

  async function hostR3RevealContinue() {
    await withBusy(async () => {
      if (!room?.r3CurrentPresenter) return;
      const p = room.r3CurrentPresenter;
      const nextPresented = [...(room.r3PresentedUids || []), p];
      const isLast = nextPresented.length >= uids.length;
      if (isLast) {
        await updateDoc(doc(db, "rooms", roomId), {
          phase: "results" as const,
          resultsRevealed: true,
          podiumVisible: true,
          r3PresentedUids: nextPresented,
          r3GuessEndsAt: null,
        });
        return;
      }
      await updateDoc(doc(db, "rooms", roomId), {
        phase: "r3_pick" as const,
        r3PresentedUids: nextPresented,
        r3CurrentPresenter: null,
        r3PickedRevealed: false,
        r3AnswerRevealed: false,
        r3GuessEndsAt: null,
      });
    });
  }

  async function setManual(mId: string, delta: number) {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId, "members", mId), { manualPointDelta: delta });
    });
  }

  async function submitR1() {
    if (!me) return;
    const text = r1Text.trim();
    if (countWords(text) < R1_MIN_WORDS) {
      setErr(`Use at least ${R1_MIN_WORDS} words.`);
      return;
    }
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId, "members", uid), { r1Prompt: text, r1Submitted: true });
    });
  }

  async function r2VibeDoneClick() {
    if (!me) return;
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId, "members", uid), { r2VibeDone: true });
    });
  }

  async function submitR3Round() {
    if (!me || !room || !tUid) return;
    if (uid === tUid) return;
    const guess = r3Line.trim();
    if (countWords(guess) < R1_MIN_WORDS) {
      setErr(`Use at least ${R1_MIN_WORDS} words.`);
      return;
    }
    const merged: Record<string, string> = { ...me.r3Guesses, [tUid]: guess };
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId, "members", uid), { r3Guesses: merged });
    });
  }

  async function goR3GuessWaitToReveal() {
    await withBusy(async () => {
      if (!room || room.phase !== "r3_guess" || !tUid || !allGuessedForTarget(members, uids, tUid)) return;
      await updateDoc(doc(db, "rooms", roomId), { phase: "r3_reveal" as const, r3AnswerRevealed: false });
    });
  }

  if (!room) {
    return (
      <div className="shell-figma">
        <p className="figma-muted">{err || "…"}</p>
        <button type="button" className="figma-ghost-link" onClick={onLeave}>
          Back
        </button>
      </div>
    );
  }

  const assignee = me && me.r2ForUid ? members[me.r2ForUid] : null;
  const currentPresenter = room.r3CurrentPresenter ? members[room.r3CurrentPresenter] : null;
  const answerText = currentPresenter?.r1Prompt || "";

  const isLastR3Reveal =
    (room.r3PresentedUids?.length ?? 0) + 1 >= uids.length && uids.length > 0;
  const topCta: { label: string; onAction: () => void; show: boolean; disabled?: boolean } | null = (() => {
    const p = room.phase;
    if (p === "r1_intro") {
      return { show: true, label: "Start round", onAction: goR1IntroToWriting };
    }
    if (p === "r1_writing" && allR1Submitted) {
      return { show: true, label: "Continue", onAction: goR1WaitToR2Intro };
    }
    if (p === "r2_intro") {
      return { show: true, label: "Start round", onAction: goR2IntroToCoding };
    }
    if ((p === "r2_coding" && allR2VibeDone) || p === "r2_waiting") {
      return { show: true, label: "Continue", onAction: goR2WaitToR3Intro };
    }
    if (p === "r3_intro") {
      return { show: true, label: "Start round", onAction: goR3IntroToPick };
    }
    if (p === "r3_pick" && room.r3PickedRevealed && room.r3CurrentPresenter) {
      return { show: true, label: "Done Sharing", onAction: hostR3PickToPresent, disabled: busy };
    }
    if (p === "r3_guess" && tUid && allGuessedForTarget(members, uids, tUid)) {
      return { show: true, label: "Continue", onAction: goR3GuessWaitToReveal, disabled: busy };
    }
    if (p === "r3_reveal" && room.r3AnswerRevealed) {
      return {
        show: true,
        label: isLastR3Reveal ? "View Standings" : "Continue",
        onAction: hostR3RevealContinue,
        disabled: busy,
      };
    }
    if (p === "results" && room.resultsRevealed) {
      return { show: true, label: "New Round", onAction: hostResetEntireSession, disabled: busy };
    }
    return null;
  })();

  return (
    <div className="figma-landing">
      <FigmaHomeDecor staticFloat={!decorDriftEnabled} />
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
            onClick={() => void handleLeave()}
            disabled={busy}
          >
            Leave
          </button>
        </nav>
        <div className="figma-topbar-cta">
          <div className="figma-topbar-cta__wrap figma-topbar-cta__wrap--session">
            {topCta?.show && (
              <InAppCtaButton
                label={topCta.label}
                disabled={topCta.disabled}
                onAction={() => {
                  clearCtaErr();
                  void topCta.onAction();
                }}
                isHost={isHost}
                onNotHost={bumpNotHost}
              />
            )}
            {inAppCtaErr && (
              <p className="figma-host-only-msg" role="status" aria-live="polite">
                for host only
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="figma-hero figma-landing__chrome figma-hero--static-head">
        {room && room.phase === "r1_writing" && me?.r1Submitted ? (
          <>
            {err && <p className="figma-error" style={{ marginTop: 0 }}>{err}</p>}
            <h1 className="figma-title">
              <span className="figma-title-strong">Guess the</span>{" "}
              <span className="figma-title-accent">
                <span className="figma-title-pr">Pr</span>ompt
              </span>
            </h1>
            <p className="figma-subtitle">Waiting for others to submit..</p>
            <LobbyPlayerGrid
              members={lobbyMembersByJoin}
              hostMemberId={hostMemberId}
              onHostReset={hostResetEntireSession}
              variant="r1-wait"
            />
          </>
        ) : room &&
          ((room.phase === "r2_coding" && me?.r2VibeDone) || room.phase === "r2_waiting") ? (
          <>
            {err && <p className="figma-error" style={{ marginTop: 0 }}>{err}</p>}
            <h1 className="figma-title">
              <span className="figma-title-strong">Guess the</span>{" "}
              <span className="figma-title-accent">
                <span className="figma-title-pr">Pr</span>ompt
              </span>
            </h1>
            <p className="figma-subtitle">Waiting for others to finish building..</p>
            <LobbyPlayerGrid
              members={lobbyMembersByJoin}
              hostMemberId={hostMemberId}
              onHostReset={hostResetEntireSession}
              variant="r2-wait"
            />
          </>
        ) : room && r3GuessInWaiting && tUid ? (
          <>
            {err && <p className="figma-error" style={{ marginTop: 0 }}>{err}</p>}
            <h1 className="figma-title">
              <span className="figma-title-strong">Guess the</span>{" "}
              <span className="figma-title-accent">
                <span className="figma-title-pr">Pr</span>ompt
              </span>
            </h1>
            <p className="figma-subtitle">Waiting for others to submit..</p>
            <LobbyPlayerGrid
              members={lobbyMembersByJoin}
              hostMemberId={hostMemberId}
              onHostReset={hostResetEntireSession}
              variant="r3-wait"
              r3TargetUid={tUid}
            />
          </>
        ) : (
      <div className="figma-content shell-figma-inner">
        {err && <p className="muted" style={{ color: "var(--err)", marginTop: 0 }}>{err}</p>}

        {room.phase === "r1_intro" && (
          <div className="figma-card figma-card--instruction">
            <SessionPageLayout
              titleStart="Round 1 – "
              titleAccent="Create Prompt"
              subtitle={
                "Write a prompt of at least 10 words that describes a fun, one-screen app or tool with a clear purpose.\n" +
                "Everyone will have 2 minutes to write a prompt."
              }
              footerInCard={null}
            />
            <div className="figma-card" style={{ marginTop: 12, marginBottom: 0 }}>
              <h3 className="figma-card-title" style={{ fontSize: "0.95rem" }}>
                Examples
              </h3>
              <ul className="examples" style={{ margin: 0 }}>
                {EXAMPLE_PROMPTS.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {room.phase === "r1_writing" && me && !me.r1Submitted && (
          <div className="figma-card figma-card--instruction">
            <SessionPageLayout
              titleStart="Round 1 – "
              titleAccent="Create Prompt"
              headerRight={r1WritingTimeBadge(room)}
              subtitle={
                "Write a prompt of at least 10 words that describes a fun, one-screen app or tool with a clear purpose.\n" +
                "Everyone will have 2 minutes to write a prompt."
              }
            />
            <p className="label">Your prompt</p>
            <textarea
              value={r1Text}
              onChange={(e) => setR1Text(e.target.value)}
              maxLength={2000}
              placeholder="What should someone else vibe-code?"
              rows={8}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="figma-btn-start figma-btn-start--lobby"
                disabled={busy}
                onClick={submitR1}
              >
                Submit prompt <span className="figma-btn-arrow">→</span>
              </button>
            </div>
          </div>
        )}

        {room.phase === "r2_intro" && (
          <div className="figma-card figma-card--instruction">
            <SessionPageLayout
              titleStart="Round 2 - "
              titleAccent="Vibe Coding Time!"
              subtitle={
                <ul className="figma-session-subtitle--bullets">
                  <li>
                    Everyone will receive a randomly assigned prompt created by another player, which will appear at the
                    top of the screen.
                  </li>
                  <li>
                    You’ll have 10 minutes to vibe code it in Cursor, building the idea as closely as possible.
                  </li>
                  <li>You can create a basic HTML page.</li>
                </ul>
              }
            />
          </div>
        )}

        {room.phase === "r2_coding" && me && !me.r2VibeDone && (
          <div className="figma-card figma-card--instruction">
            <SessionPageLayout
              titleStart="Build this - "
              titleAccent="Go to Cursor"
              headerRight={r2CodingHeaderTimeBadge(room)}
              subtitle="Prompt to build:"
            />
            {assignee && me.r2ForUid ? (
              <>
                <p className="figma-r2-build-prompt">{assignee.r1Prompt || "—"}</p>
                <p className="figma-r2-build-hint">Time to vibe code in Cursor!</p>
                <div className="row figma-r2-build-cta">
                  <button
                    type="button"
                    className="figma-btn-start figma-btn-start--lobby"
                    disabled={busy}
                    onClick={r2VibeDoneClick}
                  >
                    I’m done <span className="figma-btn-arrow">→</span>
                  </button>
                </div>
              </>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Waiting for assignment…
              </p>
            )}
          </div>
        )}

        {room.phase === "r3_intro" && (
          <div className="figma-card figma-card--instruction">
            <SessionPageLayout
              titleStart="Round 3 - "
              titleAccent="Share & Guess"
              subtitle={
                <ul className="figma-session-subtitle--bullets">
                  <li>
                    Each person will share their screen and generally share what they created without giving away any
                    key words.
                  </li>
                  <li>Everyone else will try and guess the original prompt given.</li>
                  <li>For every word in your guess that matches the real prompt, you get a point.</li>
                  <li>The person with the most points at the end wins.</li>
                </ul>
              }
            />
          </div>
        )}

        {room.phase === "r3_pick" && (
          <div className="figma-card figma-card--r3-pick">
            <div className="figma-r3-pick-hero">
              {room.r3PickedRevealed && room.r3CurrentPresenter ? (
                <div className="figma-r3-pick-picked">
                  <div className="figma-r3-pick-picked-body">
                    <h2 className="figma-r3-pick-title">Who’s Sharing?</h2>
                    <p className="figma-r3-pick-hint figma-r3-pick-picked-sub">
                      Share your screen and describe your build without giving away too many hints.
                    </p>
                    {currentPresenter ? (
                      <h2 className="figma-session-title figma-r3-pick-reveal-name">
                        <span className="figma-session-title__accent">{currentPresenter.name}</span>
                      </h2>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="figma-r3-pick-title">Who’s Sharing?</h2>
                  <p className="figma-r3-pick-hint">
                    Share your screen and describe your build without giving away too many hints.
                  </p>
                  {isHost ? (
                    <InAppCtaButton
                      label="Randomize"
                      disabled={busy}
                      isHost={isHost}
                      onNotHost={bumpNotHost}
                      onAction={() => {
                        clearCtaErr();
                        void hostRandomizePresenter();
                      }}
                    />
                  ) : (
                    <p className="figma-waiting-sub" style={{ margin: 0, textAlign: "center" }}>
                      Waiting for the host to pick the next presenter.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {room.phase === "r3_guess" && tUid && me && !r3GuessInWaiting && (
          <div className="figma-card figma-card--instruction">
            {uid === tUid ? (
              <>
                <SessionPageLayout
                  titleStart="Guess the Prompt"
                  titleAccent=""
                  titlePlain
                  subtitle="You can’t guess your own prompt. Wait for the others to submit."
                />
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="figma-btn-start figma-btn-start--lobby"
                    disabled={busy}
                    onClick={() => {
                      setErr(null);
                      void r3PresentContinue();
                    }}
                  >
                    Continue <span className="figma-btn-arrow">→</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <SessionPageLayout
                  titleStart="Guess the Prompt"
                  titleAccent=""
                  titlePlain
                  headerRight={r3GuessTimeBadge(r3LocalGuessEndsAt)}
                  subtitle={
                    "Type in a prompt with at least 10 words that you think may have been the original prompt. " +
                    "You get a point for each word that matches."
                  }
                />
                <p className="label">Your guess</p>
                <textarea
                  value={r3Line}
                  onChange={(e) => {
                    setErr(null);
                    setR3Line(e.target.value);
                  }}
                  rows={8}
                  maxLength={2000}
                  placeholder="Type your guess (at least 10 words)"
                />
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="figma-btn-start figma-btn-start--lobby"
                    disabled={busy}
                    onClick={submitR3Round}
                  >
                    I’m done <span className="figma-btn-arrow">→</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {room.phase === "r3_reveal" && currentPresenter && (
          <div className="figma-card figma-card--instruction">
            <h2 className="r3-reveal__heading figma-card-title--left" style={{ marginTop: 0 }}>
              {toTitleCase(currentPresenter.name)}’s Round
            </h2>
            {room.r3AnswerRevealed ? (
              <>
                <div className="reveal reveal--prompt reveal--answer">
                  <HighlightText as="div" text={answerText} target={answerText} />
                </div>
                <div className="guess-reveal-block">
                  <p className="guess-reveal-section-title">Guesses</p>
                  <div className="guess-reveal-list" role="list">
                  {uids
                    .filter((gId) => gId !== room.r3CurrentPresenter)
                    .map((gId) => {
                      const guesser = members[gId];
                      if (!guesser) return null;
                      const gText = (guesser.r3Guesses && guesser.r3Guesses[room.r3CurrentPresenter!]) || "";
                      const s = scoreGuess(gText, answerText);
                      return { gId, guesser, gText, s };
                    })
                    .filter(
                      (row): row is { gId: string; guesser: MemberDoc & { id: string }; gText: string; s: number } =>
                        row != null
                    )
                    .sort((a, b) => b.s - a.s)
                    .map(({ gId, guesser, gText, s: matchPts }) => (
                      <div className="guess-reveal-row" key={gId} role="listitem">
                        <div className="guess-reveal-row__prompt">
                          {gText.trim() ? (
                            <HighlightText withPop as="span" text={gText} target={answerText} />
                          ) : (
                            <span className="muted">(no guess)</span>
                          )}
                        </div>
                        <div className="guess-reveal-row__name">{toTitleCase(guesser.name)}</div>
                        <div className="guess-reveal-row__pts" aria-label={`${matchPts} match points`}>
                          +{matchPts} pts
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="reveal reveal--hidden-prompt">Prompt hidden</div>
                <div
                  className="figma-inline-cta-with-host-msg"
                  style={{ marginTop: 32 }}
                >
                  <InAppCtaButton
                    label="Reveal"
                    disabled={busy}
                    onAction={() => {
                      clearCtaErr();
                      void hostRevealAnswer();
                    }}
                    isHost={isHost}
                    onNotHost={bumpNotHostReveal}
                  />
                  {revealCtaNotHostErr && (
                    <p
                      className="figma-host-only-msg figma-host-only-msg--inline"
                      role="status"
                      aria-live="polite"
                    >
                      for host only
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {room.phase === "results" && room.resultsRevealed && (
          <div className="figma-card figma-card--instruction">
            <h2 className="figma-card-title figma-card-title--left" style={{ marginTop: 0 }}>
              Final Results
            </h2>
            {scores.length > 0 && (
              <div className="podium" aria-label="Top three">
                {scores.length === 1 && (
                  <div className="slot rank1" style={{ order: 1 }}>
                    <div className="rank">1st</div>
                    <div className="name">{scores[0]!.name}</div>
                    <div className="pts">{scores[0]!.total} pts</div>
                  </div>
                )}
                {scores.length === 2 && (
                  <>
                    <div className="slot rank2" style={{ order: 1 }}>
                      <div className="rank">2nd</div>
                      <div className="name">{scores[1]!.name}</div>
                      <div className="pts">{scores[1]!.total} pts</div>
                    </div>
                    <div className="slot rank1" style={{ order: 2 }}>
                      <div className="rank">1st</div>
                      <div className="name">{scores[0]!.name}</div>
                      <div className="pts">{scores[0]!.total} pts</div>
                    </div>
                  </>
                )}
                {scores.length >= 3 && (
                  <>
                    {scores[1] && (
                      <div className="slot rank2">
                        <div className="rank">2nd</div>
                        <div className="name">{scores[1]!.name}</div>
                        <div className="pts">{scores[1]!.total} pts</div>
                      </div>
                    )}
                    {scores[0] && (
                      <div className="slot rank1">
                        <div className="rank">1st</div>
                        <div className="name">{scores[0]!.name}</div>
                        <div className="pts">{scores[0]!.total} pts</div>
                      </div>
                    )}
                    {scores[2] && (
                      <div className="slot rank3">
                        <div className="rank">3rd</div>
                        <div className="name">{scores[2]!.name}</div>
                        <div className="pts">{scores[2]!.total} pts</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {room.podiumVisible === true && (
              <h2 className="figma-card-title figma-card-title--left" style={{ marginTop: 18, marginBottom: 12 }}>
                Rankings
              </h2>
            )}
            {room.podiumVisible === true && (
              <table className="standings">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Word match</th>
                    <th>Manual</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td>
                        {r.name}
                        {i === 0 && <span className="pill" style={{ marginLeft: 6 }}>1st</span>}
                        {i === 1 && <span className="pill" style={{ marginLeft: 6 }}>2nd</span>}
                        {i === 2 && <span className="pill" style={{ marginLeft: 6 }}>3rd</span>}
                      </td>
                      <td>{r.auto}</td>
                      <td>
                        {isHost ? (
                          <input
                            type="number"
                            key={"mp-" + r.id + "-" + (members[r.id]?.manualPointDelta ?? 0)}
                            style={{ maxWidth: "5rem" }}
                            defaultValue={members[r.id]?.manualPointDelta ?? 0}
                            onBlur={(e) => {
                              const n = Math.round(parseFloat(e.target.value) || 0);
                              void setManual(r.id, n);
                            }}
                          />
                        ) : (
                          (r.manual || 0)
                        )}
                      </td>
                      <td>
                        <strong>{r.total}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
        )}
      </main>

      <footer className="figma-footer figma-landing__chrome">Designed by Grace Sajjarotjana</footer>
    </div>
  );
}
