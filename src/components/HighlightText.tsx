import { useMemo } from "react";
import { getScoringTokenSet, isWordInTargetSet } from "../lib/game";

type Props = {
  text: string;
  target: string;
  as?: "span" | "div";
  className?: string;
  /** +1 pop animation on each matched word (reveal view) */
  withPop?: boolean;
};

/**
 * Splits on whitespace; non-break segments are checked against the target’s scoring word set.
 */
export function HighlightText({ text, target, as: Tag = "span", className, withPop }: Props) {
  const set = useMemo(() => getScoringTokenSet(target), [target]);
  const parts = text.split(/(\s+)/);

  return (
    <Tag className={className}>
      {parts.map((p, i) => {
        if (p === "") return null;
        if (/^\s+$/.test(p)) return <span key={i}>{p}</span>;
        const match = isWordInTargetSet(p, set);
        if (match) {
          return (
            <span key={i} className={withPop ? "word-hit word-hit--pop" : "word-hit"}>
              {p}
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </Tag>
  );
}
