/**
 * Figma 891:7777 — all positions/sizes in artboard 1440×1024, expressed as
 * 100vw / 100dvh so decor stays pinned to the viewport (edges follow screen edges
 * on resize) instead of a pre-scaled centered artboard.
 */
import type { CSSProperties } from "react";

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

export function FigmaHomeDecor() {
  return (
    <div className="figma-deco-root" aria-hidden="true">
      {/* left-line.svg — bottom-left viewport edge, Figma px size (no viewport scaling) */}
      <div style={vector2Box}>
        <img
          src="/figma/left-line.svg"
          alt=""
          style={{ display: "block", width: "100%", height: "100%", objectFit: "fill" }}
          width={273}
          height={344}
        />
      </div>
      <div className="figma-deco-artboard">
        {/* 891:7784 */}
        <div style={{ position: "absolute", top: yt(250), left: xl(267.95), width: "28px", height: "28px" }}>
          <img
            src="/figma/green-solid-plus.svg"
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
            <img src="/figma/blue-outline-plus.svg" alt="" style={fillImg} width={30} height={30} />
            <div style={solidCircleFromBlue}>
              <img src="/figma/solid-circle.svg" alt="" style={fillImg} width={14} height={14} />
            </div>
          </div>
        </div>

        <div style={{ ...abs(316, 226, 26.95, 26.95), ...flex }}>
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
            <img src="/figma/pink-outline-plus.svg" alt="" style={fillImg} width={22} height={22} />
          </div>
        </div>

        {/* white-pill.svg — Figma 34×316, no CSS rotation (orientation is in the asset) */}
        <div style={abs(659, 1265, 34, 316)}>
          <img
            src="/figma/white-pill.svg"
            alt=""
            style={fillImg}
            width={34}
            height={316}
          />
        </div>

        {/* black-pill.svg — Figma 34×157 */}
        <div style={abs(659, 1324, 34, 157)}>
          <img
            src="/figma/black-pill.svg"
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
            <img src="/figma/big-asterisk.svg" alt="" style={fillImg} width={102} height={125} />
          </div>
        </div>

        <div style={abs(226, 134, 26, 26)}>
          <img src="/figma/outline-circle.svg" alt="" style={fillImg} width={26} height={26} />
        </div>

        <div style={vectorOuterBox}>
          <div style={vectorGroupInner}>
            <div style={vectorRotBox}>
              <img src="/figma/right-line.svg" alt="" style={vector1Img} width={222} height={324} />
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
              <img src="/figma/small-asterisk.svg" alt="" style={fillImg} width={54} height={54} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
