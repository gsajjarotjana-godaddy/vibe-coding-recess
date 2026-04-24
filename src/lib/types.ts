import type { Timestamp } from "firebase/firestore";

/**
 * Custom Firestore fields may be stored as a number (ms) or a Timestamp. Normalize to epoch ms.
 */
export function firestoreNumberOrTimeToMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null) {
    const t = v as { toMillis?: () => number; seconds?: number; _seconds?: number; nanoseconds?: number };
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000 + (t.nanoseconds != null ? t.nanoseconds / 1e6 : 0);
    if (typeof t._seconds === "number") return t._seconds * 1000;
  }
  return null;
}

/**
 * Coarse game step. Legacy values removed from active flow; old rooms in Firestore
 * are migrated in RoomView on load if needed.
 */
export type Phase =
  | "lobby"
  | "r1_intro"
  | "r1_writing"
  | "r1_waiting"
  | "r2_intro"
  | "r2_coding"
  | "r2_waiting"
  | "r3_intro"
  | "r3_pick"
  | "r3_present"
  | "r3_guess"
  | "r3_wait"
  | "r3_reveal"
  | "results";

export interface RoomDoc {
  hostId?: string;
  phase: Phase;
  createdAt: number;
  /** All clients join RoomView when true (host set on Let’s start). */
  sessionOpen: boolean;
  /** R1: epoch ms when the current 2:00 window started (intro and/or writing). */
  r1StartedAt: number | null;
  r1DurationSec: number;
  r2DurationMins: number;
  /** R2 build deadline (epoch ms), set when coding phase starts. */
  r2EndsAt: number | null;
  /** R2 intro: epoch ms when the “time budget” countdown for this page started. */
  r2IntroAt: number | null;
  /** @deprecated use presentedUids + r3 pick loop. */
  presentationOrder: string[] | null;
  r3GuessingUnlocked: boolean;
  resultsRevealed: boolean;
  podiumVisible: boolean;
  /** Who is currently / was just picked to present (and is guess target for R3 round). */
  r3CurrentPresenter: string | null;
  /** Uids that completed the full present→reveal cycle. */
  r3PresentedUids: string[];
  /** True after host randomizes a presenter on r3_pick. */
  r3PickedRevealed: boolean;
  /** In r3_reveal: true after host shows the real prompt. */
  r3AnswerRevealed: boolean;
  /** R3 guess round: wall-clock deadline (epoch ms) for the 1:00 window. */
  r3GuessEndsAt: number | null;
}

export interface MemberDoc {
  joinedAt?: Timestamp | { seconds: number; nanoseconds?: number };
  name: string;
  /** @deprecated R1 is freeform; keep for Firestore back-compat. */
  r1TemplateId: number;
  r1Prompt: string;
  r1Submitted: boolean;
  r2ForUid: string;
  /** R2: if you missed the derangement, a random example prompt to build. */
  r2FallbackPrompt?: string;
  /** R3: joined after R2; can guess but is not picked to present. */
  r3SkipSharing?: boolean;
  r3Guesses: Record<string, string>;
  r3Submitted: boolean;
  manualPointDelta: number;
  /** R2: player tapped I’m done. */
  r2VibeDone?: boolean;
  /** R3: current presenter tapped Continue on the guess screen. */
  r3PresentRoundAck?: boolean;
}

export interface RoomState {
  room: RoomDoc;
  members: Record<string, MemberDoc & { id: string }>;
}

/**
 * Firestore may still have r2DurationMins: 12 from the old default; the build window is now 10.
 * Map only that legacy value so custom values (if ever set) are preserved.
 */
function normalizeR2DurationMins(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 10;
  if (raw === 12) return 10;
  return raw;
}

/** Normalize older Firestore rooms into the new shape (best-effort). */
export function migrateRoomDoc(d: Record<string, unknown> | null): RoomDoc {
  if (!d) {
    return createDefaultRoomForMigration();
  }
  const phase = (d.phase as Phase) || "lobby";
  const base: RoomDoc = {
    phase: migrateOldPhase(phase) as Phase,
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
    sessionOpen: Boolean(d.sessionOpen),
    r1StartedAt: firestoreNumberOrTimeToMs(d.r1StartedAt),
    r1DurationSec: typeof d.r1DurationSec === "number" ? d.r1DurationSec : 120,
    r2DurationMins: normalizeR2DurationMins(d.r2DurationMins),
    r2EndsAt: firestoreNumberOrTimeToMs(d.r2EndsAt),
    r2IntroAt: firestoreNumberOrTimeToMs(d.r2IntroAt),
    presentationOrder: Array.isArray(d.presentationOrder) ? d.presentationOrder : null,
    r3GuessingUnlocked: Boolean(d.r3GuessingUnlocked),
    resultsRevealed: Boolean(d.resultsRevealed),
    podiumVisible: d.podiumVisible != null ? Boolean(d.podiumVisible) : false,
    r3CurrentPresenter:
      typeof d.r3CurrentPresenter === "string" || d.r3CurrentPresenter === null
        ? (d.r3CurrentPresenter as string | null)
        : null,
    r3PresentedUids: Array.isArray(d.r3PresentedUids) ? (d.r3PresentedUids as string[]) : [],
    r3PickedRevealed: Boolean(d.r3PickedRevealed),
    r3AnswerRevealed: Boolean(d.r3AnswerRevealed),
    r3GuessEndsAt: firestoreNumberOrTimeToMs(d.r3GuessEndsAt),
  };
  if (d.hostId != null) base.hostId = d.hostId as string;
  return base;
}

function createDefaultRoomForMigration(): RoomDoc {
  return {
    phase: "lobby",
    createdAt: Date.now(),
    sessionOpen: false,
    r1StartedAt: null,
    r1DurationSec: 120,
    r2DurationMins: 10,
    r2EndsAt: null,
    r2IntroAt: null,
    presentationOrder: null,
    r3GuessingUnlocked: false,
    resultsRevealed: false,
    podiumVisible: false,
    r3CurrentPresenter: null,
    r3PresentedUids: [],
    r3PickedRevealed: false,
    r3AnswerRevealed: false,
    r3GuessEndsAt: null,
  };
}

function migrateOldPhase(phase: string): Phase {
  const map: Record<string, Phase> = {
    r1: "r1_writing",
    r2: "r2_coding",
    r3_sharing: "r3_present",
    r3_guessing: "r3_guess",
  };
  if (map[phase]) return map[phase]!;
  /** R1: host continues from the waiting grid; no separate “waiting for host” phase. */
  if (phase === "r1_waiting") return "r1_writing";
  if (phase === "lobby" || phase === "results") return phase as Phase;
  if (
    (phase as Phase) &&
    [
      "r1_intro",
      "r1_writing",
      "r1_waiting",
      "r2_intro",
      "r2_coding",
      "r2_waiting",
      "r3_intro",
      "r3_pick",
      "r3_present",
      "r3_guess",
      "r3_wait",
      "r3_reveal",
    ].includes(phase as string)
  ) {
    return phase as Phase;
  }
  return "lobby";
}
