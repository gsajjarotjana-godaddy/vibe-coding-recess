import {
  type Firestore,
  collection,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import type { RoomDoc } from "./types";

export function createInitialRoomDoc(createdAt: number): RoomDoc {
  return {
    phase: "lobby",
    createdAt,
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

/**
 * Remove every member and reset the room to lobby. Next joiner (earliest) becomes host.
 */
export async function resetEntireSession(db: Firestore, roomId: string): Promise<void> {
  const membersCol = collection(db, "rooms", roomId, "members");
  const membersSnap = await getDocs(membersCol);
  const roomRef = doc(db, "rooms", roomId);
  const fresh = createInitialRoomDoc(Date.now());
  const batch = writeBatch(db);
  membersSnap.forEach((d) => {
    batch.delete(d.ref);
  });
  batch.set(roomRef, fresh);
  await batch.commit();
}
