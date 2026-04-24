import type { Timestamp } from "firebase/firestore";

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
  /** @deprecated R1 was timed; no longer used in new flow. */
  r1StartedAt: number | null;
  /** @deprecated R1 was timed. */
  r1DurationSec: number;
  r2DurationMins: number;
  /** R2 timebox optional; vibe-done flow does not require it. */
  r2EndsAt: number | null;
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
}

export interface MemberDoc {
  joinedAt?: Timestamp | { seconds: number; nanoseconds?: number };
  name: string;
  /** @deprecated R1 is freeform; keep for Firestore back-compat. */
  r1TemplateId: number;
  r1Prompt: string;
  r1Submitted: boolean;
  r2ForUid: string;
  r3Guesses: Record<string, string>;
  r3Submitted: boolean;
  manualPointDelta: number;
  /** R2: player tapped I’m done. */
  r2VibeDone?: boolean;
}

export interface RoomState {
  room: RoomDoc;
  members: Record<string, MemberDoc & { id: string }>;
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
    r1StartedAt: d.r1StartedAt != null ? (d.r1StartedAt as number) : null,
    r1DurationSec: typeof d.r1DurationSec === "number" ? d.r1DurationSec : 120,
    r2DurationMins: typeof d.r2DurationMins === "number" ? d.r2DurationMins : 12,
    r2EndsAt: d.r2EndsAt != null ? (d.r2EndsAt as number) : null,
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
    r2DurationMins: 12,
    r2EndsAt: null,
    presentationOrder: null,
    r3GuessingUnlocked: false,
    resultsRevealed: false,
    podiumVisible: false,
    r3CurrentPresenter: null,
    r3PresentedUids: [],
    r3PickedRevealed: false,
    r3AnswerRevealed: false,
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
