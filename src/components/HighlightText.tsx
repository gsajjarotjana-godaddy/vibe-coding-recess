import { useMemo } from "react";
import { getScoringTokenSet, isWordInTargetSet } from "../lib/game";

type Props = {
  text: string;
  target: string;
  as?: "span" | "div";
  className?: string;
};

/**
 * Splits on whitespace; non-break segments are checked against the target’s scoring word set.
 */
export function HighlightText({ text, target, as: Tag = "span", className }: Props) {
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
            <span key={i} className="word-hit">
              {p}
            </span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </Tag>
  );
}
