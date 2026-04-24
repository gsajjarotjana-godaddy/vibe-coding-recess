import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { type MemberDoc, type RoomDoc, migrateRoomDoc } from "./lib/types";
import {
  R1_MIN_WORDS,
  allGuessedForTarget,
  countWords,
  buildR2Mapping,
  totalScoreForPlayer,
  pickNextPresenter,
  EXAMPLE_PROMPTS,
  scoreGuess,
} from "./lib/game";
import { getHostMemberId } from "./lib/host";
import { HighlightText } from "./components/HighlightText";
import { SessionPageLayout, SessionWaitingBlock } from "./components/SessionPageLayout";
import { FigmaHomeDecor } from "./FigmaHomeDecor";

type Props = {
  roomId: string;
  onLeave: () => void;
};

const INAPP_CTA_ERR_MS = 2500;

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
  const ctaErrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uid = getAuth().currentUser?.uid || "";
  const me = uid ? members[uid] : undefined;
  const hostMemberId = useMemo(() => getHostMemberId(members), [members]);
  const isHost = Boolean(hostMemberId && uid && hostMemberId === uid);
  const hadMe = useRef(false);
  const leftAfterRemoval = useRef(false);
  const r1Auto = useRef(false);
  const r2Auto = useRef(false);

  const clearCtaErr = useCallback(() => {
    if (ctaErrTimer.current) {
      clearTimeout(ctaErrTimer.current);
      ctaErrTimer.current = null;
    }
    setInAppCtaErr(false);
  }, []);

  const bumpNotHost = useCallback(() => {
    setInAppCtaErr(true);
    if (ctaErrTimer.current) clearTimeout(ctaErrTimer.current);
    ctaErrTimer.current = setTimeout(() => {
      setInAppCtaErr(false);
      ctaErrTimer.current = null;
    }, INAPP_CTA_ERR_MS);
  }, []);

  useEffect(
    () => () => {
      if (ctaErrTimer.current) clearTimeout(ctaErrTimer.current);
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

  const tUid = room?.r3CurrentPresenter;
  useEffect(() => {
    if (!me || !room || room.phase !== "r3_guess" || !tUid) {
      return;
    }
    setR3Line((me.r3Guesses && me.r3Guesses[tUid]) || "");
  }, [me, room?.phase, tUid, me?.r3Guesses, room?.r3CurrentPresenter]);

  const uids = useMemo(() => Object.keys(members), [members]);

  /** Background icon drift: on only for waiting phases and inline “you’re in / wait for others” states. */
  const decorDriftEnabled = useMemo(() => {
    if (!room) return true;
    const p = room.phase;
    if (p === "r1_waiting" || p === "r2_waiting" || p === "r3_wait") return true;
    if (p === "r1_writing" && me?.r1Submitted) return true;
    if (p === "r2_coding" && me?.r2VibeDone) return true;
    if (p === "r3_guess") {
      if (tUid && uid && uid === tUid) return true;
      if (tUid && me) {
        const g = (me.r3Guesses && me.r3Guesses[tUid]) || "";
        if (g.trim().length > 0) return true;
      }
    }
    return false;
  }, [room, me, tUid, uid]);

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

  async function handleLeave() {
    if (!uid) {
      onLeave();
      return;
    }
    setBusy(true);
    try {
      await deleteDoc(doc(db, "rooms", roomId, "members", uid));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not leave");
    } finally {
      setBusy(false);
    }
    onLeave();
  }

  // Auto-advance R1: all submitted -> r1_waiting
  useEffect(() => {
    if (!room || room.phase !== "r1_writing" || uids.length < 2) return;
    if (!uids.every((id) => members[id]?.r1Submitted)) return;
    if (r1Auto.current) return;
    r1Auto.current = true;
    void (async () => {
      try {
        await updateDoc(doc(db, "rooms", roomId), { phase: "r1_waiting" as const });
      } catch {
        r1Auto.current = false;
      }
    })();
  }, [room, uids, members, db, roomId]);

  // Reset r1 auto when leaving r1_writing
  useEffect(() => {
    if (room?.phase !== "r1_waiting") {
      r1Auto.current = false;
    }
  }, [room?.phase]);

  // Auto-advance R2: all vibe done -> r2_waiting
  useEffect(() => {
    if (!room || room.phase !== "r2_coding" || uids.length < 2) return;
    if (!uids.every((id) => members[id]?.r2VibeDone)) return;
    if (r2Auto.current) return;
    r2Auto.current = true;
    void (async () => {
      try {
        await updateDoc(doc(db, "rooms", roomId), { phase: "r2_waiting" as const });
      } catch {
        r2Auto.current = false;
      }
    })();
  }, [room, uids, members, db, roomId]);

  useEffect(() => {
    if (room?.phase !== "r2_waiting") {
      r2Auto.current = false;
    }
  }, [room?.phase]);

  const scores = useMemo(() => {
    if (!Object.keys(members).length) return [];
    return uids
      .map((id) => {
        const t = totalScoreForPlayer(id, members);
        return { id, name: members[id]!.name, ...t };
      })
      .sort((a, b) => b.total - a.total);
  }, [members, uids]);

  const myPointsValue = useMemo((): { label: string; sub?: string } => {
    if (!uid || !me) return { label: "—" };
    if (room?.phase !== "results" && !room?.resultsRevealed) return { label: "—", sub: "earned when results are open" };
    const t = totalScoreForPlayer(uid, members);
    return { label: String(t.total) };
  }, [uid, me, room?.phase, room?.resultsRevealed, members]);

  // ——— Host actions ———
  async function goR1IntroToWriting() {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId), { phase: "r1_writing" as const });
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
      batch.update(doc(db, "rooms", roomId), { phase: "r2_intro" as const, r2EndsAt: null });
      await batch.commit();
    });
  }

  async function goR2IntroToCoding() {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId), { phase: "r2_coding" as const });
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
        phase: "r3_present" as const,
        r3AnswerRevealed: false,
      });
    });
  }

  async function hostDonePresenting() {
    await withBusy(async () => {
      if (!room?.r3CurrentPresenter) return;
      await updateDoc(doc(db, "rooms", roomId), { phase: "r3_guess" as const, r3AnswerRevealed: false });
    });
  }

  async function hostR3WaitToReveal() {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId), { phase: "r3_reveal" as const, r3AnswerRevealed: false });
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
        });
        return;
      }
      await updateDoc(doc(db, "rooms", roomId), {
        phase: "r3_pick" as const,
        r3PresentedUids: nextPresented,
        r3CurrentPresenter: null,
        r3PickedRevealed: false,
        r3AnswerRevealed: false,
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
    if (guess.length < 1) {
      setErr("Add a guess.");
      return;
    }
    const merged: Record<string, string> = { ...me.r3Guesses, [tUid]: guess };
    const nextMe = { ...me, r3Guesses: merged };
    const newMembers: Record<string, MemberDoc & { id: string }> = { ...members, [uid]: { ...nextMe, id: uid } };
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId, "members", uid), { r3Guesses: merged });
      if (allGuessedForTarget(newMembers, uids, tUid)) {
        await updateDoc(doc(db, "rooms", roomId), { phase: "r3_wait" as const });
      }
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

  const showPointsBar = room.phase === "results" && room.resultsRevealed;
  const isLastR3Reveal =
    (room.r3PresentedUids?.length ?? 0) + 1 >= uids.length && uids.length > 0;
  const topCta: { label: string; onAction: () => void; show: boolean; disabled?: boolean } | null = (() => {
    const p = room.phase;
    if (p === "r1_intro") {
      return { show: true, label: "Start round", onAction: goR1IntroToWriting };
    }
    if (p === "r1_waiting") {
      return { show: true, label: "Continue", onAction: goR1WaitToR2Intro };
    }
    if (p === "r2_intro") {
      return { show: true, label: "Start round", onAction: goR2IntroToCoding };
    }
    if (p === "r2_waiting") {
      return { show: true, label: "Continue", onAction: goR2WaitToR3Intro };
    }
    if (p === "r3_intro") {
      return { show: true, label: "Start round", onAction: goR3IntroToPick };
    }
    if (p === "r3_pick" && room.r3PickedRevealed !== true) {
      return { show: true, label: "Randomize", onAction: hostRandomizePresenter, disabled: busy };
    }
    if (p === "r3_present") {
      return { show: true, label: "Done presenting", onAction: hostDonePresenting, disabled: busy };
    }
    if (p === "r3_wait") {
      return { show: true, label: "Continue", onAction: hostR3WaitToReveal };
    }
    if (p === "r3_reveal" && !room.r3AnswerRevealed) {
      return { show: true, label: "Reveal", onAction: hostRevealAnswer, disabled: busy };
    }
    if (p === "r3_reveal" && room.r3AnswerRevealed) {
      return {
        show: true,
        label: isLastR3Reveal ? "View Standings" : "Continue",
        onAction: hostR3RevealContinue,
        disabled: busy,
      };
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
      <div className="figma-content shell-figma-inner">
        {showPointsBar && me && (
          <div className="mypoints-bar" role="status" aria-live="polite" style={{ marginBottom: 12 }}>
            <div>
              <div className="label">You · {me.name} · your points (total)</div>
              {myPointsValue.sub && <div className="label" style={{ fontSize: "0.75rem" }}>{myPointsValue.sub}</div>}
            </div>
            <div className="value">{myPointsValue.label}</div>
          </div>
        )}

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

        {room.phase === "r1_writing" && me && (
          <div className="figma-instruction-stack">
            <SessionPageLayout
              titleStart="Round 1 – "
              titleAccent="Create Prompt"
              subtitle={
                "Write a prompt of at least 10 words that describes a fun, one-screen app or tool with a clear purpose.\n" +
                "Everyone will have 2 minutes to write a prompt."
              }
            />
            <div className="figma-card">
              <p className="label">Your prompt (freeform)</p>
              <textarea
                value={r1Text}
                onChange={(e) => setR1Text(e.target.value)}
                maxLength={2000}
                disabled={me.r1Submitted}
                placeholder="What should someone else vibe-code? Be specific enough to be guessable later."
                rows={8}
              />
              {me.r1Submitted ? (
                <SessionWaitingBlock
                  title="You’re in"
                  subtitle="Wait for everyone to submit. The host will continue to Round 2 when the group is ready."
                />
              ) : (
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="figma-btn figma-btn-primary" type="button" disabled={busy} onClick={submitR1}>
                    Submit prompt
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {room.phase === "r1_waiting" && (
          <SessionWaitingBlock
            title="Waiting for the host"
            subtitle="The host can continue once everyone has submitted a prompt. Hang tight — Round 2 explains the vibe-coding round."
          />
        )}

        {room.phase === "r2_intro" && (
          <div className="figma-card figma-card--instruction">
            <SessionPageLayout
              titleStart="Round 2 – "
              titleAccent="Vibe code"
              subtitle={
                "You will receive a random prompt from another player. You have about " +
                (room.r2DurationMins ?? 12) +
                " minutes to build it in Cursor, then the group will guess prompts from screen shares."
              }
            />
          </div>
        )}

        {room.phase === "r2_coding" && me && (
          <div className="figma-instruction-stack">
            <SessionPageLayout
              titleStart="Build this – "
              titleAccent="Vibe in Cursor"
              subtitle="Time to Vibe Code in Cursor!"
            />
            <div className="figma-card">
              {assignee && me.r2ForUid ? (
                <>
                  <p className="label">Prompt to build (from {assignee.name}, not you)</p>
                  <div className="reveal" style={{ borderColor: "rgba(110,231,197,0.35)" }}>
                    {assignee.r1Prompt || "—"}
                  </div>
                  {me.r2VibeDone ? (
                    <SessionWaitingBlock
                      title="You’re done"
                      subtitle="Wait for everyone to tap I’m done. The host will then open Round 3 instructions."
                    />
                  ) : (
                    <div className="row" style={{ marginTop: 12 }}>
                      <button
                        className="figma-btn figma-btn-primary"
                        type="button"
                        disabled={busy}
                        onClick={r2VibeDoneClick}
                      >
                        I’m done
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">Waiting for assignment…</p>
              )}
            </div>
          </div>
        )}

        {room.phase === "r2_waiting" && (
          <SessionWaitingBlock
            title="Ready for screen shares"
            subtitle="The host will start Round 3: everyone shares their screen in turn, then the group guesses."
          />
        )}

        {room.phase === "r3_intro" && (
          <div className="figma-card figma-card--instruction">
            <SessionPageLayout
              titleStart="Round 3 – "
              titleAccent="Screen share & guess"
              subtitle="One at a time you’ll share your build in the meeting. Everyone else will try to guess the *original* prompt. For every word in your guess that matches the real prompt, you get a point. Most points at the end wins."
            />
          </div>
        )}

        {room.phase === "r3_pick" && (
          <div className="figma-card">
            <h2 className="figma-session-title" style={{ textAlign: "center", fontSize: "1.4rem" }}>
              Who’s up next
            </h2>
            <p className="figma-waiting-sub" style={{ textAlign: "center" }}>
              Host: tap <strong>Randomize</strong> in the top bar. Names already done this game won’t be picked again.
            </p>
          </div>
        )}

        {room.phase === "r3_present" && currentPresenter && room.r3PickedRevealed && (
          <div className="figma-card">
            <h2
              className="figma-session-title"
              style={{ textAlign: "center", fontSize: "2rem", lineHeight: 1.2 }}
            >
              Present: <span className="figma-session-title__accent">{currentPresenter.name}</span>
            </h2>
            <p className="figma-waiting-sub" style={{ textAlign: "center" }}>
              Share your screen in the video call, walk through the build, then the host continues.
            </p>
          </div>
        )}

        {room.phase === "r3_guess" && tUid && me && (
          <div className="figma-card">
            <h2 className="figma-card-title">Guess the original prompt</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              <strong>{members[tUid]?.name || "?"}</strong> just shared. What was their Round 1 prompt? You get points
              for words that match the real one.
            </p>
            {uid === tUid ? (
              <p className="muted" style={{ color: "var(--accent)" }}>
                You can’t guess your own prompt. Wait for the others to submit.
              </p>
            ) : (me.r3Guesses && me.r3Guesses[tUid] || "").trim() ? (
              <SessionWaitingBlock
                title="You’re in"
                subtitle="Wait for everyone to submit, then the host can continue to the reveal."
              />
            ) : (
              <>
                <label htmlFor="g-one" className="label">
                  Your guess
                </label>
                <textarea
                  id="g-one"
                  value={r3Line}
                  onChange={(e) => setR3Line(e.target.value)}
                  rows={4}
                  placeholder="Your best guess at their full prompt"
                />
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="figma-btn figma-btn-primary"
                    type="button"
                    disabled={busy}
                    onClick={submitR3Round}
                  >
                    Submit
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {room.phase === "r3_wait" && (
          <SessionWaitingBlock
            title="Waiting for the host"
            subtitle="When everyone is in, the host can continue to the reveal for this person."
          />
        )}

        {room.phase === "r3_reveal" && currentPresenter && (
          <div className="figma-card">
            <h2 className="figma-card-title" style={{ marginTop: 0 }}>
              {currentPresenter.name}’s round
            </h2>
            {room.r3AnswerRevealed ? (
              <>
                <p className="label">The real prompt</p>
                <div className="reveal" style={{ borderColor: "rgba(61,220,132,0.35)" }}>
                  <HighlightText as="div" text={answerText} target={answerText} />
                </div>
                <h3 className="label" style={{ marginTop: 16, marginBottom: 6 }}>
                  Guesses (highest match first; green = word in real prompt, +1 on match)
                </h3>
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
                    <div className="guess-reveal-line" key={gId} style={{ marginBottom: 10 }}>
                      <strong>
                        {guesser.name} — {matchPts} match pts
                      </strong>
                      <br />
                      {gText.trim() ? (
                        <HighlightText withPop as="span" text={gText} target={answerText} />
                      ) : (
                        <span className="muted">(no guess)</span>
                      )}
                    </div>
                  ))}
              </>
            ) : (
              <p className="muted" style={{ fontSize: "1.1rem", textAlign: "center", padding: "1rem 0" }}>
                The real prompt is hidden. Host: tap <strong>Reveal</strong> in the top bar.
              </p>
            )}
          </div>
        )}

        {room.phase === "results" && room.resultsRevealed && (
          <div className="figma-card">
            <h2>Final results</h2>
            {scores.length > 0 && <h2 style={{ marginTop: 12 }}>Podium</h2>}
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
            {room.podiumVisible === true && <h2 style={{ marginTop: 18 }}>Full rankings</h2>}
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
            {isHost && room.podiumVisible === true && (
              <p className="hint" style={{ marginTop: 10 }}>
                Auto = sum of word matches; adjust manual for fairness.
              </p>
            )}
            <h3 style={{ marginTop: 20, fontSize: 16 }}>Every prompt & all guesses (full table)</h3>
            {uids.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {uids
                  .map((authorId) => members[authorId])
                  .filter(Boolean)
                  .sort((a, b) => a!.name.localeCompare(b!.name))
                  .map((m) => {
                    if (!m) return null;
                    const authorId = m.id;
                    const answerKey = m.r1Prompt || "";
                    return (
                      <div key={authorId} style={{ marginBottom: "1.5rem" }}>
                        <h4 style={{ margin: "0 0 0.3rem" }}>{m.name}</h4>
                        <p className="label" style={{ marginBottom: 4 }}>
                          Actual prompt
                        </p>
                        <div className="reveal" style={{ borderColor: "rgba(61,220,132,0.35)", marginBottom: 8 }}>
                          <HighlightText as="div" text={answerKey} target={answerKey} />
                        </div>
                        <p className="label" style={{ margin: "0.3rem 0" }}>
                          What everyone guessed
                        </p>
                        {uids
                          .filter((gId) => gId !== authorId)
                          .map((gId) => {
                            const guesser = members[gId];
                            if (!guesser) return null;
                            const gText = (guesser.r3Guesses && guesser.r3Guesses[authorId]) || "";
                            return (
                              <div className="guess-reveal-line" key={gId} style={{ marginBottom: 6 }}>
                                <strong>{guesser.name}:</strong>{" "}
                                {gText.trim() ? (
                                  <HighlightText as="span" text={gText} target={answerKey} />
                                ) : (
                                  <span className="muted">(no guess)</span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

      </div>
      </main>

      <footer className="figma-footer figma-landing__chrome">Designed by Grace Sajjarotjana</footer>
    </div>
  );
}
