/**
 * Figma 891:7777 — all positions/sizes in artboard 1440×1024, expressed as
 * 100vw / 100dvh so decor stays pinned to the viewport (edges follow screen edges
 * on resize) instead of a pre-scaled centered artboard.
 */
import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { publicAsset } from "./lib/publicAsset";

const FLOAT_N = 12;
/**
 * Drift in transform: x in vw, y in dvh. Kept small so every anchored icon (anywhere on
 * the artboard) can wander without being translated off-screen. Large values (e.g. ±100)
 * add to absolute position, so a corner + max drift leaves the icon completely outside the viewport.
 */
const ROAM_VW = 6;
const ROAM_DVH = 5;
/** Scales position/rotation integration; keep low for slow, smooth drift. */
const DRIFT_SPEED = 0.22;
/** Random acceleration (lower = gentler curves, less jitter). */
const DRIFT_ACCEL = 0.75;
/** Exponential damping on horizontal/vertical velocity each step (smoother than hard noise alone). */
const DRIFT_VEL_DAMP = 1.35;
/** Gentler spin: lower noise on vr and slightly stronger decay in the loop. */
const DRIFT_ROT_ACCEL = 0.18;
const DRIFT_ROT_DECAY = 0.24;
/** Rare small nudges — keep low for smooth motion. */
const JOLT_CHANCE = 0.012;
const JOLT_STRENGTH = 0.32;
/** Enforced |velocity| and |angular step| so every icon moves at the same pace (path still independent). */
const DRIFT_PACE = 0.2;
const DRIFT_ROT_PACE = 0.04;

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Body = { x: number; y: number; r: number; vx: number; vy: number; vr: number; rand: () => number; mx: number; my: number };

/** After physics noise, all floaters use the same speed; `u` picks a direction if the vector is ~0. */
function applyDriftPace2D(vx: number, vy: number, pace: number, u: () => number) {
  const m = Math.hypot(vx, vy);
  if (m < 1e-7) {
    const a = u() * Math.PI * 2;
    return { vx: Math.cos(a) * pace, vy: Math.sin(a) * pace };
  }
  const k = pace / m;
  return { vx: vx * k, vy: vy * k };
}

function applyDriftPace1D(v: number, pace: number, u: () => number) {
  if (Math.abs(v) < 1e-6) return (u() - 0.5 >= 0 ? 1 : -1) * pace;
  return (v / Math.abs(v)) * pace;
}

const FW = 1440;
const FH = 1024;

const xl = (x: number) => `calc(100vw * ${x} / ${FW})` as const;
const yt = (y: number) => `calc(100dvh * ${y} / ${FH})` as const;
const wv = (w: number) => `calc(100vw * ${w} / ${FW})` as const;
const hv = (h: number) => `calc(100dvh * ${h} / ${FH})` as const;

const abs = (top: number, left: number, width: number, height: number): CSSProperties => ({
  position: "absolute",
  top: yt(top),
  left: xl(left),
  width: wv(width),
  height: hv(height),
});

const flex: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const fillImg: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "fill" as const,
  maxWidth: "none",
};

/** right-line.svg — left:-15 with 100% width left ~15px empty inside the rot box; left:0 fills the box edge-to-edge */
const vector1Img: CSSProperties = {
  position: "absolute",
  top: "-20px",
  left: 0,
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "fill" as const,
  maxWidth: "none",
  transform: "rotate(18deg)",
};

/** vector stack outer — fixed px; small-asterisk is positioned inside so it follows right bleed (891:7777) */
const VECTOR_OUTER_FIGMA_W = 301.779;
const VECTOR_OUTER_FIGMA_TOP = 147.99;
/* Figma x of right-line outer left = 1440 − W; small-asterisk frame x = 1263 → offset inside outer */
const UNION4_FIGMA_LEFT = 1263;
const UNION4_FIGMA_TOP = 175;
const union4OffsetX = UNION4_FIGMA_LEFT - (FW - VECTOR_OUTER_FIGMA_W);
const union4OffsetY = UNION4_FIGMA_TOP - VECTOR_OUTER_FIGMA_TOP;
/* Artboard-px sizes — no vw/vh so the icon does not grow/shrink on resize */
const UNION4_FRAME_PX = 67.352;
const UNION4_INNER_PX = 53.045;

