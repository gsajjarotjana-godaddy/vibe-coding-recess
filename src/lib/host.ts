import type { Timestamp } from "firebase/firestore";
import type { MemberDoc } from "./types";

function joinTimeMs(m: MemberDoc & { id: string }): number {
  const j = m.joinedAt;
  if (!j) return Number.POSITIVE_INFINITY;
  if (typeof j === "object" && "toMillis" in j && typeof (j as Timestamp).toMillis === "function") {
    return (j as Timestamp).toMillis();
  }
  if (typeof j === "object" && "seconds" in j) {
    return (j as { seconds: number }).seconds * 1000;
  }
  if (typeof j === "number") return j;
  return Number.POSITIVE_INFINITY;
}

/** First joiner (earliest server time) is host. */
export function getHostMemberId(
  members: Record<string, MemberDoc & { id: string }>
): string | null {
  const list = Object.values(members);
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => joinTimeMs(a) - joinTimeMs(b));
  const first = sorted[0]!;
  if (joinTimeMs(first) === Number.POSITIVE_INFINITY) {
    return list.sort((a, b) => a.name.localeCompare(b.name))[0]!.id;
  }
  return first.id;
}
