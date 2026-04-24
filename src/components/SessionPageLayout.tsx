import type { ReactNode } from "react";

type Props = {
  /** e.g. "Round 1 – " — or full title when `titlePlain` is set */
  titleStart: string;
  /** e.g. "Create Prompt" (Menlo accent). Ignored when `titlePlain` is true. */
  titleAccent: string;
  /** Entire title in one line, default (white) styling — no Menlo accent segment. */
  titlePlain?: boolean;
  /** Top-right, aligned with title (e.g. time badge) */
  headerRight?: ReactNode;
  /** Plain string (wrapped in a paragraph) or a custom node (e.g. bullet list). */
  subtitle?: ReactNode;
  children?: ReactNode;
  /** e.g. instruction cards */
  footerInCard?: ReactNode;
};

/**
 * Instruction title at 40px; accent segment in Menlo. Subtitle is white, left-aligned in global CSS.
 */
export function SessionPageLayout({
  titleStart,
  titleAccent,
  titlePlain = false,
  headerRight,
  subtitle,
  children,
  footerInCard,
}: Props) {
  return (
    <div className="figma-session-page">
      <div className="figma-session-head">
        {titlePlain ? (
          <h1 className="figma-session-title figma-session-title--plain">{titleStart}</h1>
        ) : (
          <h1 className="figma-session-title">
            {titleStart}
            <span className="figma-session-title__accent">{titleAccent}</span>
          </h1>
        )}
        {headerRight != null ? <div className="figma-session-head__tr">{headerRight}</div> : null}
      </div>
      {subtitle != null ? (
        typeof subtitle === "string" ? (
          <p className="figma-session-subtitle">{subtitle}</p>
        ) : (
          subtitle
        )
      ) : null}
      {children}
      {footerInCard}
    </div>
  );
}

type WaitProps = { title: string; subtitle: string; extra?: ReactNode };
export function SessionWaitingBlock({ title, subtitle, extra }: WaitProps) {
  return (
    <div className="figma-card figma-card--compact figma-waiting-block" role="status" aria-live="polite">
      <h2 className="figma-waiting-title">{title}</h2>
      <p className="figma-waiting-sub">{subtitle}</p>
      {extra}
    </div>
  );
}