const vectorOuterBox: CSSProperties = {
  position: "fixed",
  right: "-24px",
  left: "auto",
  top: yt(VECTOR_OUTER_FIGMA_TOP),
  width: `${VECTOR_OUTER_FIGMA_W}px`,
  height: "371.899px",
  boxSizing: "border-box",
  pointerEvents: "none",
  zIndex: 0,
};

const vectorGroupInner: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
};

/** 891:7862 small-asterisk — fixed px (no vw/vh) inside vector frame; still follows vector + right bleed */
const union4Wrap: CSSProperties = {
  position: "absolute",
  top: `${union4OffsetY}px`,
  left: `${union4OffsetX}px`,
  width: `${UNION4_FRAME_PX}px`,
  height: `${UNION4_FRAME_PX}px`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 1,
};

const vectorRotBox: CSSProperties = {
  width: "222.135px",
  height: "323.696px",
  flexShrink: 0,
  /* Pivot on right: -15.78° no longer pulls the art inward from the viewport edge */
  transform: "rotate(-15.78deg)",
  transformOrigin: "100% 50%",
  position: "relative",
  overflow: "visible",
};

/** 273×344 left line — fixed px, no vw/vh scale (same pattern as right-line outer) */
const VECTOR2_FIGMA_W = 273;
const VECTOR2_FIGMA_H = 344;
const vector2Box: CSSProperties = {
  position: "fixed",
  left: "-24px",
  right: "auto",
  top: "auto",
  bottom: 0,
  width: `${VECTOR2_FIGMA_W}px`,
  height: `${VECTOR2_FIGMA_H}px`,
  boxSizing: "border-box",
  pointerEvents: "none",
  zIndex: 0,
};

/** 891:7787 blue outline plus — group anchor; solid circle offset stays tied to this */
const BLUE_OUTLINE_PLUS_FIGMA = { x: 1159.04, y: 501 } as const;
/* Offset of solid circle from blue’s top-left (Figma 1440× space + px); moves with `xl(1159.04)` */
const SOLID_CIRCLE_DX = 920 - BLUE_OUTLINE_PLUS_FIGMA.x;
const SOLID_CIRCLE_DY = 491 - BLUE_OUTLINE_PLUS_FIGMA.y; /* 491 – solid vs 501 – blue (px) */
const solidCircleFromBlue: CSSProperties = {
  position: "absolute",
  top: `${SOLID_CIRCLE_DY}px`,
  left: `calc(100vw * ${SOLID_CIRCLE_DX} / ${FW} + 152px)`,
  width: "14px",
  height: "14px",
  boxSizing: "border-box",
};

/** One duplicate per floating icon — % positions sit above / below the centered title + name field */
type ScatteredKind = "green" | "blue" | "solid" | "pink" | "pinkSolid" | "ring";

const scatteredClones: Array<{
  id: string;
  kind: ScatteredKind;
  top: string;
  left?: string;
  right?: string;
  size: number;
  rot?: number;
}> = [
  { id: "d-green", kind: "green", top: "72%", right: "4%", size: 40 },
  { id: "d-blue", kind: "blue", top: "6%", right: "4%", size: 29 },
  { id: "d-solid", kind: "solid", top: "18%", left: "48%", size: 11 },
  { id: "d-pink", kind: "pink", top: "71%", left: "4%", size: 31, rot: -28 },
  { id: "d-ring", kind: "ring", top: "80%", right: "6%", size: 23 },
  /* mid-height, right side */
  { id: "d-pink-solid", kind: "pinkSolid", top: "45%", right: "6%", size: 26 },
];

