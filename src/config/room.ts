/** Single public workshop room — no user-facing code. Override with VITE_ROOM_ID in .env / CI. */
export function getPublicRoomId(): string {
  const v = import.meta.env.VITE_ROOM_ID;
  return (typeof v === "string" && v.trim() ? v.trim() : "vibe-coding-recess") as string;
}
