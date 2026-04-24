import type { Timestamp } from "firebase/firestore";

export type Phase = "lobby" | "r1" | "r2" | "r3_sharing" | "r3_guessing" | "results";

export interface RoomDoc {
  /** Legacy; host is derived from members by joinedAt. */
  hostId?: string;
  phase: Phase;
  createdAt: number;
  /** wall-clock ms when R1 started (for timer) */
  r1StartedAt: number | null;
  r1DurationSec: number;
  r2DurationMins: number;
  /** wall-clock ms when R2 should end */
  r2EndsAt: number | null;
  /** random order for who presents in Teams */
  presentationOrder: string[] | null;
  /** after host: done with screen shares */
  r3GuessingUnlocked: boolean;
  /** after host: show answers and scores */
  resultsRevealed: boolean;
  /** host only: show podium + full standings after the guess reveal walkthrough */
  podiumVisible?: boolean;
}

export interface MemberDoc {
  /** Server time on first write — used to pick host (earliest). */
  joinedAt?: Timestamp | { seconds: number; nanoseconds?: number };
  name: string;
  r1TemplateId: number;
  r1Prompt: string;
  r1Submitted: boolean;
  /** uid of the person whose Round 1 prompt this member must build in R2 */
  r2ForUid: string;
  /** for each other member’s uid, your guess of their original prompt */
  r3Guesses: Record<string, string>;
  r3Submitted: boolean;
  manualPointDelta: number;
}

export interface RoomState {
  room: RoomDoc;
  members: Record<string, MemberDoc & { id: string }>;
}
