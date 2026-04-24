import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebase } from "./firebase";
import type { MemberDoc, RoomDoc, Phase } from "./lib/types";
import {
  EXAMPLE_PROMPTS,
  R1_TEMPLATES,
  buildR2Mapping,
  totalScoreForPlayer,
  shuffleInPlace,
} from "./lib/game";
import { getHostMemberId } from "./lib/host";
import { HighlightText } from "./components/HighlightText";

type Props = {
  roomId: string;
  onLeave: () => void;
};

function timeLeftMs(end: number | null, now: number): number {
  if (end == null) return 0;
  return Math.max(0, end - now);
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m ${r}s`;
  if (m > 0) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${r}s`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

const PLAYER_HUES = ["cyan", "pink", "lime"] as const;

function phaseLabel(phase: Phase): string {
  const map: Record<Phase, string> = {
    lobby: "Lobby",
    r1: "Round 1 — write your prompt (2:00 timer)",
    r2: "Round 2 — vibe code someone else’s prompt",
    r3_sharing: "Round 3 — present in this order (Teams), then go to guessing",
    r3_guessing: "Round 3 — one guess per person (submit once at the end)",
    results: "Reveal — then final podium (host)",
  };
  return map[phase] ?? phase;
}

export function RoomView({ roomId, onLeave }: Props) {
  const { db } = getFirebase();
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [members, setMembers] = useState<Record<string, MemberDoc & { id: string }>>({});
  const [now, setNow] = useState(() => Date.now());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [r1Text, setR1Text] = useState("");
  const [r3Local, setR3Local] = useState<Record<string, string>>({});

  const uid = getAuth().currentUser?.uid || "";
  const me = uid ? members[uid] : undefined;
  const hostMemberId = useMemo(() => getHostMemberId(members), [members]);
  const isHost = Boolean(hostMemberId && uid && hostMemberId === uid);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const u = onSnapshot(
      doc(db, "rooms", roomId),
      (snap) => {
        if (!snap.exists()) {
          setErr("Room no longer exists.");
          setRoom(null);
          return;
        }
        setRoom(snap.data() as RoomDoc);
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

  useEffect(() => {
    if (me?.r1Prompt) setR1Text(me.r1Prompt);
  }, [me?.r1Prompt, me?.id]);

  useEffect(() => {
    if (me?.r3Guesses) setR3Local({ ...me.r3Guesses });
  }, [me?.r3Guesses, me?.id, room?.phase]);

  const memberList = useMemo(
    () => Object.values(members).sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );
  const uids = useMemo(() => Object.keys(members), [members]);

  const r1EndAt = useMemo(() => {
    if (!room?.r1StartedAt) return null;
    return room.r1StartedAt + room.r1DurationSec * 1000;
  }, [room]);

  const r1Left = r1EndAt != null ? timeLeftMs(r1EndAt, now) : 0;
  const r2Left = room?.r2EndsAt != null ? timeLeftMs(room.r2EndsAt, now) : 0;

  const allR3In = useMemo(
    () => uids.length > 0 && uids.every((id) => members[id]?.r3Submitted),
    [uids, members]
  );

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
    if (!uid || !me) return { label: "—", sub: "earned when answers are shown" };
    if (!room?.resultsRevealed) return { label: "—", sub: "earned when answers are shown" };
    const t = totalScoreForPlayer(uid, members);
    return { label: String(t.total) };
  }, [uid, me, room?.resultsRevealed, members]);

  const showPointsHint = myPointsValue.label === "—";

  /** Authors in presentation order, else by name. */
  const authorOrder: string[] = useMemo(() => {
    if (room?.presentationOrder?.length) return room.presentationOrder.filter((id) => members[id]);
    return [...uids].sort((a, b) => (members[a]?.name || "").localeCompare(members[b]?.name || ""));
  }, [room?.presentationOrder, uids, members]);

  const withBusy = useCallback(
    async (fn: () => Promise<void>) => {
      setErr(null);
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  async function hostStartR1() {
    await withBusy(async () => {
      if (memberList.length < 2) {
        setErr("Need at least 2 people to start.");
        return;
      }
      await updateDoc(doc(db, "rooms", roomId), {
        phase: "r1" as const,
        r1StartedAt: Date.now(),
      });
    });
  }

  async function hostGoR2() {
    await withBusy(async () => {
      if (!room) return;
      const m = buildR2Mapping(uids);
      if (!m) {
        setErr("Need at least 2 players for a fair swap (no one gets their own prompt).");
        return;
      }
      const r2Mins = room.r2DurationMins ?? 12;
      const batch = writeBatch(db);
      uids.forEach((id) => {
        batch.update(doc(db, "rooms", roomId, "members", id), { r2ForUid: m[id]! });
      });
      batch.update(doc(db, "rooms", roomId), {
        phase: "r2" as const,
        r2EndsAt: Date.now() + r2Mins * 60_000,
        r1StartedAt: null,
      });
      await batch.commit();
    });
  }

  async function hostGoR3Sharing() {
    await withBusy(async () => {
      const order = shuffleInPlace([...uids]);
      await updateDoc(doc(db, "rooms", roomId), {
        phase: "r3_sharing" as const,
        r2EndsAt: null,
        presentationOrder: order,
        r3GuessingUnlocked: false,
      });
    });
  }

  async function hostUnlockGuessing() {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId), {
        phase: "r3_guessing" as const,
        r3GuessingUnlocked: true,
      });
    });
  }

  async function hostReveal() {
    await withBusy(async () => {
      if (!allR3In) {
        setErr("Not everyone has submitted their guesses yet.");
        return;
      }
      await updateDoc(doc(db, "rooms", roomId), {
        phase: "results" as const,
        resultsRevealed: true,
        podiumVisible: false,
      });
    });
  }

  async function hostShowPodium() {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId), { podiumVisible: true });
    });
  }

  async function submitR1() {
    if (!me) return;
    const text = r1Text.trim();
    if (text.length < 3) {
      setErr("Add a real prompt (a few words at least).");
      return;
    }
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId, "members", uid), {
        r1Prompt: text,
        r1Submitted: true,
      });
    });
  }

  async function submitR3() {
    if (!me) return;
    for (const oid of uids) {
      if (oid === uid) continue;
      if (!(r3Local[oid] || "").trim()) {
        setErr(`Add a guess for “${members[oid]?.name}”.`);
        return;
      }
    }
    await withBusy(async () => {
      const out: Record<string, string> = {};
      uids.forEach((oid) => {
        if (oid === uid) return;
        out[oid] = (r3Local[oid] || "").trim();
      });
      await updateDoc(doc(db, "rooms", roomId, "members", uid), {
        r3Guesses: out,
        r3Submitted: true,
      });
    });
  }

  async function setManual(mId: string, delta: number) {
    await withBusy(async () => {
      await updateDoc(doc(db, "rooms", roomId, "members", mId), {
        manualPointDelta: delta,
      });
    });
  }

  if (!room) {
    return (
      <div className="shell">
        <p className="muted">{err || "…"}</p>
        <button type="button" onClick={onLeave}>
          Back
        </button>
      </div>
    );
  }

  const template = me ? R1_TEMPLATES.find((t) => t.id === me.r1TemplateId) : null;
  const assignee = me && me.r2ForUid ? members[me.r2ForUid] : null;

  return (
    <div className="figma-app">
      <header className="figma-topbar figma-topbar--in-app">
        <div className="figma-brand">April Vibe Coding Recess</div>
        <div className="figma-phase-pill" title="Current round">
          {phaseLabel(room.phase)}
        </div>
        <div className="figma-topbar-actions">
          <button type="button" className="figma-ghost-link" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>
    <div className="figma-content shell-figma-inner">
      {me && (
        <div className="mypoints-bar" role="status" aria-live="polite">
          <div>
            <div className="label">You · {me.name} · your points (total)</div>
            {showPointsHint && myPointsValue.sub && (
              <div className="label" style={{ fontSize: "0.75rem" }}>{myPointsValue.sub}</div>
            )}
          </div>
          <div className="value">{myPointsValue.label}</div>
        </div>
      )}
      {isHost && <p className="host">You are the host — advance rounds and reveal results.</p>}

      {err && <p className="muted" style={{ color: "var(--err)" }}>{err}</p>}

      {room.phase === "lobby" && (
        <div className="figma-card">
          <h2 className="figma-card-title">Who’s in</h2>
          <div className="figma-player-grid" aria-label="Players in the room">
            {memberList.map((m, i) => {
              const hue = PLAYER_HUES[i % PLAYER_HUES.length]!;
              return (
                <div key={m.id} className={"figma-player-tile figma-player-tile--" + hue}>
                  <div className="figma-avatar" aria-hidden="true">
                    {initials(m.name)}
                  </div>
                  <div className="figma-player-name">
                    {m.name}
                    {hostMemberId && m.id === hostMemberId && (
                      <span className="figma-pill figma-pill--host"> host</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {isHost && (
            <div className="row" style={{ marginTop: "0.8rem" }}>
              <button className="figma-btn figma-btn-primary" type="button" disabled={busy} onClick={hostStartR1}>
                Start round 1 ({room.r1DurationSec / 60} min)
              </button>
            </div>
          )}
          <p className="hint" style={{ marginTop: "0.8rem" }}>
            When everyone is here, the host starts Round 1. Play music in Teams on your own — this app only shows the
            timer and prompts.
          </p>
        </div>
      )}

      {room.phase === "r1" && me && (
        <div className="figma-card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Round 1: your structured prompt</h2>
            {r1EndAt && <div className="timer">{formatMs(r1Left)}</div>}
          </div>
          {template && (
            <p style={{ fontSize: "1.1rem" }}>
              <strong>Your sentence to complete:</strong> {template.line}
            </p>
          )}
          <p className="label">Type your full prompt (what you’d want someone to build)</p>
          <textarea
            value={r1Text}
            onChange={(e) => setR1Text(e.target.value)}
            maxLength={2000}
            disabled={me.r1Submitted}
            placeholder="Finish the sentence, then add enough detail to be a fun 10–12 min build"
          />
          {isHost && (
            <p className="hint">
              As host, move to Round 2 when time is up (or when everyone is ready). You can leave the timer to run
              to zero first.
            </p>
          )}
          {!me.r1Submitted && (
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <button className="figma-btn figma-btn-primary" type="button" disabled={busy} onClick={submitR1}>
                Save prompt
              </button>
            </div>
          )}
          {me.r1Submitted && <p className="muted" style={{ color: "var(--accent)" }}>Your prompt is saved. Wait for the host to start Round 2.</p>}

          <h3 className="muted" style={{ marginTop: "1.2rem", fontSize: "0.9rem" }}>
            Example ideas
          </h3>
          <ul className="examples">
            {EXAMPLE_PROMPTS.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {isHost && (
            <div className="row" style={{ marginTop: "0.8rem" }}>
              <button className="figma-btn figma-btn-primary" type="button" disabled={busy} onClick={hostGoR2}>
                Start round 2 (assign prompts, no one gets their own)
              </button>
            </div>
          )}
        </div>
      )}

      {room.phase === "r2" && me && (
        <div className="figma-card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Round 2: build this prompt</h2>
            {room.r2EndsAt != null && <div className="timer">{formatMs(r2Left)}</div>}
          </div>
          <p className="hint">
            Work in your editor. Music / timer: run in your usual setup (Teams, OS timer, etc.).             Suggested:{" "}
            {room.r2DurationMins ?? 12} minutes.
          </p>
          {assignee && me.r2ForUid ? (
            <div>
              <p>
                <strong>Original author:</strong> {assignee.name} — you did <em>not</em> get your own idea.
              </p>
              <p className="label">What they were asked to write in Round 1 (structure + their text):</p>
              <div className="reveal" style={{ borderColor: "rgba(110,231,197,0.35)" }}>
                {R1_TEMPLATES.find((t) => t.id === assignee.r1TemplateId)?.line || "—"}
                <br />
                {assignee.r1Prompt}
              </div>
            </div>
          ) : (
            <p className="muted">Waiting for assignment…</p>
          )}
          {isHost && (
            <div className="row" style={{ marginTop: "0.8rem" }}>
              <select
                value={String(room.r2DurationMins ?? 12)}
                onChange={(e) =>
                  void withBusy(() =>
                    updateDoc(doc(db, "rooms", roomId), { r2DurationMins: Number(e.target.value) })
                  )
                }
                style={{ maxWidth: "160px" }}
                disabled={busy}
              >
                <option value="10">10 min</option>
                <option value="12">12 min</option>
                <option value="15">15 min</option>
                <option value="20">20 min</option>
              </select>
              <button className="figma-btn figma-btn-primary" type="button" disabled={busy} onClick={hostGoR3Sharing}>
                After builds: go to round 3 (presentation order)
              </button>
            </div>
          )}
        </div>
      )}

      {room.phase === "r3_sharing" && (
        <div className="figma-card">
          <h2>Round 3 — share screens in this order (Teams)</h2>
          <p className="hint">
            When everyone has presented and you are ready to collect guesses, the host unlocks the guessing form on
            everyone’s devices. One submission per person, covering <strong>all</strong> other players.
          </p>
          {room.presentationOrder && room.presentationOrder.length > 0 && (
            <ol style={{ lineHeight: 1.6 }}>
              {room.presentationOrder.map((mId) => {
                const m = members[mId];
                if (!m) return null;
                return (
                  <li key={mId}>
                    <strong>{m.name}</strong>
                    {isHost && (
                      <div>
                        <span className="muted" style={{ fontSize: "0.85rem" }}> Facilitator: their Round 1 line + text</span>
                        <div className="reveal" style={{ marginTop: 6 }}>
                          {R1_TEMPLATES.find((t) => t.id === m.r1TemplateId)?.line}
                          <br />
                          {m.r1Prompt}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {!isHost && (
            <p className="hint" style={{ marginTop: 8 }}>
              You only see the <strong>order</strong> here. Watch each share in Teams — the site does not list everyone’s secret prompts to avoid spoiling the final guesses.
            </p>
          )}
          {isHost && (
            <div className="row" style={{ marginTop: "0.8rem" }}>
              <button className="figma-btn figma-btn-primary" type="button" disabled={busy} onClick={hostUnlockGuessing}>
                We’re done presenting — open guessing
              </button>
            </div>
          )}
        </div>
      )}

      {room.phase === "r3_guessing" && me && (
        <div className="figma-card">
          <h2>Guess the original prompt</h2>
          <p className="hint">
            You each write what you think was the <strong>author’s</strong> full Round-1 text for every other
            person — once. Submit in one go. Host reveals answers when everyone is done.
          </p>
          {me.r3Submitted && (
            <p className="muted" style={{ color: "var(--accent)" }}>
              Your guesses are locked in. Wait for the host to reveal and score.
            </p>
          )}
          {uids
            .filter((oid) => oid !== uid)
            .map((oid) => {
              const p = members[oid];
              if (!p) return null;
              return (
                <div className="guess-box" key={oid}>
                  <label htmlFor={"g-" + oid}>
                    What was <strong>{p.name}</strong>’s original full prompt? (include their structure line if you
                    like)
                  </label>
                  <textarea
                    id={"g-" + oid}
                    value={r3Local[oid] ?? ""}
                    onChange={(e) => setR3Local((o) => ({ ...o, [oid]: e.target.value }))}
                    disabled={me.r3Submitted}
                    placeholder="Your guess of their Round 1 text"
                  />
                </div>
              );
            })}
          {!me.r3Submitted && (
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <button className="figma-btn figma-btn-primary" type="button" disabled={busy} onClick={submitR3}>
                Submit all guesses
              </button>
            </div>
          )}
          <p className="muted" style={{ marginTop: "0.6rem" }}>
            {uids.filter((i) => members[i]?.r3Submitted).length}/{uids.length} submitted
          </p>
          {isHost && (
            <div className="row" style={{ marginTop: "0.6rem" }}>
              <button
                className="figma-btn figma-btn-primary"
                type="button"
                disabled={busy || !allR3In}
                onClick={hostReveal}
                title={!allR3In ? "Wait for all submissions" : "Show every guess with labels, then scores"}
              >
                Reveal all guesses
              </button>
            </div>
          )}
        </div>
      )}

      {room.phase === "results" && room.resultsRevealed && (
        <div className="figma-card">
          <h2>Guess reveal</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            For each author: the <strong>real</strong> prompt is on top. Words that count for points are{" "}
            <span className="word-hit" style={{ fontSize: "0.85em" }}>green</span> in the answer and in each
            person’s guess. The podium and full standings are only at the very end — the host shows them when
            everyone’s ready.
          </p>

          {authorOrder.map((authorId) => {
            const m = members[authorId];
            if (!m) return null;
            const tLine = R1_TEMPLATES.find((t) => t.id === m.r1TemplateId)?.line || "";
            const answerKey = m.r1Prompt || "";
            return (
              <div key={authorId} style={{ marginBottom: "1.75rem" }}>
                <h3>
                  {m.name}
                  <span className="muted" style={{ fontSize: "0.85rem" }}> — true prompt &amp; every guess</span>
                </h3>
                <p className="label">Actual prompt (structure + their text) — matchable words highlighted</p>
                <div className="reveal" style={{ borderColor: "rgba(61,220,132,0.35)" }}>
                  <div style={{ marginBottom: "0.4rem" }}>
                    <HighlightText as="div" text={tLine} target={answerKey} />
                  </div>
                  <HighlightText as="div" text={answerKey} target={answerKey} />
                </div>
                <p className="label" style={{ marginTop: "0.9rem" }}>
                  What everyone guessed (name + guess; green = word appears in the real prompt text above)
                </p>
                {uids
                  .filter((gId) => gId !== authorId)
                  .map((gId) => {
                    const guesser = members[gId];
                    if (!guesser) return null;
                    const gText = (guesser.r3Guesses && guesser.r3Guesses[authorId]) || "";
                    return (
                      <div className="guess-reveal-line" key={gId}>
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

          {room.podiumVisible !== true && isHost && (
            <div className="row" style={{ marginTop: "1rem" }}>
              <button className="figma-btn figma-btn-primary" type="button" disabled={busy} onClick={hostShowPodium}>
                Show final podium &amp; full standings
              </button>
            </div>
          )}
          {!isHost && room.podiumVisible !== true && (
            <p className="muted" style={{ marginTop: 12 }}>The host will show the podium and full list when the group is ready.</p>
          )}

          {room.podiumVisible === true && scores.length > 0 && <h2 style={{ marginTop: "1.5rem" }}>Podium (total points)</h2>}
          {room.podiumVisible === true && scores.length > 0 && (
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
            <>
              <h2>Full rankings</h2>
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
              {isHost && (
                <p className="hint" style={{ marginTop: 10 }}>
                  Adjust manual points; totals recalc. Auto = sum of word matches across your guesses of others’
                  prompts.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="figma-card figma-card--players" style={{ marginTop: 12 }}>
        <h3>Players in room</h3>
        <ul className="members" style={{ margin: 0 }}>
          {memberList.map((m) => (
            <li key={m.id}>
              <span>{m.name}</span>
              {m.r1Submitted && <span className="figma-pill figma-pill--small"> R1 in</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
    </div>
  );
}
