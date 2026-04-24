import type { ReactNode } from "react";

type Props = {
  /** e.g. "Round 1 – " */
  titleStart: string;
  /** e.g. "Create Prompt" (rendered in Menlo accent) */
  titleAccent: string;
  subtitle?: string;
  children?: ReactNode;
  /** e.g. instruction cards */
  footerInCard?: ReactNode;
};

/**
 * Instruction title at 40px; accent segment in Menlo. Subtitle is white, left-aligned in global CSS.
 */
export function SessionPageLayout({ titleStart, titleAccent, subtitle, children, footerInCard }: Props) {
  return (
    <div className="figma-session-page">
      <h1 className="figma-session-title">
        {titleStart}
        <span className="figma-session-title__accent">{titleAccent}</span>
      </h1>
      {subtitle ? <p className="figma-session-subtitle">{subtitle}</p> : null}
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