function scatterPos(c: (typeof scatteredClones)[0]): CSSProperties {
  const p: CSSProperties = {
    position: "absolute",
    top: c.top,
    boxSizing: "border-box",
    pointerEvents: "none",
  };
  if (c.right != null) {
    p.left = "auto";
    p.right = c.right;
  } else {
    p.left = c.left;
  }
  return p;
}

type FigmaHomeDecorProps = {
  /**
   * When true, floating icons do not drift (in-session “flow” pages).
   * Home/lobby use default (animated). Waiting-style screens pass false to enable drift.
   */
  staticFloat?: boolean;
};

export function FigmaHomeDecor({ staticFloat = false }: FigmaHomeDecorProps) {
  const floatEls = useRef<(HTMLDivElement | null)[]>([]);
  const bodies = useRef<Body[] | null>(null);

  const setFloatRef = useCallback((i: number) => (el: HTMLDivElement | null) => {
    floatEls.current[i] = el;
  }, []);

  useEffect(() => {
    if (bodies.current == null || bodies.current.length !== FLOAT_N) {
      bodies.current = Array.from({ length: FLOAT_N }, (_, i) => {
        const u = mulberry32(0x1f2a3b4c + i * 2654435761);
        const a0 = u() * Math.PI * 2;
        return {
          x: (u() - 0.5) * 2 * ROAM_VW,
          y: (u() - 0.5) * 2 * ROAM_DVH,
          r: (u() - 0.5) * 0.4,
          vx: Math.cos(a0) * DRIFT_PACE,
          vy: Math.sin(a0) * DRIFT_PACE,
          vr: (u() > 0.5 ? 1 : -1) * DRIFT_ROT_PACE,
          rand: mulberry32(0x9e37 + i * 999983),
          mx: ROAM_VW,
          my: ROAM_DVH,
        };
      });
    }
    if (staticFloat) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const B = bodies.current;
    let last = performance.now();
    let h = 0;
    const tick = (t: number) => {
      const raw = (t - last) / 1000;
      const dt = Math.min(0.04, Math.max(0, raw));
      last = t;
      for (let i = 0; i < FLOAT_N; i++) {
        const p = B[i]!;
        const u = p.rand;
        const s = DRIFT_SPEED;
        p.vx += (u() - 0.5) * DRIFT_ACCEL * dt * s;
        p.vy += (u() - 0.5) * DRIFT_ACCEL * dt * s;
        p.vr += (u() - 0.5) * DRIFT_ROT_ACCEL * dt * s;
        p.vx *= Math.exp(-DRIFT_VEL_DAMP * dt);
        p.vy *= Math.exp(-DRIFT_VEL_DAMP * dt);
        if (u() < JOLT_CHANCE) {
          p.vx += (u() - 0.5) * 0.65 * JOLT_STRENGTH;
          p.vy += (u() - 0.5) * 0.55 * JOLT_STRENGTH;
        }
        const p2 = applyDriftPace2D(p.vx, p.vy, DRIFT_PACE, u);
        p.vx = p2.vx;
        p.vy = p2.vy;
        p.vr *= 1 - DRIFT_ROT_DECAY * dt;
        p.vr = applyDriftPace1D(p.vr, DRIFT_ROT_PACE, u);
        p.x += p.vx * s;
        p.y += p.vy * s;
        p.r += p.vr * s;
        if (p.x > p.mx) {
          p.x = p.mx;
          p.vx = -Math.abs(p.vx) * (0.4 + u() * 0.3) - u() * 0.2 + (u() - 0.5) * 0.35;
        } else if (p.x < -p.mx) {
          p.x = -p.mx;
          p.vx = Math.abs(p.vx) * (0.4 + u() * 0.3) + u() * 0.2 + (u() - 0.5) * 0.35;
        }
        if (p.y > p.my) {
          p.y = p.my;
          p.vy = -Math.abs(p.vy) * (0.4 + u() * 0.3) - u() * 0.15 + (u() - 0.5) * 0.3;
        } else if (p.y < -p.my) {
          p.y = -p.my;
          p.vy = Math.abs(p.vy) * (0.4 + u() * 0.3) + u() * 0.15 + (u() - 0.5) * 0.3;
        }
        p.r = Math.max(-1.1, Math.min(1.1, p.r));
        const el = floatEls.current[i];
        if (el) el.style.transform = `translate3d(${p.x}vw, ${p.y}dvh, 0) rotate(${p.r}deg)`;
      }
      h = requestAnimationFrame(tick);
    };
    h = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(h);
  }, [staticFloat]);

  return (
    <div
      className={"figma-deco-root" + (staticFloat ? " figma-deco-root--static-float" : "")}
      aria-hidden="true"
    >
      {/* left-line.svg — bottom-left viewport edge, Figma px size (no viewport scaling) */}
      <div style={vector2Box}>
        <img
          src={publicAsset("figma/left-line.svg")}
          alt=""
          style={{ display: "block", width: "100%", height: "100%", objectFit: "fill" }}
          width={273}
          height={344}
        />
      </div>
      <div className="figma-deco-artboard">
        {/* 891:7784 */}
        <div
          ref={setFloatRef(0)}
          className="figma-deco-float"
          style={{ position: "absolute", top: yt(250), left: xl(267.95), width: "28px", height: "28px" }}
        >
          <img
            src={publicAsset("figma/green-solid-plus.svg")}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            width={28}
            height={28}
          />
        </div>

        <div
          style={{
            position: "absolute",
            top: `${BLUE_OUTLINE_PLUS_FIGMA.y}px`,
            left: xl(BLUE_OUTLINE_PLUS_FIGMA.x),
          }}
        >
          <div
            style={{
              position: "relative",
              width: wv(29.117),
              height: hv(29.117),
            }}
          >
            <div
              ref={setFloatRef(1)}
              className="figma-deco-float"
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              <img src={publicAsset("figma/blue-outline-plus.svg")} alt="" style={fillImg} width={30} height={30} />
            </div>
            <div
              ref={setFloatRef(2)}
              className="figma-deco-float"
              style={solidCircleFromBlue}
            >
              <img src={publicAsset("figma/solid-circle.svg")} alt="" style={fillImg} width={14} height={14} />
            </div>
          </div>
        </div>

        <div
          ref={setFloatRef(3)}
          className="figma-deco-float"
          style={{ ...abs(316, 226, 26.95, 26.95), ...flex }}
        >
          <div
            style={{
              width: "22px",
              height: "22px",
              flexShrink: 0,
              transform: "rotate(-31.98deg)",
              transformOrigin: "center",
              position: "relative",
            }}
          >
            <img src={publicAsset("figma/pink-outline-plus.svg")} alt="" style={fillImg} width={22} height={22} />
          </div>
        </div>

        {/* Blue solid plus — same screen band as scattered pink (bottom left), same drift bounds */}
        <div
          ref={setFloatRef(11)}
          className="figma-deco-float"
          style={{ position: "absolute", top: "71%", left: "9%", width: 26, height: 26 }}
        >
          <img
            src={publicAsset("figma/blue-solid-plus.svg")}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            width={26}
            height={26}
          />
        </div>

        {/* white-pill.svg — Figma 34×316, no CSS rotation (orientation is in the asset) */}
        <div style={abs(659, 1265, 34, 316)}>
          <img
            src={publicAsset("figma/white-pill.svg")}
            alt=""
            style={fillImg}
            width={34}
            height={316}
          />
        </div>

        {/* black-pill.svg — Figma 34×157 */}
        <div style={abs(659, 1324, 34, 157)}>
          <img
            src={publicAsset("figma/black-pill.svg")}
            alt=""
            style={fillImg}
            width={34}
            height={157}
          />
        </div>

        <div
          style={{
            ...abs(487, -32, 141.922, 141.922),
            ...flex,
            transform: "rotate(294deg)",
            transformOrigin: "center",
          }}
        >
          <div
            style={{
              width: wv(122.539),
              height: hv(122.539),
              flexShrink: 0,
              transform: "rotate(80.02deg)",
              transformOrigin: "center",
              position: "relative",
            }}
          >
            <img src={publicAsset("figma/big-asterisk.svg")} alt="" style={fillImg} width={102} height={125} />
          </div>
        </div>

        <div ref={setFloatRef(4)} className="figma-deco-float" style={abs(226, 134, 26, 26)}>
          <img src={publicAsset("figma/outline-circle.svg")} alt="" style={fillImg} width={26} height={26} />
        </div>

        {/* Scattered copies: independent random motion (see rAF) */}
        {scatteredClones.map((c, sIdx) => {
          const s = c.size;
          const pos = scatterPos(c);
          const key = c.id;
          const refIdx = 5 + sIdx;
          if (c.kind === "green") {
            return (
              <div
                key={key}
                ref={setFloatRef(refIdx)}
                className="figma-deco-float"
                style={{ ...pos, width: s, height: s }}
              >
                <img
                  src={publicAsset("figma/green-solid-plus.svg")}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  width={s}
                  height={s}
                />
              </div>
            );
          }
          if (c.kind === "pinkSolid") {
            return (
              <div
                key={key}
                ref={setFloatRef(refIdx)}
                className="figma-deco-float"
                style={{ ...pos, width: s, height: s, pointerEvents: "none" }}
              >
                <img
                  src={publicAsset("figma/pink-solid-plus.svg")}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  width={s}
                  height={s}
                />
              </div>
            );
          }
          if (c.kind === "blue") {
            return (
              <div
                key={key}
                ref={setFloatRef(refIdx)}
                className="figma-deco-float"
                style={{ ...pos, width: s, height: s, pointerEvents: "none" }}
              >
                <img src={publicAsset("figma/blue-outline-plus.svg")} alt="" style={fillImg} width={s} height={s} />
              </div>
            );
          }
          if (c.kind === "solid") {
            return (
              <div
                key={key}
                ref={setFloatRef(refIdx)}
                className="figma-deco-float"
                style={{ ...pos, width: s, height: s }}
              >
                <img src={publicAsset("figma/solid-circle.svg")} alt="" style={fillImg} width={s} height={s} />
              </div>
            );
          }
          if (c.kind === "pink") {
            const r = c.rot ?? -32;
            return (
              <div
                key={key}
                ref={setFloatRef(refIdx)}
                className="figma-deco-float"
                style={{ ...pos, ...flex, width: s, height: s }}
              >
                <div
                  style={{
                    width: s,
                    height: s,
                    flexShrink: 0,
                    transform: `rotate(${r}deg)`,
                    transformOrigin: "center",
                    position: "relative",
                  }}
                >
                  <img src={publicAsset("figma/pink-outline-plus.svg")} alt="" style={fillImg} width={s} height={s} />
                </div>
              </div>
            );
          }
          return (
            <div
              key={key}
              ref={setFloatRef(refIdx)}
              className="figma-deco-float"
              style={{ ...pos, width: s, height: s }}
            >
              <img src={publicAsset("figma/outline-circle.svg")} alt="" style={fillImg} width={s} height={s} />
            </div>
          );
        })}

        <div style={vectorOuterBox}>
          <div style={vectorGroupInner}>
            <div style={vectorRotBox}>
              <img src={publicAsset("figma/right-line.svg")} alt="" style={vector1Img} width={222} height={324} />
            </div>
          </div>
          <div style={union4Wrap}>
            <div
              style={{
                width: `${UNION4_INNER_PX}px`,
                height: `${UNION4_INNER_PX}px`,
                flexShrink: 0,
                transform: "rotate(18.87deg)",
                transformOrigin: "center",
                position: "relative",
              }}
            >
              <img src={publicAsset("figma/small-asterisk.svg")} alt="" style={fillImg} width={54} height={54} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
