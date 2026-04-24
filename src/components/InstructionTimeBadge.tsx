import { useEffect, useLayoutEffect, useState } from "react";

function formatMSS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type Props = { type: "live"; endAtMs: number } | { type: "static"; totalSeconds: number };

const LIVE_INTERVAL_MS = 200;

/**
 * Top-right time for R1 writing / R2 coding only (not on intro screens).
 * Live mode updates `now` on an interval so the display always re-renders.
 */
export function InstructionTimeBadge(props: Props) {
  const [now, setNow] = useState(() => Date.now());
  const liveEnd = props.type === "live" ? props.endAtMs : 0;

  useLayoutEffect(() => {
    if (props.type !== "live") return;
    setNow(Date.now());
  }, [props.type, liveEnd]);

  useEffect(() => {
    if (props.type !== "live") return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), LIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [props.type, liveEnd]);

  if (props.type === "static") {
    return <span className="figma-instruction-time">{formatMSS(props.totalSeconds)}</span>;
  }
  const endAt = props.endAtMs;
  if (!Number.isFinite(endAt)) {
    return <span className="figma-instruction-time">--:--</span>;
  }
  const remaining = Math.max(0, (endAt - now) / 1000);
  const remSec = Math.floor(remaining);
  const low = remSec < 60 && remSec > 0;
  const atZero = remSec <= 0;
  return (
    <span
      className={"figma-instruction-time" + (atZero || low ? " figma-instruction-time--low" : "")}
    >
      {formatMSS(remaining)}
    </span>
  );
}
