import { useCallback, useEffect, useRef } from "react";

const DEFAULT_MS = 700;

type Opts = { ms?: number; enabled?: boolean };

/**
 * Hold-to-activate. Pointer capture avoids losing the press to scroll.
 */
export function useLongPress(onLongPress: () => void, options: Opts = {}) {
  const { ms = DEFAULT_MS, enabled = true } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const cb = useRef(onLongPress);
  cb.current = onLongPress;

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clear(), [clear]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      longPressFired.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      clear();
      timerRef.current = setTimeout(() => {
        longPressFired.current = true;
        timerRef.current = null;
        cb.current();
      }, ms);
    },
    [enabled, ms, clear]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressFired.current) clear();
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [clear]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressFired.current) clear();
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [clear]
  );

  return { onPointerDown, onPointerUp, onPointerCancel };
}
