import type { MemberDoc } from "./types";

/** R1: minimum words for a valid freeform prompt. */
export const R1_MIN_WORDS = 10;

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function allGuessedForTarget(
  members: Record<string, MemberDoc & { id: string }>,
  uids: string[],
  targetUid: string
): boolean {
  return uids
    .filter((id) => id !== targetUid)
    .every((id) => (members[id]?.r3Guesses?.[targetUid] || "").trim().length > 0);
}

export function pickNextPresenter(uids: string[], presentedUids: string[]): string | null {
  const pool = uids.filter((u) => !presentedUids.includes(u));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export const R1_TEMPLATES: { id: number; line: string }[] = [
  { id: 0, line: "A single-page app that helps people ___" },
  { id: 1, line: "A tiny tool that makes ___ feel less overwhelming" },
  { id: 2, line: "A playful UI that teaches beginners how to ___" },
  { id: 3, line: "A dashboard that shows ___ in a calm, simple way" },
  { id: 4, line: "A micro-app for tracking ___ with zero setup" },
  { id: 5, line: "A form alternative that makes ___ actually fun" },
  { id: 6, line: "A habit helper that nudges you to ___" },
  { id: 7, line: "A generator that spits out ___ on demand" },
];

export const EXAMPLE_PROMPTS: string[] = [
  "A 3-button Pomodoro with confetti when a session ends",
  "A one-screen weather strip with a moody gradient background",
  "A counter for “cups of water today” with a tiny plant that grows",
  "A random lunch picker that only uses emojis and checkboxes",
];

const STOP = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "that", "this", "it", "is", "are", "be", "as", "at", "by", "from",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOP.has(t));
}

/** Words from the real prompt that count for scoring and highlighting. */
export function getScoringTokenSet(target: string): Set<string> {
  return new Set(tokenize(target));
}

/** True if a visible word token matches a scoring target token. */
export function isWordInTargetSet(rawWord: string, set: Set<string>): boolean {
  const n = rawWord
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!n) return false;
  return set.has(n);
}

/** Points = count of unique target tokens that appear in guess (rough word match). */
export function scoreGuess(guess: string, target: string): number {
  const g = new Set(tokenize(guess));
  if (g.size === 0) return 0;
  const t = new Set(tokenize(target));
  if (t.size === 0) return 0;
  let hit = 0;
  for (const w of t) {
    if (g.has(w)) hit++;
  }
  return hit;
}

export function totalScoreForPlayer(
  guesserId: string,
  members: Record<string, MemberDoc & { id: string }>
): { auto: number; manual: number; total: number } {
  const me = members[guesserId];
  if (!me) return { auto: 0, manual: 0, total: 0 };
  const uids = Object.keys(members);
  let auto = 0;
  for (const targetId of uids) {
    if (targetId === guesserId) continue;
    const target = members[targetId];
    const g = (me.r3Guesses && me.r3Guesses[targetId]) || "";
    auto += scoreGuess(g, target.r1Prompt || "");
  }
  const manual = me.manualPointDelta || 0;
  return { auto, manual, total: auto + manual };
}

/**
 * Returns a derangement: perm[i] !== i for all i, where perm maps index -> index.
 * Member at uids[i] receives prompt of uids[perm[i]].
 */
export function randomDerangement(n: number): number[] | null {
  if (n < 2) return null;
  if (n === 2) return [1, 0];
  for (let attempt = 0; attempt < 1000; attempt++) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (a[i] === i) {
        ok = false;
        break;
      }
    }
    if (ok) return a;
  }
  return null;
}

export function buildR2Mapping(uids: string[]): Record<string, string> | null {
  const perm = randomDerangement(uids.length);
  if (!perm) return null;
  const m: Record<string, string> = {};
  uids.forEach((uid, i) => {
    m[uid] = uids[perm[i]!]!;
  });
  return m;
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVW23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
